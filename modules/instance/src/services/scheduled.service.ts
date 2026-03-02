import { query, generateId, now } from '../database/database.js';
import { messageService } from './message.service.js';
import { emitToServer } from '../socket/emitter.js';
import { logger } from '../utils/logger.js';
import { LIMITS } from '@stellarity/shared';

export interface ScheduledMessageRow {
  id: string;
  channelId: string;
  serverId: string;
  userId: string;
  content: string;
  encrypted: boolean;
  replyToId: string | null;
  scheduledFor: string;
  status: string;
  createdAt: string;
}

function mapScheduledMessage(row: any): ScheduledMessageRow {
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    userId: row.user_id,
    content: row.content,
    encrypted: !!row.encrypted,
    replyToId: row.reply_to_id || null,
    scheduledFor: row.scheduled_for,
    status: row.status,
    createdAt: row.created_at,
  };
}

class ScheduledMessageService {
  private deliveryInterval: ReturnType<typeof setInterval> | null = null;

  /** Schedule a message for future delivery */
  createScheduledMessage(
    channelId: string,
    serverId: string,
    userId: string,
    content: string,
    scheduledFor: string,
    encrypted = false,
    replyToId?: string
  ): ScheduledMessageRow {
    // Check max pending scheduled messages per user
    const pendingCount = query(
      `SELECT COUNT(*) as count FROM scheduled_messages WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    if ((pendingCount.rows[0]?.count || 0) >= LIMITS.SCHEDULED_PER_USER_MAX) {
      throw new Error(`Maximum ${LIMITS.SCHEDULED_PER_USER_MAX} pending scheduled messages allowed`);
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate.getTime() <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Max 30 days in advance
    const maxDate = new Date(Date.now() + LIMITS.SCHEDULED_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000);
    if (scheduledDate.getTime() > maxDate.getTime()) {
      throw new Error(`Cannot schedule more than ${LIMITS.SCHEDULED_MAX_FUTURE_DAYS} days in advance`);
    }

    const id = generateId();
    query(
      `INSERT INTO scheduled_messages (id, channel_id, server_id, user_id, content, encrypted, reply_to_id, scheduled_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, channelId, serverId, userId, content, encrypted ? 1 : 0, replyToId || null, scheduledFor]
    );

    const result = query(`SELECT * FROM scheduled_messages WHERE id = $1`, [id]);
    logger.info(`Scheduled message ${id} for ${scheduledFor} by user ${userId}`);
    return mapScheduledMessage(result.rows[0]);
  }

  /** Get all pending scheduled messages for a user */
  getUserScheduledMessages(userId: string): ScheduledMessageRow[] {
    const result = query(
      `SELECT * FROM scheduled_messages WHERE user_id = $1 AND status = 'pending' ORDER BY scheduled_for ASC`,
      [userId]
    );
    return result.rows.map(mapScheduledMessage);
  }

  /** Get scheduled messages for a channel */
  getChannelScheduledMessages(channelId: string, userId: string): ScheduledMessageRow[] {
    const result = query(
      `SELECT * FROM scheduled_messages WHERE channel_id = $1 AND user_id = $2 AND status = 'pending' ORDER BY scheduled_for ASC`,
      [channelId, userId]
    );
    return result.rows.map(mapScheduledMessage);
  }

  /** Cancel a scheduled message */
  cancelScheduledMessage(messageId: string, userId: string): boolean {
    const result = query(
      `UPDATE scheduled_messages SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [messageId, userId]
    );
    return result.rowCount > 0;
  }

  /** Update a scheduled message */
  updateScheduledMessage(messageId: string, userId: string, updates: { content?: string; scheduledFor?: string }): ScheduledMessageRow | null {
    const existing = query(
      `SELECT * FROM scheduled_messages WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [messageId, userId]
    );
    if (existing.rows.length === 0) return null;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.content) {
      sets.push(`content = $${idx++}`);
      params.push(updates.content);
    }
    if (updates.scheduledFor) {
      const d = new Date(updates.scheduledFor);
      if (d.getTime() <= Date.now()) throw new Error('Scheduled time must be in the future');
      sets.push(`scheduled_for = $${idx++}`);
      params.push(updates.scheduledFor);
    }

    if (sets.length === 0) return mapScheduledMessage(existing.rows[0]);

    params.push(messageId);
    query(`UPDATE scheduled_messages SET ${sets.join(', ')} WHERE id = $${idx}`, params);

    const result = query(`SELECT * FROM scheduled_messages WHERE id = $1`, [messageId]);
    return mapScheduledMessage(result.rows[0]);
  }

  /** Deliver due scheduled messages — called by the interval loop */
  async deliverDueMessages(): Promise<number> {
    const nowStr = now();
    const due = query(
      `SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduled_for <= $1 ORDER BY scheduled_for ASC`,
      [nowStr]
    );

    let delivered = 0;

    for (const row of due.rows) {
      try {
        const mapped = mapScheduledMessage(row);

        // Verify the channel still exists
        const channelCheck = query(`SELECT id, server_id FROM channels WHERE id = $1`, [mapped.channelId]);
        if (channelCheck.rows.length === 0) {
          query(`UPDATE scheduled_messages SET status = 'failed' WHERE id = $1`, [mapped.id]);
          continue;
        }

        // Create the actual message
        const message = await messageService.createMessage({
          channelId: mapped.channelId,
          userId: mapped.userId,
          content: mapped.content,
          encrypted: mapped.encrypted,
          replyToId: mapped.replyToId || undefined,
        });

        // Mark as sent
        query(`UPDATE scheduled_messages SET status = 'sent' WHERE id = $1`, [mapped.id]);

        // Enrich with author info
        const authorResult = query(
          `SELECT user_id, username, display_name, avatar_url FROM instance_members WHERE user_id = $1`,
          [mapped.userId]
        );
        const author = authorResult.rows[0]
          ? { id: authorResult.rows[0].user_id, username: authorResult.rows[0].username, displayName: authorResult.rows[0].display_name, avatarUrl: authorResult.rows[0].avatar_url }
          : { id: mapped.userId, username: 'Unknown', displayName: null, avatarUrl: null };

        // Emit to server room
        emitToServer(mapped.serverId, 'message:new', {
          ...message,
          authorId: message.userId,
          author,
          reactions: [],
          threadId: null,
          threadCount: null,
          isEphemeral: false,
          expiresAt: null,
        });

        delivered++;
        logger.debug(`Delivered scheduled message ${mapped.id}`);
      } catch (error) {
        logger.error(`Failed to deliver scheduled message ${row.id}:`, error);
        query(`UPDATE scheduled_messages SET status = 'failed' WHERE id = $1`, [row.id]);
      }
    }

    return delivered;
  }

  /** Start the delivery check loop */
  startDeliveryLoop(intervalMs = 10_000): void {
    if (this.deliveryInterval) return;
    this.deliveryInterval = setInterval(async () => {
      try { await this.deliverDueMessages(); } catch (e) { logger.error('Scheduled delivery error:', e); }
    }, intervalMs);
    logger.info(`Scheduled message delivery started (interval: ${intervalMs}ms)`);
  }

  /** Stop the delivery loop */
  stopDeliveryLoop(): void {
    if (this.deliveryInterval) {
      clearInterval(this.deliveryInterval);
      this.deliveryInterval = null;
    }
  }
}

export const scheduledService = new ScheduledMessageService();
