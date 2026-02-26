const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { loanApplicationValidation } = require('../middleware/validation.middleware');
const { calculateLoanPayment } = require('../utils/helpers');
const { Decimal } = require('decimal.js');

const router = express.Router();

// Get all user loans
router.get('/', authenticate, async (req, res, next) => {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: req.user.id },
      include: {
        payments: {
          orderBy: { dueDate: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ loans });
  } catch (error) {
    next(error);
  }
});

// Get loan by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id, userId: req.user.id },
      include: {
        payments: {
          orderBy: { dueDate: 'asc' }
        }
      }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

// Apply for loan
router.post('/apply', authenticate, loanApplicationValidation, async (req, res, next) => {
  try {
    const { amount, termMonths, purpose, currency = 'USD' } = req.body;

    // Calculate loan terms
    const interestRate = 8.99; // Annual interest rate (would be dynamic based on credit score)
    const monthlyPayment = calculateLoanPayment(amount, interestRate, termMonths);
    const totalRepayable = monthlyPayment.times(termMonths);

    const loan = await prisma.loan.create({
      data: {
        userId: req.user.id,
        amount: new Decimal(amount),
        currency,
        interestRate,
        termMonths,
        monthlyPayment,
        totalRepayable,
        purpose,
        status: 'PENDING'
      }
    });

    res.status(201).json({
      message: 'Loan application submitted successfully',
      loan: {
        id: loan.id,
        amount: loan.amount,
        currency: loan.currency,
        interestRate: loan.interestRate,
        termMonths: loan.termMonths,
        monthlyPayment: loan.monthlyPayment,
        totalRepayable: loan.totalRepayable,
        status: loan.status,
        createdAt: loan.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Make loan payment
router.post('/:id/repay', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { accountId } = req.body;

    const loan = await prisma.loan.findFirst({
      where: { id, userId: req.user.id },
      include: {
        payments: {
          where: { status: 'PENDING' },
          orderBy: { dueDate: 'asc' },
          take: 1
        }
      }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    if (loan.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Loan is not active' });
    }

    if (!loan.payments.length) {
      return res.status(400).json({ error: 'No pending payments' });
    }

    const payment = loan.payments[0];

    // Check account balance
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user.id },
      include: { balances: true }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (new Decimal(account.balances[0].available).lessThan(payment.amount)) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Process payment (in production, this would use transaction service)
    const updatedPayment = await prisma.loanPayment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        paidAt: new Date()
      }
    });

    // Check if loan is fully paid
    const remainingPayments = await prisma.loanPayment.count({
      where: { loanId: id, status: 'PENDING' }
    });

    if (remainingPayments === 0) {
      await prisma.loan.update({
        where: { id },
        data: { status: 'PAID_OFF' }
      });
    }

    res.json({
      message: 'Payment successful',
      payment: updatedPayment
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all loans
router.get('/admin/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (status) where.status = status;

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          },
          payments: {
            orderBy: { dueDate: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.loan.count({ where })
    ]);

    res.json({
      loans,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Approve/reject loan
router.patch('/admin/:id/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const loan = await prisma.loan.findUnique({
      where: { id }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    if (loan.status !== 'PENDING') {
      return res.status(400).json({ error: 'Loan has already been processed' });
    }

    const updateData = {
      status,
      approvedBy: req.user.id,
      approvedAt: new Date()
    };

    if (status === 'APPROVED') {
      updateData.disbursedAt = new Date();
      updateData.status = 'ACTIVE';

      // Create payment schedule
      const payments = [];
      const monthlyPayment = new Decimal(loan.monthlyPayment);
      const principalPerPayment = new Decimal(loan.amount).dividedBy(loan.termMonths);
      const interestPerPayment = monthlyPayment.minus(principalPerPayment);

      for (let i = 1; i <= loan.termMonths; i++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);

        payments.push({
          loanId: id,
          amount: monthlyPayment,
          principal: principalPerPayment,
          interest: interestPerPayment,
          dueDate,
          status: 'PENDING'
        });
      }

      await prisma.loanPayment.createMany({
        data: payments
      });

      // Disburse funds to user account
      // In production, this would create a transaction
    }

    const updated = await prisma.loan.update({
      where: { id },
      data: updateData
    });

    res.json({
      message: `Loan ${status.toLowerCase()} successfully`,
      loan: updated
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
