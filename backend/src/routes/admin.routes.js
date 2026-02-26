const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin, requireSuperAdmin } = require('../middleware/rbac.middleware');
const { balanceAdjustmentValidation } = require('../middleware/validation.middleware');
const ledgerService = require('../services/ledger.service');
const { Decimal } = require('decimal.js');

const router = express.Router();

// Get dashboard stats
router.get('/dashboard', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalTransactions,
      pendingTransactions,
      totalVolume,
      pendingLoans,
      openSupportTickets
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'PENDING' } }),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true }
      }),
      prisma.loan.count({ where: { status: 'PENDING' } }),
      prisma.supportMessage.count({
        where: { isFromUser: true, isRead: false }
      })
    ]);

    res.json({
      stats: {
        totalUsers,
        totalTransactions,
        pendingTransactions,
        totalVolume: totalVolume._sum.amount || 0,
        pendingLoans,
        openSupportTickets
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all users
router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    const where = { role: 'USER' };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status === 'frozen') where.isFrozen = true;
    if (status === 'active') where.isFrozen = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          accounts: {
            include: { balances: true }
          },
          profile: true,
          _count: {
            select: {
              transactions: true,
              loans: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isFrozen: user.isFrozen,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        profile: user.profile,
        accounts: user.accounts.map(acc => ({
          id: acc.id,
          type: acc.type,
          balance: acc.balances[0]?.available || 0
        })),
        stats: {
          transactions: user._count.transactions,
          loans: user._count.loans
        }
      })),
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

// Get user details
router.get('/users/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        accounts: {
          include: { balances: true }
        },
        profile: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        loans: {
          include: { payments: true },
          orderBy: { createdAt: 'desc' }
        },
        cards: true,
        portfolio: {
          include: {
            positions: {
              include: { asset: true }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Freeze/unfreeze user
router.patch('/users/:id/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isFrozen, reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot modify super admin' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isFrozen }
    });

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user.id,
        action: isFrozen ? 'USER_FROZEN' : 'USER_UNFROZEN',
        targetType: 'USER',
        targetId: id,
        oldValue: { isFrozen: user.isFrozen },
        newValue: { isFrozen },
        reason,
        ipAddress: req.ip
      }
    });

    res.json({
      message: `User ${isFrozen ? 'frozen' : 'unfrozen'} successfully`,
      user: updated
    });
  } catch (error) {
    next(error);
  }
});

// Adjust user balance
router.patch('/users/:id/balance', authenticate, requireAdmin, balanceAdjustmentValidation, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { accountId, amount, reason } = req.body;

    const decimalAmount = new Decimal(amount);

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: id },
      include: { balances: true }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const oldBalance = account.balances[0].available;

    // Get system account
    const systemAccount = await prisma.account.findFirst({
      where: {
        type: account.type,
        user: { role: 'SUPER_ADMIN' }
      }
    });

    if (!systemAccount) {
      return res.status(500).json({ error: 'System account not found' });
    }

    // Create transaction and ledger entry
    const transactionType = decimalAmount.greaterThan(0) ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT';

    await prisma.$transaction(async (tx) => {
      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          userId: id,
          accountId,
          type: transactionType,
          amount: decimalAmount.abs(),
          currency: account.type,
          status: 'COMPLETED',
          description: `Admin balance adjustment: ${reason}`,
          processedAt: new Date(),
          completedAt: new Date()
        }
      });

      // Create ledger entry
      if (decimalAmount.greaterThan(0)) {
        // Credit user account
        await ledgerService.createDoubleEntry(tx, {
          debitAccountId: systemAccount.id,
          creditAccountId: accountId,
          amount: decimalAmount,
          transactionId: transaction.id,
          description: `Admin credit: ${reason}`
        });
      } else {
        // Debit user account
        await ledgerService.createDoubleEntry(tx, {
          debitAccountId: accountId,
          creditAccountId: systemAccount.id,
          amount: decimalAmount.abs(),
          transactionId: transaction.id,
          description: `Admin debit: ${reason}`
        });
      }
    });

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user.id,
        action: 'BALANCE_ADJUSTMENT',
        targetType: 'ACCOUNT',
        targetId: accountId,
        oldValue: { balance: oldBalance },
        newValue: { balance: oldBalance.plus(decimalAmount) },
        reason,
        ipAddress: req.ip
      }
    });

    res.json({
      message: 'Balance adjusted successfully',
      adjustment: {
        accountId,
        amount: decimalAmount,
        oldBalance,
        newBalance: oldBalance.plus(decimalAmount)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all transactions
router.get('/transactions', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          },
          account: {
            select: { type: true, accountNumber: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.transaction.count({ where })
    ]);

    res.json({
      transactions,
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

// Process pending transaction
router.post('/transactions/:id/process', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    const transaction = await prisma.transaction.findUnique({
      where: { id }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ error: 'Transaction is not pending' });
    }

    let newStatus;
    if (action === 'approve') {
      newStatus = 'COMPLETED';
    } else if (action === 'reject') {
      newStatus = 'FAILED';
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        status: newStatus,
        processedAt: new Date(),
        completedAt: newStatus === 'COMPLETED' ? new Date() : null,
        failedReason: newStatus === 'FAILED' ? reason : null
      }
    });

    await prisma.transactionStatusHistory.create({
      data: {
        transactionId: id,
        status: newStatus,
        changedBy: req.user.id,
        reason: reason || `Manually ${action}ed by admin`
      }
    });

    res.json({
      message: `Transaction ${action}ed successfully`,
      transaction: updated
    });
  } catch (error) {
    next(error);
  }
});

// Get ledger entries
router.get('/ledger', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { accountId, page = 1, limit = 50 } = req.query;

    const where = {};
    if (accountId) where.accountId = accountId;

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          account: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true }
              }
            }
          },
          transaction: {
            select: { type: true, status: true }
          }
        },
        orderBy: { entryDate: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.ledgerEntry.count({ where })
    ]);

    res.json({
      entries,
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

// Get admin logs
router.get('/logs', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        include: {
          admin: {
            select: { id: true, email: true, fullName: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.adminLog.count()
    ]);

    res.json({
      logs,
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

module.exports = router;
