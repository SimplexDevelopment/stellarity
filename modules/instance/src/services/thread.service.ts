import { query, generateId, now } from '../database/database.js';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export interface ThreadRow {
  id: string;
  channelId: string;
  serverId: string;
  parentMessageId: string;
  name: string;
  creatorId: string;
  isArchived: boolean;
  isLocked: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface ThreadMessageRow {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  encrypted: boolean;
  attachments: any[];
  embeds: any[];
  replyToId: string | null;
  editedAt: string | null;
  createdAt: string;
}

function mapThread(row: any): ThreadRow {
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    parentMessageId: row.parent_message_id,
    name: row.name,
    creatorId: row.creator_id,
    isArchived: !!row.is_archived,
    isLocked: !!row.is_locked,
    messageCount: row.message_count || 0,
    lastMessageAt: row.last_message_at || null,
    createdAt: row.created_at,
    archivedAt: row.archived_at || null,
  };
}

function mapThreadMessage(row: any): ThreadMessageRow {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    content: row.content,
    encrypted: !!row.encrypted,
    attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : (row.attachments || []),
    embeds: typeof row.embeds === 'string' ? JSON.parse(row.embeds) : (row.embeds || []),
    replyToId: row.reply_to_id || null,
    editedAt: row.edited_at || null,
    createdAt: row.created_at,
  };
}

class ThreadService {
  /** Create a new thread on a message */
  createThread(channelId: string, serverId: string, parentMessageId: string, name: string, creatorId: string): ThreadRow {
    // Verify the parent message exists
    const msg = query(`SELECT id FROM messages WHERE id = $1 AND channel_id = $2`, [parentMessageId, channelId]);
    if (msg.rows.length === 0) throw new Error('Parent message not found');

    // Check if a thread already exists on this message
    const existing = query(`SELECT id FROM threads WHERE parent_message_id = $1`, [parentMessageId]);
    if (existing.rows.length > 0) throw new Error('A thread already exists on this message');

    const threadId = generateId();
    query(
      `INSERT INTO threads (id, channel_id, server_id, parent_message_id, name, creator_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [threadId, channelId, serverId, parentMessageId, name, creatorId]
    );

    // Link the parent message to this thread
    query(`UPDATE messages SET thread_id = $1 WHERE id = $2`, [threadId, parentMessageId]);

    const result = query(`SELECT * FROM threads WHERE id = $1`, [threadId]);
    logger.info(`Thread "${name}" created on message ${parentMessageId} by ${creatorId}`);
    return mapThread(result.rows[0]);
  }

  /** Get a thread by ID */
  getThread(threadId: string): ThreadRow | null {
    const result = query(`SELECT * FROM threads WHERE id = $1`, [threadId]);
    return result.rows.length > 0 ? mapThread(result.rows[0]) : null;
  }

  /** Get all threads in a channel */
  getThreadsByChannel(channelId: string, includeArchived = false): ThreadRow[] {
    const sql = includeArchived
      ? `SELECT * FROM threads WHERE channel_id = $1 ORDER BY last_message_at DESC NULLS LAST, created_at DESC`
      : `SELECT * FROM threads WHERE channel_id = $1 AND is_archived = 0 ORDER BY last_message_at DESC NULLS LAST, created_at DESC`;
    const result = query(sql, [channelId]);
    return result.rows.map(mapThread);
  }

  /** Update thread metadata */
  updateThread(threadId: string, updates: { name?: string; isArchived?: boolean; isLocked?: boolean }): ThreadRow | null {
    const thread = this.getThread(threadId);
    if (!thread) return null;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(updates.name);
    }
    if (updates.isArchived !== undefined) {
      sets.push(`is_archived = $${idx++}`);
      params.push(updates.isArchived ? 1 : 0);
      if (updates.isArchived) {
        sets.push(`archived_at = $${idx++}`);
        params.push(now());
      } else {
        sets.push(`archived_at = NULL`);
      }
    }
    if (updates.isLocked !== undefined) {
      sets.push(`is_locked = $${idx++}`);
      params.push(updates.isLocked ? 1 : 0);
    }

    if (sets.length === 0) return thread;

    params.push(threadId);
    query(`UPDATE threads SET ${sets.join(', ')} WHERE id = $${idx}`, params);

    return this.getThread(threadId);
  }

  /** Delete a thread and all its messages */
  deleteThread(threadId: string): boolean {
    const thread = this.getThread(threadId);
    if (!thread) return false;

    // Remove thread reference from parent message
    query(`UPDATE messages SET thread_id = NULL WHERE thread_id = $1`, [threadId]);
    // Delete thread messages
    query(`DELETE FROM thread_messages WHERE thread_id = $1`, [threadId]);
    query(`DELETE FROM threads WHERE id = $1`, [threadId]);

    logger.info(`Thread ${threadId} deleted`);
    return true;
  }

  /** Create a message in a thread */
  createThreadMessage(
    threadId: string,
    userId: string,
    content: string,
    encrypted = false,
    replyToId?: string
  ): ThreadMessageRow {
    const thread = this.getThread(threadId);
    if (!thread) throw new Error('Thread not found');
    if (thread.isArchived) throw new Error('Thread is archived');

    const storedContent = encrypted ? encrypt(content) : content;
    const messageId = generateId();

    query(
      `INSERT INTO thread_messages (id, thread_id, user_id, content, encrypted, reply_to_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [messageId, threadId, userId, storedContent, encrypted ? 1 : 0, replyToId || null]
    );

    // Update thread counters
    query(
      `UPDATE threads SET message_count = message_count + 1, last_message_at = $1 WHERE id = $2`,
      [now(), threadId]
    );

    const result = query(`SELECT * FROM thread_messages WHERE id = $1`, [messageId]);
    const msg = mapThreadMessage(result.rows[0]);

    if (msg.encrypted) {
      msg.content = decrypt(msg.content);
    }

    logger.debug(`Thread message created in thread ${threadId} by ${userId}`);
    return msg;
  }

  /** Get messages in a thread */
  getThreadMessages(threadId: string, limit = 50, before?: string): ThreadMessageRow[] {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    let sql: string;
    let params: any[];

    if (before) {
      sql = `SELECT * FROM thread_messages WHERE thread_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`;
      params = [threadId, before, safeLimit];
    } else {
      sql = `SELECT * FROM thread_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2`;
      params = [threadId, safeLimit];
    }

    const result = query(sql, params);
    const messages = result.rows.map(mapThreadMessage).reverse();

    // Decrypt encrypted messages
    for (const msg of messages) {
      if (msg.encrypted) {
        try { msg.content = decrypt(msg.content); } catch { msg.content = '[Decryption failed]'; }
      }
    }

    return messages;
  }

  /** Edit a thread message */
  editThreadMessage(messageId: string, userId: string, content: string): ThreadMessageRow | null {
    const existing = query(`SELECT * FROM thread_messages WHERE id = $1`, [messageId]);
    if (existing.rows.length === 0) return null;
    if (existing.rows[0].user_id !== userId) return null;

    const stored = existing.rows[0].encrypted ? encrypt(content) : content;
    query(
      `UPDATE thread_messages SET content = $1, edited_at = $2 WHERE id = $3`,
      [stored, now(), messageId]
    );

    const result = query(`SELECT * FROM thread_messages WHERE id = $1`, [messageId]);
    const msg = mapThreadMessage(result.rows[0]);
    if (msg.encrypted) msg.content = decrypt(msg.content);
    return msg;
  }

  /** Delete a thread message */
  deleteThreadMessage(messageId: string, threadId: string): boolean {
    const result = query(`DELETE FROM thread_messages WHERE id = $1 AND thread_id = $2`, [messageId, threadId]);
    if (result.rowCount > 0) {
      query(`UPDATE threads SET message_count = MAX(message_count - 1, 0) WHERE id = $1`, [threadId]);
      return true;
    }
    return false;
  }
}

export const threadService = new ThreadService();
