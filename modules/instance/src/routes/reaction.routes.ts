import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { reactionService } from '../services/reaction.service.js';
import { serverService } from '../services/server.service.js';
import { messageService } from '../services/message.service.js';
import { emitToServer } from '../socket/emitter.js';
import { logger } from '../utils/logger.js';
import { reactionSchema } from '@stellarity/shared';

const router = Router();

router.use(authenticate);

// Add a reaction to a message
router.put('/channels/:channelId/messages/:messageId/reactions/:emoji', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId, emoji } = req.params;

    const parsed = reactionSchema.safeParse({ emoji: decodeURIComponent(emoji) });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid emoji' });
    }

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const message = await messageService.getMessage(messageId);
    if (!message || message.channelId !== channelId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const added = reactionService.addReaction(messageId, channelId, req.user!.userId, parsed.data.emoji);
    if (!added) {
      return res.status(409).json({ error: 'Reaction already exists or limit reached' });
    }

    emitToServer(channel.serverId, 'reaction:added', {
      messageId,
      channelId,
      emoji: parsed.data.emoji,
      userId: req.user!.userId,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to add reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Remove a reaction from a message
router.delete('/channels/:channelId/messages/:messageId/reactions/:emoji', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId, emoji } = req.params;

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const removed = reactionService.removeReaction(messageId, req.user!.userId, decodeURIComponent(emoji));
    if (!removed) {
      return res.status(404).json({ error: 'Reaction not found' });
    }

    emitToServer(channel.serverId, 'reaction:removed', {
      messageId,
      channelId,
      emoji: decodeURIComponent(emoji),
      userId: req.user!.userId,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to remove reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Get reactions for a message
router.get('/channels/:channelId/messages/:messageId/reactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const reactions = reactionService.getReactions(messageId);
    res.json(reactions);
  } catch (error) {
    logger.error('Failed to get reactions:', error);
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
});

// Get users who reacted with a specific emoji
router.get('/channels/:channelId/messages/:messageId/reactions/:emoji/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId, emoji } = req.params;

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const userIds = reactionService.getReactionUsers(messageId, decodeURIComponent(emoji));
    res.json({ userIds });
  } catch (error) {
    logger.error('Failed to get reaction users:', error);
    res.status(500).json({ error: 'Failed to fetch reaction users' });
  }
});

export default router;
