const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { depositValidation } = require('../middleware/validation.middleware');
const transactionService = require('../services/transaction.service');

const router = express.Router();

// Get all transactions
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, status, startDate, endDate } = req.query;

    const result = await transactionService.getTransactions(req.user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      status,
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get transaction by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const transaction = await transactionService.getTransactionById(id, req.user.id);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ transaction });
  } catch (error) {
    next(error);
  }
});

// Initiate deposit
router.post('/deposit', authenticate, depositValidation, async (req, res, next) => {
  try {
    const { accountId, amount, method, metadata } = req.body;

    const transaction = await transactionService.initiateDeposit(
      req.user.id,
      accountId,
      amount,
      method,
      metadata
    );

    res.status(201).json({
      message: 'Deposit initiated successfully',
      transaction
    });
  } catch (error) {
    next(error);
  }
});

// Initiate withdrawal
router.post('/withdraw', authenticate, async (req, res, next) => {
  try {
    const { accountId, amount, destination, metadata } = req.body;

    if (!accountId || !amount || !destination) {
      return res.status(400).json({ error: 'Account ID, amount, and destination are required' });
    }

    const transaction = await transactionService.initiateWithdrawal(
      req.user.id,
      accountId,
      amount,
      destination,
      metadata
    );

    res.status(201).json({
      message: 'Withdrawal initiated successfully',
      transaction
    });
  } catch (error) {
    next(error);
  }
});

// Get deposit addresses (for crypto deposits)
router.get('/deposit-addresses', authenticate, async (req, res, next) => {
  try {
    // In production, these would be generated or retrieved from a crypto service
    const addresses = {
      BTC: {
        address: 'bc1qxrp5ytlhkyu6dlthqak65fzva46j200mm66t82',
        network: 'Bitcoin',
        confirmationsRequired: 3
      },
      ETH: {
        address: '0xDC18CC2b3386C65d9c15db4da20733B35aF34FF8',
        network: 'Ethereum (ERC-20)',
        confirmationsRequired: 12
      },
      USDT: {
        address: '0xDC18CC2b3386C65d9c15db4da20733B35aF34FF8',
        network: 'Ethereum (ERC-20)',
        confirmationsRequired: 12
      }
    };

    res.json({ addresses });
  } catch (error) {
    next(error);
  }
});

// Cancel pending transaction
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const transaction = await prisma.transaction.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ 
        error: 'Cannot cancel transaction',
        message: `Transaction is ${transaction.status.toLowerCase()}`
      });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    await prisma.transactionStatusHistory.create({
      data: {
        transactionId: id,
        status: 'CANCELLED',
        changedBy: req.user.id,
        reason: 'Cancelled by user'
      }
    });

    res.json({
      message: 'Transaction cancelled',
      transaction: updated
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
