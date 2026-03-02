/**
 * DM Routes
 * 
 * Endpoints for DM buffering (central fallback when P2P unavailable),
 * pending message retrieval, and delivery acknowledgement.
 */
import { Router, Response } from 'express';
import { dmService } from '../services/dm.service.js';
import { authenticate, validate } from '../middleware/auth.middleware.js';
import { dmSendSchema, AppError } from '@stellarity/shared';
import { logger } from '../utils/logger.js';

import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// All DM routes require authentication
router.use(authenticate);

// ── Buffer a DM ──────────────────────────────────────────────────────

/** POST /api/dm/send — Buffer a message for an offline recipient */
router.post('/send', validate(dmSendSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recipientId, content, encrypted } = req.body;

    // Content should ideally be encrypted by the client before sending
    const result = await dmService.bufferMessage(
      req.user!.userId,
      recipientId,
      encrypted ? content : Buffer.from(content).toString('base64')
    );

    res.status(201).json({
      messageId: result.messageId,
      conversationId: result.conversationId,
      status: 'buffered',
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      logger.error('DM buffer error:', error);
      res.status(500).json({ error: 'Failed to buffer message' });
    }
  }
});

// ── Get Pending Messages ─────────────────────────────────────────────

/** GET /api/dm/pending — Retrieve buffered messages waiting for delivery */
router.get('/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messages = await dmService.getPendingMessages(req.user!.userId);
    res.json({ messages, count: messages.length });
  } catch (error) {
    logger.error('Get pending DMs error:', error);
    res.status(500).json({ error: 'Failed to retrieve pending messages' });
  }
});

// ── Acknowledge Delivery ─────────────────────────────────────────────

/** POST /api/dm/acknowledge — Confirm receipt and purge buffered messages */
router.post('/acknowledge', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ error: 'messageIds array is required' });
      return;
    }

    const purged = await dmService.acknowledgeDelivery(req.user!.userId, messageIds);
    res.json({ acknowledged: purged });
  } catch (error) {
    logger.error('DM acknowledge error:', error);
    res.status(500).json({ error: 'Failed to acknowledge delivery' });
  }
});

// ── Get Conversations ────────────────────────────────────────────────

/** GET /api/dm/conversations — List DM conversations for current user */
router.get('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conversations = await dmService.getConversations(req.user!.userId);
    res.json({ conversations });
  } catch (error) {
    logger.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

export default router;
