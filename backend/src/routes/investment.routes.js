const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { tradeValidation } = require('../middleware/validation.middleware');
const { Decimal } = require('decimal.js');

const router = express.Router();

// Get all assets
router.get('/assets', authenticate, async (req, res, next) => {
  try {
    const { type, category, search } = req.query;

    const where = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const assets = await prisma.asset.findMany({
      where,
      orderBy: { symbol: 'asc' }
    });

    res.json({ assets });
  } catch (error) {
    next(error);
  }
});

// Get asset by ID
router.get('/assets/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id }
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ asset });
  } catch (error) {
    next(error);
  }
});

// Get asset price history
router.get('/assets/:id/history', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { period = '1d' } = req.query;

    const asset = await prisma.asset.findUnique({
      where: { id }
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 1);
    }

    const history = await prisma.priceSnapshot.findMany({
      where: {
        assetId: id,
        timestamp: { gte: startDate }
      },
      orderBy: { timestamp: 'asc' }
    });

    res.json({ history });
  } catch (error) {
    next(error);
  }
});

// Get user portfolio
router.get('/portfolio', authenticate, async (req, res, next) => {
  try {
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId: req.user.id },
      include: {
        positions: {
          include: { asset: true }
        }
      }
    });

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json({ portfolio });
  } catch (error) {
    next(error);
  }
});

// Buy asset
router.post('/portfolio/buy', authenticate, tradeValidation, async (req, res, next) => {
  try {
    const { assetId, quantity, accountId } = req.body;
    const decimalQuantity = new Decimal(quantity);

    // Get asset
    const asset = await prisma.asset.findUnique({
      where: { id: assetId }
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get user account
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.user.id },
      include: { balances: true }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Calculate total cost
    const price = new Decimal(asset.currentPrice);
    const totalCost = price.times(decimalQuantity);

    // Check sufficient funds
    if (new Decimal(account.balances[0].available).lessThan(totalCost)) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Execute purchase
    const result = await prisma.$transaction(async (tx) => {
      // Get or create portfolio
      let portfolio = await tx.portfolio.findUnique({
        where: { userId: req.user.id }
      });

      if (!portfolio) {
        portfolio = await tx.portfolio.create({
          data: { userId: req.user.id }
        });
      }

      // Get or create position
      let position = await tx.position.findUnique({
        where: {
          portfolioId_assetId: {
            portfolioId: portfolio.id,
            assetId
          }
        }
      });

      if (position) {
        // Update existing position
        const newQuantity = new Decimal(position.quantity).plus(decimalQuantity);
        const newTotalCost = new Decimal(position.avgCost).times(position.quantity).plus(totalCost);
        const newAvgCost = newTotalCost.dividedBy(newQuantity);
        const newCurrentValue = price.times(newQuantity);
        const newUnrealizedPnL = newCurrentValue.minus(newTotalCost);

        position = await tx.position.update({
          where: { id: position.id },
          data: {
            quantity: newQuantity,
            avgCost: newAvgCost,
            currentValue: newCurrentValue,
            unrealizedPnL: newUnrealizedPnL
          }
        });
      } else {
        // Create new position
        position = await tx.position.create({
          data: {
            portfolioId: portfolio.id,
            assetId,
            quantity: decimalQuantity,
            avgCost: price,
            currentValue: totalCost,
            unrealizedPnL: 0
          }
        });
      }

      // Update portfolio totals
      const allPositions = await tx.position.findMany({
        where: { portfolioId: portfolio.id }
      });

      const totalValue = allPositions.reduce((sum, p) => sum.plus(p.currentValue), new Decimal(0));
      const totalCostBasis = allPositions.reduce((sum, p) => 
        sum.plus(new Decimal(p.avgCost).times(p.quantity)), new Decimal(0));
      const totalUnrealizedPnL = totalValue.minus(totalCostBasis);

      await tx.portfolio.update({
        where: { id: portfolio.id },
        data: {
          totalValue,
          totalCost: totalCostBasis,
          unrealizedPnL: totalUnrealizedPnL
        }
      });

      // Deduct from account balance
      await tx.balance.update({
        where: { id: account.balances[0].id },
        data: {
          available: new Decimal(account.balances[0].available).minus(totalCost)
        }
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId: req.user.id,
          accountId,
          type: 'INVESTMENT_BUY',
          amount: totalCost,
          currency: account.type,
          status: 'COMPLETED',
          description: `Buy ${decimalQuantity} ${asset.symbol}`,
          metadata: {
            assetId,
            assetSymbol: asset.symbol,
            quantity: decimalQuantity,
            price
          },
          processedAt: new Date(),
          completedAt: new Date()
        }
      });

      return { position, transaction };
    });

    res.json({
      message: 'Purchase successful',
      position: result.position,
      transaction: result.transaction
    });
  } catch (error) {
    next(error);
  }
});

// Sell asset
router.post('/portfolio/sell', authenticate, tradeValidation, async (req, res, next) => {
  try {
    const { assetId, quantity, accountId } = req.body;
    const decimalQuantity = new Decimal(quantity);

    // Get portfolio and position
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId: req.user.id },
      include: {
        positions: {
          where: { assetId }
        }
      }
    });

    if (!portfolio || !portfolio.positions.length) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const position = portfolio.positions[0];

    if (new Decimal(position.quantity).lessThan(decimalQuantity)) {
      return res.status(400).json({ error: 'Insufficient position quantity' });
    }

    // Get asset and account
    const [asset, account] = await Promise.all([
      prisma.asset.findUnique({ where: { id: assetId } }),
      prisma.account.findFirst({
        where: { id: accountId, userId: req.user.id },
        include: { balances: true }
      })
    ]);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Calculate sale proceeds
    const price = new Decimal(asset.currentPrice);
    const proceeds = price.times(decimalQuantity);
    const costBasis = new Decimal(position.avgCost).times(decimalQuantity);
    const realizedPnL = proceeds.minus(costBasis);

    // Execute sale
    const result = await prisma.$transaction(async (tx) => {
      const remainingQuantity = new Decimal(position.quantity).minus(decimalQuantity);

      if (remainingQuantity.isZero()) {
        // Close position
        await tx.position.delete({
          where: { id: position.id }
        });
      } else {
        // Update position
        const newCurrentValue = price.times(remainingQuantity);
        const totalCostBasis = new Decimal(position.avgCost).times(remainingQuantity);
        const newUnrealizedPnL = newCurrentValue.minus(totalCostBasis);

        await tx.position.update({
          where: { id: position.id },
          data: {
            quantity: remainingQuantity,
            currentValue: newCurrentValue,
            unrealizedPnL: newUnrealizedPnL
          }
        });
      }

      // Update portfolio
      const allPositions = await tx.position.findMany({
        where: { portfolioId: portfolio.id }
      });

      const totalValue = allPositions.reduce((sum, p) => sum.plus(p.currentValue), new Decimal(0));
      const totalCostBasis = allPositions.reduce((sum, p) => 
        sum.plus(new Decimal(p.avgCost).times(p.quantity)), new Decimal(0));
      const totalUnrealizedPnL = totalValue.minus(totalCostBasis);

      await tx.portfolio.update({
        where: { id: portfolio.id },
        data: {
          totalValue,
          totalCost: totalCostBasis,
          unrealizedPnL: totalUnrealizedPnL
        }
      });

      // Add proceeds to account
      await tx.balance.update({
        where: { id: account.balances[0].id },
        data: {
          available: new Decimal(account.balances[0].available).plus(proceeds)
        }
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId: req.user.id,
          accountId,
          type: 'INVESTMENT_SELL',
          amount: proceeds,
          currency: account.type,
          status: 'COMPLETED',
          description: `Sell ${decimalQuantity} ${asset.symbol}`,
          metadata: {
            assetId,
            assetSymbol: asset.symbol,
            quantity: decimalQuantity,
            price,
            realizedPnL
          },
          processedAt: new Date(),
          completedAt: new Date()
        }
      });

      return { transaction, realizedPnL };
    });

    res.json({
      message: 'Sale successful',
      proceeds,
      realizedPnL: result.realizedPnL,
      transaction: result.transaction
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Create/update asset
router.post('/admin/assets', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { symbol, name, type, category, currentPrice } = req.body;

    const asset = await prisma.asset.upsert({
      where: { symbol },
      update: {
        name,
        type,
        category,
        currentPrice: new Decimal(currentPrice)
      },
      create: {
        symbol,
        name,
        type,
        category,
        currentPrice: new Decimal(currentPrice),
        dayChange: 0
      }
    });

    res.json({ asset });
  } catch (error) {
    next(error);
  }
});

// Admin: Update asset price
router.patch('/admin/assets/:id/price', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { price, dayChange } = req.body;

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        currentPrice: new Decimal(price),
        dayChange: dayChange !== undefined ? new Decimal(dayChange) : undefined
      }
    });

    // Create price snapshot
    await prisma.priceSnapshot.create({
      data: {
        assetId: id,
        price: new Decimal(price),
        volume: 0
      }
    });

    res.json({ asset });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
