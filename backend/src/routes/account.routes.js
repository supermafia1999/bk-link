const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const ledgerService = require('../services/ledger.service');
const { transferValidation } = require('../middleware/validation.middleware');
const transactionService = require('../services/transaction.service');

const router = express.Router();

// Get all user accounts
router.get('/', authenticate, async (req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user.id },
      include: { balances: true },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      accounts: accounts.map(acc => ({
        id: acc.id,
        type: acc.type,
        accountNumber: acc.accountNumber,
        isActive: acc.isActive,
        createdAt: acc.createdAt,
        balance: {
          available: acc.balances[0]?.available || 0,
          pending: acc.balances[0]?.pending || 0,
          reserved: acc.balances[0]?.reserved || 0
        }
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get specific account
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const account = await prisma.account.findFirst({
      where: { id, userId: req.user.id },
      include: { balances: true }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      account: {
        id: account.id,
        type: account.type,
        accountNumber: account.accountNumber,
        isActive: account.isActive,
        createdAt: account.createdAt,
        balance: {
          available: account.balances[0]?.available || 0,
          pending: account.balances[0]?.pending || 0,
          reserved: account.balances[0]?.reserved || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get account balance
router.get('/:id/balance', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const account = await prisma.account.findFirst({
      where: { id, userId: req.user.id },
      include: { balances: true }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      accountId: account.id,
      type: account.type,
      balance: {
        available: account.balances[0]?.available || 0,
        pending: account.balances[0]?.pending || 0,
        reserved: account.balances[0]?.reserved || 0,
        lastUpdated: account.balances[0]?.lastUpdated
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get account ledger
router.get('/:id/ledger', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const result = await ledgerService.getLedgerHistory(id, {
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Internal transfer
router.post('/transfer', authenticate, transferValidation, async (req, res, next) => {
  try {
    const { fromAccountId, toAccountNumber, amount, description } = req.body;

    const result = await transactionService.initiateTransfer(
      req.user.id,
      fromAccountId,
      toAccountNumber,
      amount,
      description
    );

    res.json({
      message: 'Transfer completed successfully',
      transaction: result
    });
  } catch (error) {
    next(error);
  }
});

// Verify account number exists
router.get('/verify/:accountNumber', authenticate, async (req, res, next) => {
  try {
    const { accountNumber } = req.params;

    const account = await prisma.account.findUnique({
      where: { accountNumber },
      include: { user: { select: { fullName: true } } }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      exists: true,
      accountNumber: account.accountNumber,
      type: account.type,
      holderName: account.user.fullName
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
