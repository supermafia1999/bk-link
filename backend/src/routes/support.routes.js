const express = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');

const router = express.Router();

// Get user messages
router.get('/messages', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const messages = await prisma.supportMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    // Mark messages as read
    await prisma.supportMessage.updateMany({
      where: {
        userId: req.user.id,
        isFromUser: false,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// Send message
router.post('/messages', authenticate, async (req, res, next) => {
  try {
    const { message, attachment } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const supportMessage = await prisma.supportMessage.create({
      data: {
        userId: req.user.id,
        message: message.trim(),
        isFromUser: true,
        attachment
      }
    });

    // Emit to admin room
    const { socketService } = require('../app');
    if (socketService) {
      socketService.emitToAdmin('new_support_message', {
        message: supportMessage,
        user: {
          id: req.user.id,
          email: req.user.email,
          fullName: req.user.fullName
        }
      });
    }

    res.status(201).json({
      message: 'Message sent',
      supportMessage
    });
  } catch (error) {
    next(error);
  }
});

// Get unread count
router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const count = await prisma.supportMessage.count({
      where: {
        userId: req.user.id,
        isFromUser: false,
        isRead: false
      }
    });

    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all support messages
router.get('/admin/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;

    // Get unique users with their latest message
    const userMessages = await prisma.supportMessage.findMany({
      where: status === 'unread' ? { isFromUser: true, isRead: false } : {},
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId']
    });

    res.json({ conversations: userMessages });
  } catch (error) {
    next(error);
  }
});

// Admin: Get messages for specific user
router.get('/admin/user/:userId', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;

    const messages = await prisma.supportMessage.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Mark messages as read
    await prisma.supportMessage.updateMany({
      where: {
        userId,
        isFromUser: true,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// Admin: Reply to user
router.post('/admin/reply/:userId', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const reply = await prisma.supportMessage.create({
      data: {
        userId,
        adminId: req.user.id,
        message: message.trim(),
        isFromUser: false
      }
    });

    // Emit to user
    const { socketService } = require('../app');
    if (socketService) {
      socketService.emitToUser(userId, 'support_reply', {
        message: reply
      });
    }

    res.json({
      message: 'Reply sent',
      reply
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
