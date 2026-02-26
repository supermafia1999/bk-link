const { Decimal } = require('decimal.js');
const { prisma } = require('../config/database');

class LedgerService {
  async createDoubleEntry(prismaTx, { debitAccountId, creditAccountId, amount, transactionId, description }) {
    const decimalAmount = new Decimal(amount);

    // Get current balances
    const debitAccount = await prismaTx.account.findUnique({
      where: { id: debitAccountId },
      include: { balances: true }
    });
    
    const creditAccount = await prismaTx.account.findUnique({
      where: { id: creditAccountId },
      include: { balances: true }
    });

    if (!debitAccount || !creditAccount) {
      throw new Error('Invalid accounts for ledger entry');
    }

    if (!debitAccount.balances.length || !creditAccount.balances.length) {
      throw new Error('Accounts must have balances');
    }

    const debitBalance = debitAccount.balances[0];
    const creditBalance = creditAccount.balances[0];

    // Validate sufficient funds for debit
    if (new Decimal(debitBalance.available).lessThan(decimalAmount)) {
      throw new Error('Insufficient funds');
    }

    // Create DEBIT entry (decreases balance)
    const debitEntry = await prismaTx.ledgerEntry.create({
      data: {
        transactionId,
        accountId: debitAccountId,
        entryType: 'DEBIT',
        amount: decimalAmount,
        runningBalance: new Decimal(debitBalance.available).minus(decimalAmount),
        description: description || 'Debit entry'
      }
    });

    // Create CREDIT entry (increases balance)
    const creditEntry = await prismaTx.ledgerEntry.create({
      data: {
        transactionId,
        accountId: creditAccountId,
        entryType: 'CREDIT',
        amount: decimalAmount,
        runningBalance: new Decimal(creditBalance.available).plus(decimalAmount),
        description: description || 'Credit entry'
      }
    });

    // Update balances
    await prismaTx.balance.update({
      where: { id: debitBalance.id },
      data: { 
        available: new Decimal(debitBalance.available).minus(decimalAmount),
        lastUpdated: new Date()
      }
    });

    await prismaTx.balance.update({
      where: { id: creditBalance.id },
      data: { 
        available: new Decimal(creditBalance.available).plus(decimalAmount),
        lastUpdated: new Date()
      }
    });

    return { debitEntry, creditEntry };
  }

  async getAccountBalance(accountId) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { entryDate: 'desc' },
      take: 1
    });
    
    return entries[0]?.runningBalance || new Decimal(0);
  }

  async getLedgerHistory(accountId, options = {}) {
    const { page = 1, limit = 20, startDate, endDate } = options;
    
    const where = { accountId };
    
    if (startDate || endDate) {
      where.entryDate = {};
      if (startDate) where.entryDate.gte = new Date(startDate);
      if (endDate) where.entryDate.lte = new Date(endDate);
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          transaction: {
            select: {
              type: true,
              status: true,
              description: true
            }
          }
        },
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.ledgerEntry.count({ where })
    ]);

    return {
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async verifyLedgerIntegrity(accountId) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { entryDate: 'asc' }
    });

    let expectedBalance = new Decimal(0);
    const discrepancies = [];

    for (const entry of entries) {
      if (entry.entryType === 'DEBIT') {
        expectedBalance = expectedBalance.minus(entry.amount);
      } else {
        expectedBalance = expectedBalance.plus(entry.amount);
      }

      if (!expectedBalance.equals(entry.runningBalance)) {
        discrepancies.push({
          entryId: entry.id,
          expected: expectedBalance.toString(),
          actual: entry.runningBalance.toString()
        });
      }
    }

    return {
      isValid: discrepancies.length === 0,
      discrepancies,
      finalBalance: expectedBalance.toString()
    };
  }
}

module.exports = new LedgerService();
