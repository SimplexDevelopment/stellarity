import { query, generateId } from '../database/database.js';
import { LIMITS } from '@stellarity/shared';
import { logger } from '../utils/logger.js';

export interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

class ReactionService {
  /** Add a reaction to a message */
  addReaction(messageId: string, channelId: string, userId: string, emoji: string): boolean {
    // Check if user already reacted with this emoji
    const existing = query(
      `SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
    if (existing.rows.length > 0) return false;

    // Check unique emoji count limit per message
    const countResult = query(
      `SELECT COUNT(DISTINCT emoji) as count FROM message_reactions WHERE message_id = $1`,
      [messageId]
    );
    if ((countResult.rows[0]?.count || 0) >= LIMITS.REACTIONS_PER_MESSAGE_MAX) {
      // Allow if this emoji already exists on the message (just another user)
      const emojiExists = query(
        `SELECT id FROM message_reactions WHERE message_id = $1 AND emoji = $2 LIMIT 1`,
        [messageId, emoji]
      );
      if (emojiExists.rows.length === 0) return false;
    }

    const id = generateId();
    query(
      `INSERT INTO message_reactions (id, message_id, channel_id, user_id, emoji) VALUES ($1, $2, $3, $4, $5)`,
      [id, messageId, channelId, userId, emoji]
    );

    logger.debug(`Reaction ${emoji} added to message ${messageId} by ${userId}`);
    return true;
  }

  /** Remove a reaction from a message */
  removeReaction(messageId: string, userId: string, emoji: string): boolean {
    const result = query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
    return result.rowCount > 0;
  }

  /** Get aggregated reactions for a message */
  getReactions(messageId: string): AggregatedReaction[] {
    const result = query(
      `SELECT emoji, GROUP_CONCAT(user_id) as user_ids, COUNT(*) as count
       FROM message_reactions WHERE message_id = $1
       GROUP BY emoji ORDER BY MIN(created_at)`,
      [messageId]
    );

    return result.rows.map((row: any) => ({
      emoji: row.emoji,
      count: row.count,
      userIds: row.user_ids ? row.user_ids.split(',') : [],
    }));
  }

  /** Get aggregated reactions for multiple messages (batch) */
  getReactionsBatch(messageIds: string[]): Map<string, AggregatedReaction[]> {
    if (messageIds.length === 0) return new Map();

    const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = query(
      `SELECT message_id, emoji, GROUP_CONCAT(user_id) as user_ids, COUNT(*) as count
       FROM message_reactions WHERE message_id IN (${placeholders})
       GROUP BY message_id, emoji ORDER BY message_id, MIN(created_at)`,
      messageIds
    );

    const map = new Map<string, AggregatedReaction[]>();
    for (const row of result.rows) {
      const msgId = row.message_id;
      if (!map.has(msgId)) map.set(msgId, []);
      map.get(msgId)!.push({
        emoji: row.emoji,
        count: row.count,
        userIds: row.user_ids ? row.user_ids.split(',') : [],
      });
    }
    return map;
  }

  /** Remove all reactions from a message (for message deletion) */
  removeAllReactions(messageId: string): void {
    query(`DELETE FROM message_reactions WHERE message_id = $1`, [messageId]);
  }

  /** Get users who reacted with a specific emoji */
  getReactionUsers(messageId: string, emoji: string): string[] {
    const result = query(
      `SELECT user_id FROM message_reactions WHERE message_id = $1 AND emoji = $2 ORDER BY created_at`,
      [messageId, emoji]
    );
    return result.rows.map((r: any) => r.user_id);
  }
}

export const reactionService = new ReactionService();
