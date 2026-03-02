import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { threadService } from '../services/thread.service.js';
import { serverService } from '../services/server.service.js';
import { emitToServer } from '../socket/emitter.js';
import { query } from '../database/database.js';
import { logger } from '../utils/logger.js';
import { createThreadSchema, updateThreadSchema } from '@stellarity/shared';

const router = Router();

router.use(authenticate);

/** Look up author info for thread messages */
function enrichThreadMessagesWithAuthors(messages: any[]): any[] {
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

// Create a thread on a message
router.post('/channels/:channelId/messages/:messageId/threads', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId, messageId } = req.params;
    const parsed = createThreadSchema.safeParse(req.body);
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

    const thread = threadService.createThread(
      channelId,
      channel.serverId,
      messageId,
      parsed.data.name,
      req.user!.userId
    );

    emitToServer(channel.serverId, 'thread:created', thread);

    res.status(201).json(thread);
  } catch (error: any) {
    if (error.message === 'Parent message not found' || error.message === 'A thread already exists on this message') {
      return res.status(409).json({ error: error.message });
    }
    logger.error('Failed to create thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// Get all threads in a channel
router.get('/channels/:channelId/threads', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { includeArchived } = req.query;

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const threads = threadService.getThreadsByChannel(channelId, includeArchived === 'true');
    res.json(threads);
  } catch (error) {
    logger.error('Failed to get threads:', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// Get a specific thread
router.get('/threads/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.params;

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const isMember = await serverService.isServerMember(thread.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this thread' });
    }

    res.json(thread);
  } catch (error) {
    logger.error('Failed to get thread:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Update a thread (name, archive, lock)
router.patch('/threads/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.params;
    const parsed = updateThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Only creator or server owner can update
    const isOwner = await serverService.isServerOwner(thread.serverId, req.user!.userId);
    if (thread.creatorId !== req.user!.userId && !isOwner) {
      return res.status(403).json({ error: 'You do not have permission to update this thread' });
    }

    const updated = threadService.updateThread(threadId, parsed.data);
    emitToServer(thread.serverId, 'thread:updated', updated);

    res.json(updated);
  } catch (error) {
    logger.error('Failed to update thread:', error);
    res.status(500).json({ error: 'Failed to update thread' });
  }
});

// Delete a thread
router.delete('/threads/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.params;

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const isOwner = await serverService.isServerOwner(thread.serverId, req.user!.userId);
    if (thread.creatorId !== req.user!.userId && !isOwner) {
      return res.status(403).json({ error: 'You do not have permission to delete this thread' });
    }

    threadService.deleteThread(threadId);
    emitToServer(thread.serverId, 'thread:deleted', { threadId, channelId: thread.channelId });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

// Get messages in a thread
router.get('/threads/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.params;
    const { limit, before } = req.query;

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const isMember = await serverService.isServerMember(thread.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this thread' });
    }

    const messages = threadService.getThreadMessages(
      threadId,
      limit ? parseInt(limit as string, 10) : undefined,
      before as string | undefined
    );

    res.json(enrichThreadMessagesWithAuthors(messages));
  } catch (error) {
    logger.error('Failed to get thread messages:', error);
    res.status(500).json({ error: 'Failed to fetch thread messages' });
  }
});

// Create a message in a thread
router.post('/threads/:threadId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.params;
    const { content, encrypted, replyToId } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > 4000) {
      return res.status(400).json({ error: 'Message content must be 4000 characters or less' });
    }

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.isLocked) {
      return res.status(403).json({ error: 'Thread is locked' });
    }

    if (thread.isArchived) {
      return res.status(403).json({ error: 'Thread is archived' });
    }

    const isMember = await serverService.isServerMember(thread.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this thread' });
    }

    const message = threadService.createThreadMessage(
      threadId,
      req.user!.userId,
      content.trim(),
      encrypted || false,
      replyToId
    );

    const messageWithAuthor = {
      ...message,
      author: {
        id: req.user!.userId,
        username: req.user!.username,
        displayName: req.user!.displayName,
        avatarUrl: req.user!.avatarUrl,
      },
    };

    emitToServer(thread.serverId, 'thread:message-new', {
      threadId,
      channelId: thread.channelId,
      message: messageWithAuthor,
    });

    res.status(201).json(messageWithAuthor);
  } catch (error: any) {
    if (error.message === 'Thread is archived') {
      return res.status(403).json({ error: error.message });
    }
    logger.error('Failed to create thread message:', error);
    res.status(500).json({ error: 'Failed to create thread message' });
  }
});

// Edit a thread message
router.patch('/threads/:threadId/messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId, messageId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const message = threadService.editThreadMessage(messageId, req.user!.userId, content.trim());
    if (!message) {
      return res.status(404).json({ error: 'Message not found or you do not have permission to edit it' });
    }

    emitToServer(thread.serverId, 'thread:message-updated', {
      threadId,
      channelId: thread.channelId,
      message,
    });

    res.json(message);
  } catch (error) {
    logger.error('Failed to edit thread message:', error);
    res.status(500).json({ error: 'Failed to edit thread message' });
  }
});

// Delete a thread message
router.delete('/threads/:threadId/messages/:messageId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId, messageId } = req.params;

    const thread = threadService.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const isOwner = await serverService.isServerOwner(thread.serverId, req.user!.userId);
    // Allow thread message deletion by message author or server owner
    const deleted = threadService.deleteThreadMessage(messageId, threadId);
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    emitToServer(thread.serverId, 'thread:message-deleted', {
      threadId,
      channelId: thread.channelId,
      messageId,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete thread message:', error);
    res.status(500).json({ error: 'Failed to delete thread message' });
  }
});

export default router;
