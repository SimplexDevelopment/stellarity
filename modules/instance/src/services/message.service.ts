import { query, generateId, now } from '../database/database.js';
import { messageCache } from '../database/redis.js';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  encrypted: boolean;
  attachments?: MessageAttachment[];
  embeds?: MessageEmbed[];
  replyToId?: string;
  editedAt?: string;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  contentType: string;
}

export interface MessageEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  thumbnail?: string;
}

export interface CreateMessageInput {
  channelId: string;
  userId: string;
  content: string;
  encrypted?: boolean;
  attachments?: MessageAttachment[];
  embeds?: MessageEmbed[];
  replyToId?: string;
}

export interface MessageQueryOptions {
  limit?: number;
  before?: string;
  after?: string;
  around?: string;
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    channelId: row.channelId || row.channel_id,
    userId: row.userId || row.user_id,
    content: row.content,
    encrypted: !!row.encrypted,
    attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : (row.attachments || []),
    embeds: typeof row.embeds === 'string' ? JSON.parse(row.embeds) : (row.embeds || []),
    replyToId: row.replyToId || row.reply_to_id || null,
    editedAt: row.editedAt || row.edited_at || null,
    createdAt: row.createdAt || row.created_at,
  };
}

class MessageService {
  async createMessage(input: CreateMessageInput): Promise<Message> {
    const { channelId, userId, content, encrypted = false, attachments, embeds, replyToId } = input;

    const storedContent = encrypted ? encrypt(content) : content;
    const messageId = generateId();

    query(
      `INSERT INTO messages (id, channel_id, user_id, content, encrypted, attachments, embeds, reply_to_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [messageId, channelId, userId, storedContent, encrypted ? 1 : 0, JSON.stringify(attachments || []), JSON.stringify(embeds || []), replyToId]
    );

    const result = query(
      `SELECT * FROM messages WHERE id = $1`,
      [messageId]
    );

    const message = mapMessage(result.rows[0]);

    if (message.encrypted) {
      message.content = decrypt(message.content);
    }

    await messageCache.cacheMessage(channelId, message.id, message);

    logger.debug(`Message created in channel ${channelId} by user ${userId}`);
    return message;
  }

  async getMessages(channelId: string, options: MessageQueryOptions = {}): Promise<Message[]> {
    const { limit = 50, before, after, around } = options;
    const safeLimit = Math.min(Math.max(1, limit), 100);

    let sql: string;
    let params: any[];

    if (around) {
      sql = `
        SELECT * FROM (
          SELECT id, channel_id, user_id, content, encrypted,
                 attachments, embeds, reply_to_id, edited_at, created_at
          FROM messages
          WHERE channel_id = $1 AND created_at <= (SELECT created_at FROM messages WHERE id = $2)
          ORDER BY created_at DESC
          LIMIT $3
        )
        UNION ALL
        SELECT * FROM (
          SELECT id, channel_id, user_id, content, encrypted,
                 attachments, embeds, reply_to_id, edited_at, created_at
          FROM messages
          WHERE channel_id = $1 AND created_at > (SELECT created_at FROM messages WHERE id = $2)
          ORDER BY created_at ASC
          LIMIT $3
        )
        ORDER BY created_at ASC`;
      params = [channelId, around, Math.ceil(safeLimit / 2)];
    } else if (before) {
      sql = `
        SELECT id, channel_id, user_id, content, encrypted,
               attachments, embeds, reply_to_id, edited_at, created_at
        FROM messages
        WHERE channel_id = $1 AND created_at < (SELECT created_at FROM messages WHERE id = $2)
        ORDER BY created_at DESC
        LIMIT $3`;
      params = [channelId, before, safeLimit];
    } else if (after) {
      sql = `
        SELECT id, channel_id, user_id, content, encrypted,
               attachments, embeds, reply_to_id, edited_at, created_at
        FROM messages
        WHERE channel_id = $1 AND created_at > (SELECT created_at FROM messages WHERE id = $2)
        ORDER BY created_at ASC
        LIMIT $3`;
      params = [channelId, after, safeLimit];
    } else {
      sql = `
        SELECT id, channel_id, user_id, content, encrypted,
               attachments, embeds, reply_to_id, edited_at, created_at
        FROM messages
        WHERE channel_id = $1
        ORDER BY created_at DESC
        LIMIT $2`;
      params = [channelId, safeLimit];
    }

    const result = query(sql, params);

    const messages = result.rows.map((row: any) => {
      const msg = mapMessage(row);
      if (msg.encrypted) {
        msg.content = decrypt(msg.content);
      }
      return msg;
    });

    if (!before) {
      messages.reverse();
    }

    return messages;
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const result = query(
      `SELECT * FROM messages WHERE id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) return null;

    const message = mapMessage(result.rows[0]);
    if (message.encrypted) {
      message.content = decrypt(message.content);
    }

    return message;
  }

  async editMessage(messageId: string, userId: string, newContent: string): Promise<Message | null> {
    const original = await this.getMessage(messageId);
    if (!original || original.userId !== userId) {
      return null;
    }

    const storedContent = original.encrypted ? encrypt(newContent) : newContent;
    const editedAt = now();

    query(
      `UPDATE messages
       SET content = $1, edited_at = $2
       WHERE id = $3 AND user_id = $4`,
      [storedContent, editedAt, messageId, userId]
    );

    const result = query(
      `SELECT * FROM messages WHERE id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) return null;

    const message = mapMessage(result.rows[0]);
    if (message.encrypted) {
      message.content = decrypt(message.content);
    }

    await messageCache.cacheMessage(message.channelId, message.id, message);

    logger.debug(`Message ${messageId} edited by user ${userId}`);
    return message;
  }

  async deleteMessage(messageId: string, userId: string, isAdmin = false): Promise<boolean> {
    // Get channel_id before deleting
    const msgResult = query(`SELECT channel_id FROM messages WHERE id = $1`, [messageId]);
    if (msgResult.rows.length === 0) return false;

    const channelId = msgResult.rows[0].channel_id;
    let result;

    if (isAdmin) {
      result = query(
        `DELETE FROM messages WHERE id = $1`,
        [messageId]
      );
    } else {
      result = query(
        `DELETE FROM messages WHERE id = $1 AND user_id = $2`,
        [messageId, userId]
      );
    }

    if (result.rowCount === 0) return false;

    await messageCache.invalidate(channelId);

    logger.debug(`Message ${messageId} deleted`);
    return true;
  }

  async bulkDeleteMessages(messageIds: string[], channelId: string): Promise<number> {
    if (messageIds.length === 0) return 0;

    // Build IN clause with individual placeholders
    const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(', ');
    const params = [...messageIds, channelId];
    const channelParam = `$${messageIds.length + 1}`;

    const result = query(
      `DELETE FROM messages WHERE id IN (${placeholders}) AND channel_id = ${channelParam}`,
      params
    );

    await messageCache.invalidate(channelId);

    logger.debug(`Bulk deleted ${result.rowCount} messages from channel ${channelId}`);
    return result.rowCount || 0;
  }

  async searchMessages(
    channelId: string,
    searchTerm: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Message[]> {
    const { limit = 25, offset = 0 } = options;

    const result = query(
      `SELECT * FROM messages
       WHERE channel_id = $1 AND encrypted = 0 AND content LIKE $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [channelId, `%${searchTerm}%`, limit, offset]
    );

    return result.rows.map((row: any) => mapMessage(row));
  }

  async getMessageCount(channelId: string): Promise<number> {
    const result = query(
      `SELECT COUNT(*) as count FROM messages WHERE channel_id = $1`,
      [channelId]
    );
    return Number(result.rows[0].count);
  }

  async pinMessage(messageId: string, channelId: string): Promise<boolean> {
    const result = query(
      `UPDATE messages SET pinned = 1 WHERE id = $1 AND channel_id = $2`,
      [messageId, channelId]
    );
    return (result.rowCount || 0) > 0;
  }

  async unpinMessage(messageId: string, channelId: string): Promise<boolean> {
    const result = query(
      `UPDATE messages SET pinned = 0 WHERE id = $1 AND channel_id = $2`,
      [messageId, channelId]
    );
    return (result.rowCount || 0) > 0;
  }

  async getPinnedMessages(channelId: string): Promise<Message[]> {
    const result = query(
      `SELECT * FROM messages
       WHERE channel_id = $1 AND pinned = 1
       ORDER BY created_at DESC
       LIMIT 50`,
      [channelId]
    );

    return result.rows.map((row: any) => {
      const msg = mapMessage(row);
      if (msg.encrypted) {
        msg.content = decrypt(msg.content);
      }
      return msg;
    });
  }

  async getUserMessages(userId: string, limit = 100): Promise<Message[]> {
    const result = query(
      `SELECT * FROM messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row: any) => {
      const msg = mapMessage(row);
      if (msg.encrypted) {
        msg.content = decrypt(msg.content);
      }
      return msg;
    });
  }
}

export const messageService = new MessageService();
