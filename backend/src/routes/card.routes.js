const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { cardLimitValidation } = require('../middleware/validation.middleware');
const { encrypt, decrypt, generateCardNumber, generateCVV, maskCardNumber, hashForLookup } = require('../utils/encryption');
const { Decimal } = require('decimal.js');

const router = express.Router();

// Get all cards
router.get('/', authenticate, async (req, res, next) => {
  try {
    const cards = await prisma.card.findMany({
      where: { userId: req.user.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { issuedAt: 'desc' }
    });

    res.json({
      cards: cards.map(card => ({
        id: card.id,
        cardNumber: maskCardNumber(decrypt(card.cardNumber)),
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardholderName: card.cardholderName,
        type: card.type,
        status: card.status,
        dailyLimit: card.dailyLimit,
        monthlyLimit: card.monthlyLimit,
        issuedAt: card.issuedAt,
        frozenAt: card.frozenAt,
        recentTransactions: card.transactions
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Create new virtual card
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { accountId, type = 'VIRTUAL' } = req.body;

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Generate card details
    const cardNumber = generateCardNumber();
    const cvv = generateCVV();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 3);

    const card = await prisma.card.create({
      data: {
        userId: req.user.id,
        accountId,
        cardNumber: encrypt(cardNumber),
        cardNumberHash: hashForLookup(cardNumber),
        cvv: encrypt(cvv),
        expiryMonth: String(expiryDate.getMonth() + 1).padStart(2, '0'),
        expiryYear: String(expiryDate.getFullYear()),
        cardholderName: req.user.fullName.toUpperCase(),
        type,
        status: 'ACTIVE',
        dailyLimit: 10000,
        monthlyLimit: 50000
      }
    });

    res.status(201).json({
      message: 'Card created successfully',
      card: {
        id: card.id,
        cardNumber: maskCardNumber(cardNumber),
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardholderName: card.cardholderName,
        type: card.type,
        status: card.status,
        dailyLimit: card.dailyLimit,
        monthlyLimit: card.monthlyLimit
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get card details (with decrypted CVV)
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const card = await prisma.card.findFirst({
      where: { id, userId: req.user.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({
      card: {
        id: card.id,
        cardNumber: maskCardNumber(decrypt(card.cardNumber)),
        cvv: decrypt(card.cvv),
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardholderName: card.cardholderName,
        type: card.type,
        status: card.status,
        dailyLimit: card.dailyLimit,
        monthlyLimit: card.monthlyLimit,
        issuedAt: card.issuedAt,
        frozenAt: card.frozenAt,
        transactions: card.transactions
      }
    });
  } catch (error) {
    next(error);
  }
});

// Freeze/unfreeze card
router.patch('/:id/freeze', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { freeze } = req.body;

    const card = await prisma.card.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const updated = await prisma.card.update({
      where: { id },
      data: {
        status: freeze ? 'FROZEN' : 'ACTIVE',
        frozenAt: freeze ? new Date() : null
      }
    });

    res.json({
      message: `Card ${freeze ? 'frozen' : 'unfrozen'} successfully`,
      card: {
        id: updated.id,
        status: updated.status,
        frozenAt: updated.frozenAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update card limits
router.patch('/:id/limits', authenticate, cardLimitValidation, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dailyLimit, monthlyLimit } = req.body;

    const card = await prisma.card.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const updateData = {};
    if (dailyLimit !== undefined) updateData.dailyLimit = new Decimal(dailyLimit);
    if (monthlyLimit !== undefined) updateData.monthlyLimit = new Decimal(monthlyLimit);

    const updated = await prisma.card.update({
      where: { id },
      data: updateData
    });

    res.json({
      message: 'Card limits updated',
      card: {
        id: updated.id,
        dailyLimit: updated.dailyLimit,
        monthlyLimit: updated.monthlyLimit
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get card transactions
router.get('/:id/transactions', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const card = await prisma.card.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const [transactions, total] = await Promise.all([
      prisma.cardTransaction.findMany({
        where: { cardId: id },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.cardTransaction.count({ where: { cardId: id } })
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

// Cancel card
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const card = await prisma.card.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    await prisma.card.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.json({ message: 'Card cancelled successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
