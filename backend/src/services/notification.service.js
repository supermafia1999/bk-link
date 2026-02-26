const { sendEmail, emailTemplates } = require('../config/email');
const { prisma } = require('../config/database');
const { formatCurrency } = require('../utils/helpers');

class NotificationService {
  async sendEmailNotification(userId, template, data) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true }
      });

      if (!user) return;

      const templateData = emailTemplates[template](user.fullName, ...data);
      await sendEmail(user.email, templateData.subject, templateData.html, templateData.text);
    } catch (error) {
      console.error('Email notification error:', error);
    }
  }

  async sendTransactionNotification(userId, { type, amount, currency, status, recipient, sender }) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true }
      });

      if (!user) return;

      const formattedAmount = formatCurrency(amount, currency);
      
      let subject = `Transaction ${status}`;
      let html = '';

      switch (type) {
        case 'DEPOSIT':
          subject = `Deposit ${status} - Space X KB Private Bank`;
          html = this.getDepositEmailTemplate(user.fullName, formattedAmount, currency, status);
          break;
        case 'WITHDRAWAL':
          subject = `Withdrawal ${status} - Space X KB Private Bank`;
          html = this.getWithdrawalEmailTemplate(user.fullName, formattedAmount, currency, status);
          break;
        case 'TRANSFER_SENT':
          subject = `Transfer Sent - Space X KB Private Bank`;
          html = this.getTransferSentEmailTemplate(user.fullName, formattedAmount, currency, recipient);
          break;
        case 'TRANSFER_RECEIVED':
          subject = `Transfer Received - Space X KB Private Bank`;
          html = this.getTransferReceivedEmailTemplate(user.fullName, formattedAmount, currency, sender);
          break;
        default:
          html = this.getGenericTransactionTemplate(user.fullName, type, formattedAmount, currency, status);
      }

      await sendEmail(user.email, subject, html, `${type}: ${formattedAmount} ${currency} - ${status}`);

      // Also create in-app notification
      await this.createInAppNotification(userId, {
        type: 'TRANSACTION',
        title: subject,
        message: `${type}: ${formattedAmount} ${currency}`,
        data: { transactionType: type, amount, currency, status }
      });

    } catch (error) {
      console.error('Transaction notification error:', error);
    }
  }

  async createInAppNotification(userId, { type, title, message, data }) {
    // In a real app, this would save to a notifications table
    // For now, we'll emit via socket if available
    try {
      const { socketService } = require('../app');
      if (socketService) {
        socketService.emitToUser(userId, 'notification', {
          type,
          title,
          message,
          data,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('In-app notification error:', error);
    }
  }

  getDepositEmailTemplate(name, amount, currency, status) {
    return `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: #22c55e; margin-bottom: 24px;">Deposit ${status}</h1>
        <p style="color: #a1a1aa; font-size: 16px;">Hello ${name},</p>
        <p style="color: #a1a1aa;">Your deposit has been ${status.toLowerCase()}.</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Amount:</strong> <span style="color: #a1a1aa;">${amount} ${currency}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Status:</strong> <span style="color: ${status === 'COMPLETED' ? '#22c55e' : '#f59e0b'};">${status}</span></p>
        </div>
        <p style="color: #71717a; font-size: 14px;">Thank you for banking with Space X KB Private Bank.</p>
      </div>
    `;
  }

  getWithdrawalEmailTemplate(name, amount, currency, status) {
    return `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: ${status === 'COMPLETED' ? '#22c55e' : '#f59e0b'}; margin-bottom: 24px;">Withdrawal ${status}</h1>
        <p style="color: #a1a1aa; font-size: 16px;">Hello ${name},</p>
        <p style="color: #a1a1aa;">Your withdrawal has been ${status.toLowerCase()}.</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Amount:</strong> <span style="color: #a1a1aa;">${amount} ${currency}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Status:</strong> <span style="color: ${status === 'COMPLETED' ? '#22c55e' : '#f59e0b'};">${status}</span></p>
        </div>
        <p style="color: #71717a; font-size: 14px;">Thank you for banking with Space X KB Private Bank.</p>
      </div>
    `;
  }

  getTransferSentEmailTemplate(name, amount, currency, recipient) {
    return `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: #22c55e; margin-bottom: 24px;">Transfer Sent</h1>
        <p style="color: #a1a1aa; font-size: 16px;">Hello ${name},</p>
        <p style="color: #a1a1aa;">Your transfer has been completed successfully.</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Amount:</strong> <span style="color: #a1a1aa;">${amount} ${currency}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Recipient:</strong> <span style="color: #a1a1aa;">${recipient}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Status:</strong> <span style="color: #22c55e;">COMPLETED</span></p>
        </div>
        <p style="color: #71717a; font-size: 14px;">Thank you for banking with Space X KB Private Bank.</p>
      </div>
    `;
  }

  getTransferReceivedEmailTemplate(name, amount, currency, sender) {
    return `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: #22c55e; margin-bottom: 24px;">Transfer Received</h1>
        <p style="color: #a1a1aa; font-size: 16px;">Hello ${name},</p>
        <p style="color: #a1a1aa;">You have received a transfer.</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Amount:</strong> <span style="color: #a1a1aa;">${amount} ${currency}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">From:</strong> <span style="color: #a1a1aa;">${sender}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Status:</strong> <span style="color: #22c55e;">COMPLETED</span></p>
        </div>
        <p style="color: #71717a; font-size: 14px;">Thank you for banking with Space X KB Private Bank.</p>
      </div>
    `;
  }

  getGenericTransactionTemplate(name, type, amount, currency, status) {
    return `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: #6366f1; margin-bottom: 24px;">Transaction ${status}</h1>
        <p style="color: #a1a1aa; font-size: 16px;">Hello ${name},</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Type:</strong> <span style="color: #a1a1aa;">${type}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Amount:</strong> <span style="color: #a1a1aa;">${amount} ${currency}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Status:</strong> <span style="color: ${status === 'COMPLETED' ? '#22c55e' : '#f59e0b'};">${status}</span></p>
        </div>
      </div>
    `;
  }
}

module.exports = new NotificationService();
