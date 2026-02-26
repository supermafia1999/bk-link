const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async (to, subject, html, text) => {
  try {
    const info = await transporter.sendMail({
      from: `"Space X KB Private Bank" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

const emailTemplates = {
  welcome: (name) => ({
    subject: 'Welcome to Space X KB Private Bank',
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: #6366f1; margin-bottom: 24px;">Welcome to Space X KB Private Bank</h1>
        <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6;">Dear ${name},</p>
        <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6;">Thank you for joining Space X KB Private Bank. Your premium banking experience begins now.</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="color: #6366f1; font-weight: 600; margin: 0;">Your accounts have been created:</p>
          <ul style="color: #a1a1aa; margin-top: 12px; padding-left: 20px;">
            <li>USD Account</li>
            <li>USDT Account</li>
            <li>BTC Account</li>
            <li>ETH Account</li>
          </ul>
        </div>
        <p style="color: #71717a; font-size: 14px;">If you have any questions, our support team is available 24/7.</p>
      </div>
    `,
    text: `Welcome to Space X KB Private Bank, ${name}! Your premium banking experience begins now.`,
  }),

  loginAlert: (name, ip, device, time) => ({
    subject: 'New Login Detected - Space X KB Private Bank',
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: #f59e0b; margin-bottom: 24px;">New Login Detected</h1>
        <p style="color: #a1a1aa; font-size: 16px;">Hello ${name},</p>
        <p style="color: #a1a1aa;">We detected a new login to your account:</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">IP Address:</strong> <span style="color: #a1a1aa;">${ip}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Device:</strong> <span style="color: #a1a1aa;">${device}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Time:</strong> <span style="color: #a1a1aa;">${time}</span></p>
        </div>
        <p style="color: #ef4444;">If this wasn't you, please contact support immediately.</p>
      </div>
    `,
    text: `New login detected on your Space X KB account. IP: ${ip}, Device: ${device}, Time: ${time}`,
  }),

  transactionNotification: (name, type, amount, currency, status) => ({
    subject: `Transaction ${status} - Space X KB Private Bank`,
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #ffffff; padding: 40px; border-radius: 16px;">
        <h1 style="color: ${status === 'COMPLETED' ? '#22c55e' : '#f59e0b'}; margin-bottom: 24px;">Transaction ${status}</h1>
        <p style="color: #a1a1aa;">Hello ${name},</p>
        <div style="background: #1a1a25; padding: 24px; border-radius: 12px; margin: 24px 0;">
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Type:</strong> <span style="color: #a1a1aa;">${type}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Amount:</strong> <span style="color: #a1a1aa;">${amount} ${currency}</span></p>
          <p style="margin: 8px 0;"><strong style="color: #6366f1;">Status:</strong> <span style="color: #a1a1aa;">${status}</span></p>
        </div>
      </div>
    `,
    text: `Transaction ${status}: ${type} of ${amount} ${currency}`,
  }),
};

module.exports = { sendEmail, emailTemplates };
