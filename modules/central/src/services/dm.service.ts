/**
 * DM Service
 * 
 * Manages ephemeral DM buffering on the central server.
 * Primary delivery is P2P via WebRTC data channels.
 * Central only stores messages when the recipient is offline,
 * and deletes them upon delivery confirmation.
 */
import { query, transaction } from '../database/postgres.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

import type { PendingDM, DMConversation } from '@stellarity/shared';

class DMService {
  /**
   * Buffer a DM for an offline recipient.
   * Content should already be encrypted by the sender.
   */
  async bufferMessage(
    senderId: string,
    recipientId: string,
    contentEncrypted: string
  ): Promise<{ messageId: string; conversationId: string }> {
    // Verify recipient exists
    const recipientCheck = await query(
      'SELECT id FROM users WHERE id = $1',
      [recipientId]
    );
    if (recipientCheck.rows.length === 0) {
      throw new Error('Recipient not found');
    }

    // Ensure sender !== recipient
    if (senderId === recipientId) {
      throw new Error('Cannot send DM to yourself');
    }

    // Check pending message limit
    const pendingCount = await query(
      `SELECT COUNT(*) FROM dm_buffer
       WHERE sender_id = $1 AND delivered_at IS NULL`,
      [senderId]
    );
    if (parseInt(pendingCount.rows[0].count, 10) >= (config.dm.maxPendingPerUser || 1000)) {
      throw new Error('Too many pending messages');
    }

    // Order user IDs for conversation (user1_id < user2_id constraint)
    const [user1Id, user2Id] = senderId < recipientId
      ? [senderId, recipientId]
      : [recipientId, senderId];

    return await transaction(async (client) => {
      // Upsert conversation
      const convResult = await client.query(
        `INSERT INTO dm_conversations (user1_id, user2_id, last_message_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user1_id, user2_id)
         DO UPDATE SET last_message_at = NOW()
         RETURNING id`,
        [user1Id, user2Id]
      );
      const conversationId = convResult.rows[0].id;

      // Calculate expiry
      const bufferTTLDays = config.dm.bufferTTLDays || 7;
      const expiresAt = new Date(Date.now() + bufferTTLDays * 24 * 60 * 60 * 1000);

      // Insert buffered message
      const msgResult = await client.query(
        `INSERT INTO dm_buffer (conversation_id, sender_id, recipient_id, content_encrypted, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [conversationId, senderId, recipientId, contentEncrypted, expiresAt]
      );

      return {
        messageId: msgResult.rows[0].id,
        conversationId,
      };
    });
  }

  /** Get pending (undelivered) messages for a user */
  async getPendingMessages(userId: string): Promise<PendingDM[]> {
    const result = await query(
      `SELECT db.id, db.sender_id, u.username AS sender_username,
              db.content_encrypted, db.created_at, db.expires_at
       FROM dm_buffer db
       JOIN users u ON u.id = db.sender_id
       WHERE db.recipient_id = $1 AND db.delivered_at IS NULL AND db.expires_at > NOW()
       ORDER BY db.created_at ASC`,
      [userId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      senderId: row.sender_id,
      senderUsername: row.sender_username,
      contentEncrypted: row.content_encrypted,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }

  /** Mark messages as delivered and delete them (ephemeral) */
  async acknowledgeDelivery(userId: string, messageIds: string[]): Promise<number> {
    if (messageIds.length === 0) return 0;

    // Only allow the recipient to acknowledge
    const result = await query(
      `DELETE FROM dm_buffer
       WHERE id = ANY($1) AND recipient_id = $2
       RETURNING id`,
      [messageIds, userId]
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.debug(`Delivered and purged ${count} buffered DMs for user ${userId}`);
    }
    return count;
  }

  /** Get conversations for a user */
  async getConversations(userId: string): Promise<DMConversation[]> {
    const result = await query(
      `SELECT dc.id, dc.user1_id, dc.user2_id, dc.last_message_at,
              u1.username AS user1_username, u1.display_name AS user1_display_name,
              u1.avatar_url AS user1_avatar_url, u1.status AS user1_status,
              u1.status_message AS user1_status_message,
              u2.username AS user2_username, u2.display_name AS user2_display_name,
              u2.avatar_url AS user2_avatar_url, u2.status AS user2_status,
              u2.status_message AS user2_status_message,
              (SELECT COUNT(*) FROM dm_buffer
               WHERE conversation_id = dc.id AND recipient_id = $1 AND delivered_at IS NULL) AS unread_count
       FROM dm_conversations dc
       JOIN users u1 ON u1.id = dc.user1_id
       JOIN users u2 ON u2.id = dc.user2_id
       WHERE dc.user1_id = $1 OR dc.user2_id = $1
       ORDER BY dc.last_message_at DESC NULLS LAST`,
      [userId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      participants: [
        {
          id: row.user1_id,
          username: row.user1_username,
          displayName: row.user1_display_name,
          avatarUrl: row.user1_avatar_url,
          status: row.user1_status,
          statusMessage: row.user1_status_message,
        },
        {
          id: row.user2_id,
          username: row.user2_username,
          displayName: row.user2_display_name,
          avatarUrl: row.user2_avatar_url,
          status: row.user2_status,
          statusMessage: row.user2_status_message,
        },
      ],
      lastMessage: null, // Last message content isn't stored centrally (P2P-first)
      lastMessageAt: row.last_message_at,
      unreadCount: parseInt(row.unread_count, 10),
    }));
  }

  /** Clean up expired buffered messages */
  async cleanupExpired(): Promise<number> {
    const result = await query(
      'DELETE FROM dm_buffer WHERE expires_at < NOW() RETURNING id'
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info(`Purged ${count} expired buffered DMs`);
    }
    return count;
  }
}

export const dmService = new DMService();
