import { query, generateId, now } from '../database/database.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { emitToServer } from '../socket/emitter.js';
import { logger } from '../utils/logger.js';

class EphemeralService {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /** Create an ephemeral message with a TTL */
  createEphemeralMessage(
    channelId: string,
    userId: string,
    content: string,
    ttlSeconds: number,
    encrypted = false,
    replyToId?: string
  ) {
    const storedContent = encrypted ? encrypt(content) : content;
    const messageId = generateId();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    query(
      `INSERT INTO messages (id, channel_id, user_id, content, encrypted, is_ephemeral, expires_at, reply_to_id)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
      [messageId, channelId, userId, storedContent, encrypted ? 1 : 0, expiresAt, replyToId || null]
    );

    const result = query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    const row = result.rows[0];
    const message = {
      id: row.id,
      channelId: row.channel_id,
      userId: row.user_id,
      content: encrypted ? decrypt(row.content) : row.content,
      encrypted: !!row.encrypted,
      isEphemeral: true,
      expiresAt,
      attachments: JSON.parse(row.attachments || '[]'),
      embeds: JSON.parse(row.embeds || '[]'),
      replyToId: row.reply_to_id || null,
      editedAt: null,
      createdAt: row.created_at,
      pinned: false,
      reactions: [],
      threadId: null,
      threadCount: null,
    };

    logger.debug(`Ephemeral message created in ${channelId}, expires at ${expiresAt}`);
    return message;
  }

  /** Clean up expired ephemeral messages */
  cleanupExpired(): number {
    const nowStr = now();

    // Get expired messages for notification
    const expired = query(
      `SELECT id, channel_id FROM messages WHERE is_ephemeral = 1 AND expires_at IS NOT NULL AND expires_at <= $1`,
      [nowStr]
    );

    if (expired.rows.length === 0) return 0;

    // Delete expired messages
    query(
      `DELETE FROM messages WHERE is_ephemeral = 1 AND expires_at IS NOT NULL AND expires_at <= $1`,
      [nowStr]
    );

    // Notify clients about expired messages
    const channelIds = [...new Set(expired.rows.map((r: any) => r.channel_id))];
    for (const channelId of channelIds) {
      const channelResult = query(`SELECT server_id FROM channels WHERE id = $1`, [channelId]);
      if (channelResult.rows.length > 0) {
        const serverId = channelResult.rows[0].server_id;
        const expiredInChannel = expired.rows.filter((r: any) => r.channel_id === channelId);
        for (const msg of expiredInChannel) {
          emitToServer(serverId, 'message:expired', {
            channelId,
            messageId: msg.id,
          });
        }
      }
    }

    if (expired.rows.length > 0) {
      logger.debug(`Cleaned up ${expired.rows.length} expired ephemeral messages`);
    }

    return expired.rows.length;
  }

  /** Start the cleanup interval */
  startCleanupLoop(intervalMs = 15_000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      try { this.cleanupExpired(); } catch (e) { logger.error('Ephemeral cleanup error:', e); }
    }, intervalMs);
    logger.info(`Ephemeral message cleanup started (interval: ${intervalMs}ms)`);
  }

  /** Stop the cleanup interval */
  stopCleanupLoop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const ephemeralService = new EphemeralService();
