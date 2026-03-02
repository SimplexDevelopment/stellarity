import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { scheduledService } from '../services/scheduled.service.js';
import { serverService } from '../services/server.service.js';
import { logger } from '../utils/logger.js';
import { scheduledMessageSchema, updateScheduledMessageSchema } from '@stellarity/shared';

const router = Router();

router.use(authenticate);

// Schedule a message for future delivery
router.post('/channels/:channelId/messages/scheduled', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const parsed = scheduledMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const scheduled = scheduledService.createScheduledMessage(
      channelId,
      channel.serverId,
      req.user!.userId,
      parsed.data.content,
      parsed.data.scheduledFor,
      parsed.data.encrypted,
      parsed.data.replyToId
    );

    res.status(201).json(scheduled);
  } catch (error: any) {
    if (error.message?.includes('Maximum') || error.message?.includes('future') || error.message?.includes('advance')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Failed to schedule message:', error);
    res.status(500).json({ error: 'Failed to schedule message' });
  }
});

// Get current user's scheduled messages
router.get('/scheduled-messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messages = scheduledService.getUserScheduledMessages(req.user!.userId);
    res.json(messages);
  } catch (error) {
    logger.error('Failed to get scheduled messages:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
});

// Get scheduled messages for a channel (user's own)
router.get('/channels/:channelId/messages/scheduled', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const messages = scheduledService.getChannelScheduledMessages(channelId, req.user!.userId);
    res.json(messages);
  } catch (error) {
    logger.error('Failed to get channel scheduled messages:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
});

// Update a scheduled message
router.patch('/scheduled-messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const parsed = updateScheduledMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const updated = scheduledService.updateScheduledMessage(messageId, req.user!.userId, parsed.data);
    if (!updated) {
      return res.status(404).json({ error: 'Scheduled message not found' });
    }

    res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('future')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Failed to update scheduled message:', error);
    res.status(500).json({ error: 'Failed to update scheduled message' });
  }
});

// Cancel a scheduled message
router.delete('/scheduled-messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;

    const cancelled = scheduledService.cancelScheduledMessage(messageId, req.user!.userId);
    if (!cancelled) {
      return res.status(404).json({ error: 'Scheduled message not found or already delivered' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to cancel scheduled message:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

export default router;
