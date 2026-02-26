const { Decimal } = require('decimal.js');
const { prisma } = require('../config/database');
const ledgerService = require('./ledger.service');
const notificationService = require('./notification.service');

class TransactionService {
  constructor() {
    this.processingQueue = new Map();
  }

  async initiateDeposit(userId, accountId, amount, method, metadata = {}) {
    const decimalAmount = new Decimal(amount);

    // Get account details
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Create pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        type: 'DEPOSIT',
        amount: decimalAmount,
        currency: account.type,
        status: 'PENDING',
        description: `Deposit via ${method}`,
        metadata: {
          depositMethod: method,
          ...metadata
        }
      }
    });

    // Create status history
    await prisma.transactionStatusHistory.create({
      data: {
        transactionId: transaction.id,
        status: 'PENDING',
        changedBy: 'SYSTEM',
        reason: 'Deposit initiated'
      }
    });

    // Queue for async processing
    this.queueTransaction(transaction.id);

    // Notify user
    await notificationService.sendTransactionNotification(userId, {
      type: 'DEPOSIT',
      amount: decimalAmount,
      currency: account.type,
      status: 'PENDING'
    });

    return transaction;
  }

  async initiateWithdrawal(userId, accountId, amount, destination, metadata = {}) {
    const decimalAmount = new Decimal(amount);

    // Get account with balance
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
      include: { balances: true }
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Check sufficient funds
    const balance = account.balances[0];
    if (new Decimal(balance.available).lessThan(decimalAmount)) {
      throw new Error('Insufficient funds');
    }

    // Create pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        accountId,
        type: 'WITHDRAWAL',
        amount: decimalAmount,
        currency: account.type,
        status: 'PENDING',
        description: `Withdrawal to ${destination}`,
        metadata: {
          destination,
          ...metadata
        }
      }
    });

    // Create status history
    await prisma.transactionStatusHistory.create({
      data: {
        transactionId: transaction.id,
        status: 'PENDING',
        changedBy: 'SYSTEM',
        reason: 'Withdrawal initiated'
      }
    });

    // Queue for async processing
    this.queueTransaction(transaction.id);

    return transaction;
  }

  async initiateTransfer(userId, fromAccountId, toAccountNumber, amount, description = '') {
    const decimalAmount = new Decimal(amount);

    // Get source account
    const fromAccount = await prisma.account.findFirst({
      where: { id: fromAccountId, userId },
      include: { balances: true, user: true }
    });

    if (!fromAccount) {
      throw new Error('Source account not found');
    }

    // Check sufficient funds
    const balance = fromAccount.balances[0];
    if (new Decimal(balance.available).lessThan(decimalAmount)) {
      throw new Error('Insufficient funds');
    }

    // Get destination account
    const toAccount = await prisma.account.findUnique({
      where: { accountNumber: toAccountNumber },
      include: { user: true }
    });

    if (!toAccount) {
      throw new Error('Destination account not found');
    }

    if (fromAccount.type !== toAccount.type) {
      throw new Error('Cannot transfer between different currency types');
    }

    // Execute transfer atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create transaction record for sender
      const senderTransaction = await tx.transaction.create({
        data: {
          userId,
          accountId: fromAccountId,
          type: 'TRANSFER_INTERNAL',
          amount: decimalAmount,
          currency: fromAccount.type,
          status: 'PROCESSING',
          description: `Transfer to ${toAccountNumber}: ${description}`,
          metadata: {
            toAccountNumber,
            toUserId: toAccount.userId,
            description
          }
        }
      });

      // Create ledger entries
      await ledgerService.createDoubleEntry(tx, {
        debitAccountId: fromAccountId,
        creditAccountId: toAccount.id,
        amount: decimalAmount,
        transactionId: senderTransaction.id,
        description: `Internal transfer: ${description}`
      });

      // Update transaction status
      await tx.transaction.update({
        where: { id: senderTransaction.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          completedAt: new Date()
        }
      });

      // Create status history
      await tx.transactionStatusHistory.create({
        data: {
          transactionId: senderTransaction.id,
          status: 'COMPLETED',
          changedBy: 'SYSTEM',
          reason: 'Transfer completed'
        }
      });

      return senderTransaction;
    });

    // Notify both parties
    await notificationService.sendTransactionNotification(userId, {
      type: 'TRANSFER_SENT',
      amount: decimalAmount,
      currency: fromAccount.type,
      status: 'COMPLETED',
      recipient: toAccount.user.fullName
    });

    await notificationService.sendTransactionNotification(toAccount.userId, {
      type: 'TRANSFER_RECEIVED',
      amount: decimalAmount,
      currency: toAccount.type,
      status: 'COMPLETED',
      sender: fromAccount.user.fullName
    });

    return result;
  }

  async processTransaction(transactionId) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { account: { include: { balances: true } } }
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== 'PENDING') {
      return transaction;
    }

    // Update to processing
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'PROCESSING' }
    });

    try {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (transaction.type === 'DEPOSIT') {
        await this.processDeposit(transaction);
      } else if (transaction.type === 'WITHDRAWAL') {
        await this.processWithdrawal(transaction);
      }

      // Update to completed
      const completed = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          completedAt: new Date()
        }
      });

      // Create status history
      await prisma.transactionStatusHistory.create({
        data: {
          transactionId,
          status: 'COMPLETED',
          changedBy: 'SYSTEM',
          reason: 'Transaction processed successfully'
        }
      });

      // Notify user
      await notificationService.sendTransactionNotification(transaction.userId, {
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'COMPLETED'
      });

      return completed;

    } catch (error) {
      // Update to failed
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'FAILED',
          failedReason: error.message
        }
      });

      await prisma.transactionStatusHistory.create({
        data: {
          transactionId,
          status: 'FAILED',
          changedBy: 'SYSTEM',
          reason: error.message
        }
      });

      throw error;
    }
  }

  async processDeposit(transaction) {
    // Find or create system account for this currency
    let systemAccount = await prisma.account.findFirst({
      where: { 
        type: transaction.currency,
        user: { role: 'SUPER_ADMIN' }
      }
    });

    if (!systemAccount) {
      // Create system account if doesn't exist
      const systemUser = await prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' }
      });

      if (systemUser) {
        systemAccount = await prisma.account.create({
          data: {
            userId: systemUser.id,
            type: transaction.currency,
            accountNumber: `${transaction.currency}-SYSTEM-001`,
            balances: {
              create: {
                available: 999999999.99999999 // Large balance for system
              }
            }
          }
        });
      }
    }

    if (systemAccount) {
      await prisma.$transaction(async (tx) => {
        await ledgerService.createDoubleEntry(tx, {
          debitAccountId: systemAccount.id,
          creditAccountId: transaction.accountId,
          amount: transaction.amount,
          transactionId: transaction.id,
          description: `Deposit processed via ${transaction.metadata?.depositMethod || 'unknown'}`
        });
      });
    }
  }

  async processWithdrawal(transaction) {
    // Similar to deposit but reverse the flow
    let systemAccount = await prisma.account.findFirst({
      where: { 
        type: transaction.currency,
        user: { role: 'SUPER_ADMIN' }
      }
    });

    if (systemAccount) {
      await prisma.$transaction(async (tx) => {
        await ledgerService.createDoubleEntry(tx, {
          debitAccountId: transaction.accountId,
          creditAccountId: systemAccount.id,
          amount: transaction.amount,
          transactionId: transaction.id,
          description: `Withdrawal to ${transaction.metadata?.destination || 'external'}`
        });
      });
    }
  }

  queueTransaction(transactionId) {
    // In production, this would use a proper job queue like Bull/BullMQ
    // For now, process immediately with a delay
    setTimeout(() => {
      this.processTransaction(transactionId).catch(console.error);
    }, 2000);
  }

  async getTransactions(userId, options = {}) {
    const { page = 1, limit = 20, type, status, startDate, endDate } = options;

    const where = { userId };

    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          account: {
            select: {
              type: true,
              accountNumber: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.transaction.count({ where })
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getTransactionById(transactionId, userId) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId
      },
      include: {
        account: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' }
        },
        ledgerEntries: true
      }
    });

    return transaction;
  }
}

module.exports = new TransactionService();
