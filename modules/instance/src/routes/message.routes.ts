import { Router, Response } from 'express';
import { messageService } from '../services/message.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { serverService } from '../services/server.service.js';
import { emitToServer } from '../socket/emitter.js';
import { query } from '../database/database.js';
import { logger } from '../utils/logger.js';

/** Look up author info for a list of user IDs and attach to messages */
function enrichMessagesWithAuthors(messages: any[]): any[] {
  if (messages.length === 0) return messages;
  const userIds = [...new Set(messages.map(m => m.userId))];
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
  const result = query(
    `SELECT user_id, username, display_name, avatar_url FROM instance_members WHERE user_id IN (${placeholders})`,
    userIds
  );
  const authorMap = new Map<string, { id: string; username: string; displayName: string | null; avatarUrl: string | null }>();
  for (const row of result.rows) {
    authorMap.set(row.user_id, {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name || null,
      avatarUrl: row.avatar_url || null,
    });
  }
  return messages.map(m => ({
    ...m,
    author: authorMap.get(m.userId) || { id: m.userId, username: 'Unknown', displayName: null, avatarUrl: null },
  }));
}

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get messages from a channel
router.get('/channels/:channelId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { limit, before, after, around } = req.query;

    // Verify user has access to this channel
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const messages = await messageService.getMessages(channelId, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      before: before as string,
      after: after as string,
      around: around as string,
    });

    res.json(enrichMessagesWithAuthors(messages));
  } catch (error) {
    logger.error('Failed to get messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new message
router.post('/channels/:channelId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { content, encrypted, attachments, embeds, replyToId } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > 4000) {
      return res.status(400).json({ error: 'Message content must be 4000 characters or less' });
    }

    // Verify user has access to this channel
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const message = await messageService.createMessage({
      channelId,
      userId: req.user!.userId,
      content: content.trim(),
      encrypted: encrypted || false,
      attachments,
      embeds,
      replyToId,
    });

    const messageWithAuthor = {
      ...message,
      author: {
        id: req.user!.userId,
        username: req.user!.username,
        displayName: req.user!.displayName,
        avatarUrl: req.user!.avatarUrl,
      },
    };

    // Broadcast to all users in the server room via socket
    emitToServer(channel.serverId, 'message:new', messageWithAuthor);

    res.status(201).json(messageWithAuthor);
  } catch (error) {
    logger.error('Failed to create message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// Get a specific message
router.get('/channels/:channelId/messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;

    // Verify user has access to this channel
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

    res.json(message);
  } catch (error) {
    logger.error('Failed to get message:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

// Edit a message
router.patch('/channels/:channelId/messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > 4000) {
      return res.status(400).json({ error: 'Message content must be 4000 characters or less' });
    }

    // Verify user has access to this channel
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const message = await messageService.editMessage(messageId, req.user!.userId, content.trim());
    if (!message) {
      return res.status(404).json({ error: 'Message not found or you do not have permission to edit it' });
    }

    res.json(message);
  } catch (error) {
    logger.error('Failed to edit message:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete a message
router.delete('/channels/:channelId/messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;

    // Verify user has access to this channel
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is admin/owner
    const isOwner = await serverService.isServerOwner(channel.serverId, req.user!.userId);

    const deleted = await messageService.deleteMessage(messageId, req.user!.userId, isOwner);
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found or you do not have permission to delete it' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Bulk delete messages (requires manage messages permission)
router.post('/channels/:channelId/messages/bulk-delete', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds array is required' });
    }

    if (messageIds.length > 100) {
      return res.status(400).json({ error: 'Cannot bulk delete more than 100 messages at once' });
    }

    // Verify user has access and permission
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isOwner = await serverService.isServerOwner(channel.serverId, req.user!.userId);
    if (!isOwner) {
      return res.status(403).json({ error: 'You do not have permission to bulk delete messages' });
    }

    const deletedCount = await messageService.bulkDeleteMessages(messageIds, channelId);
    res.json({ deleted: deletedCount });
  } catch (error) {
    logger.error('Failed to bulk delete messages:', error);
    res.status(500).json({ error: 'Failed to bulk delete messages' });
  }
});

// Search messages in a channel
router.get('/channels/:channelId/messages/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { q, limit, offset } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    // Verify user has access to this channel
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const messages = await messageService.searchMessages(channelId, q, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(messages);
  } catch (error) {
    logger.error('Failed to search messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Get pinned messages
router.get('/channels/:channelId/pins', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;

    // Verify user has access to this channel
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const messages = await messageService.getPinnedMessages(channelId);
    res.json(messages);
  } catch (error) {
    logger.error('Failed to get pinned messages:', error);
    res.status(500).json({ error: 'Failed to fetch pinned messages' });
  }
});

// Pin a message
router.put('/channels/:channelId/pins/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;

    // Verify user has access and permission
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isOwner = await serverService.isServerOwner(channel.serverId, req.user!.userId);
    if (!isOwner) {
      return res.status(403).json({ error: 'You do not have permission to pin messages' });
    }

    const pinned = await messageService.pinMessage(messageId, channelId);
    if (!pinned) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to pin message:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Unpin a message
router.delete('/channels/:channelId/pins/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;

    // Verify user has access and permission
    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isOwner = await serverService.isServerOwner(channel.serverId, req.user!.userId);
    if (!isOwner) {
      return res.status(403).json({ error: 'You do not have permission to unpin messages' });
    }

    const unpinned = await messageService.unpinMessage(messageId, channelId);
    if (!unpinned) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to unpin message:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

export default router;
