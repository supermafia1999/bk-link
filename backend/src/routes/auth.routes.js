const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { registerValidation, loginValidation } = require('../middleware/validation.middleware');
const { generateAccountNumber } = require('../utils/encryption');
const { sendEmail, emailTemplates } = require('../config/email');

const router = express.Router();

// Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Register
router.post('/register', registerValidation, async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with accounts
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        accounts: {
          create: [
            { type: 'USD', accountNumber: generateAccountNumber('USD'), balances: { create: { available: 0 } } },
            { type: 'USDT', accountNumber: generateAccountNumber('USDT'), balances: { create: { available: 0 } } },
            { type: 'BTC', accountNumber: generateAccountNumber('BTC'), balances: { create: { available: 0 } } },
            { type: 'ETH', accountNumber: generateAccountNumber('ETH'), balances: { create: { available: 0 } } },
          ]
        },
        profile: {
          create: {}
        }
      },
      include: {
        accounts: {
          include: { balances: true }
        }
      }
    });

    // Create portfolio for investment
    await prisma.portfolio.create({
      data: {
        userId: user.id
      }
    });

    // Send welcome email
    const welcomeTemplate = emailTemplates.welcome(fullName);
    await sendEmail(email, welcomeTemplate.subject, welcomeTemplate.html, welcomeTemplate.text);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Save refresh token
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        accounts: user.accounts.map(acc => ({
          id: acc.id,
          type: acc.type,
          accountNumber: acc.accountNumber,
          balance: acc.balances[0]?.available || 0
        }))
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900 // 15 minutes
      }
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: {
          include: { balances: true }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.isFrozen) {
      return res.status(403).json({ error: 'Account is frozen. Please contact support.' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Save refresh token
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    // Send login alert email
    const loginTemplate = emailTemplates.loginAlert(
      user.fullName,
      req.ip,
      req.headers['user-agent']?.substring(0, 50) || 'Unknown',
      new Date().toLocaleString()
    );
    await sendEmail(email, loginTemplate.subject, loginTemplate.html, loginTemplate.text);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        accounts: user.accounts.map(acc => ({
          id: acc.id,
          type: acc.type,
          accountNumber: acc.accountNumber,
          balance: acc.balances[0]?.available || 0
        }))
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900 // 15 minutes
      }
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if session exists
    const session = await prisma.authSession.findUnique({
      where: { refreshToken }
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Generate new tokens
    const tokens = generateTokens(decoded.userId);

    // Update session
    await prisma.authSession.update({
      where: { refreshToken },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    next(error);
  }
});

// Logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7);

    // Delete session
    await prisma.authSession.deleteMany({
      where: {
        userId: req.user.id,
        refreshToken: req.body.refreshToken
      }
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

// Logout all sessions
router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await prisma.authSession.deleteMany({
      where: { userId: req.user.id }
    });

    res.json({ message: 'All sessions logged out' });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        accounts: {
          include: { balances: true }
        },
        profile: true,
        portfolio: {
          include: {
            positions: {
              include: { asset: true }
            }
          }
        }
      }
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isFrozen: user.isFrozen,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        profile: user.profile,
        accounts: user.accounts.map(acc => ({
          id: acc.id,
          type: acc.type,
          accountNumber: acc.accountNumber,
          isActive: acc.isActive,
          balance: {
            available: acc.balances[0]?.available || 0,
            pending: acc.balances[0]?.pending || 0,
            reserved: acc.balances[0]?.reserved || 0
          }
        })),
        portfolio: user.portfolio
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get active sessions
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const sessions = await prisma.authSession.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

// Revoke specific session
router.delete('/sessions/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await prisma.authSession.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await prisma.authSession.delete({
      where: { id }
    });

    res.json({ message: 'Session revoked' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
