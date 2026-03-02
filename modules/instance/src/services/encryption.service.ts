import { query, generateId, now } from '../database/database.js';
import { logger } from '../utils/logger.js';

export interface ChannelMemberKeyRow {
  id: string;
  channelId: string;
  userId: string;
  publicKey: string;
  registeredAt: string;
}

class EncryptionService {
  /** Register a user's public key for an encrypted channel */
  registerKey(channelId: string, userId: string, publicKey: string): ChannelMemberKeyRow {
    // Upsert — update if already exists
    const existing = query(
      `SELECT id FROM channel_member_keys WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId]
    );

    if (existing.rows.length > 0) {
      query(
        `UPDATE channel_member_keys SET public_key = $1, registered_at = $2 WHERE channel_id = $3 AND user_id = $4`,
        [publicKey, now(), channelId, userId]
      );
      const result = query(
        `SELECT * FROM channel_member_keys WHERE channel_id = $1 AND user_id = $2`,
        [channelId, userId]
      );
      return this.mapRow(result.rows[0]);
    }

    const id = generateId();
    query(
      `INSERT INTO channel_member_keys (id, channel_id, user_id, public_key) VALUES ($1, $2, $3, $4)`,
      [id, channelId, userId, publicKey]
    );

    const result = query(`SELECT * FROM channel_member_keys WHERE id = $1`, [id]);
    logger.debug(`Key registered for user ${userId} in channel ${channelId}`);
    return this.mapRow(result.rows[0]);
  }

  /** Get all member keys for a channel */
  getChannelKeys(channelId: string): ChannelMemberKeyRow[] {
    const result = query(
      `SELECT * FROM channel_member_keys WHERE channel_id = $1 ORDER BY registered_at`,
      [channelId]
    );
    return result.rows.map(this.mapRow);
  }

  /** Get a specific user's key for a channel */
  getUserKey(channelId: string, userId: string): ChannelMemberKeyRow | null {
    const result = query(
      `SELECT * FROM channel_member_keys WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId]
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /** Remove a user's key (when they leave) */
  removeKey(channelId: string, userId: string): boolean {
    const result = query(
      `DELETE FROM channel_member_keys WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId]
    );
    return result.rowCount > 0;
  }

  /** Remove all keys for a channel */
  removeAllKeys(channelId: string): void {
    query(`DELETE FROM channel_member_keys WHERE channel_id = $1`, [channelId]);
  }

  /** Mark a channel as encrypted/not encrypted */
  setChannelEncrypted(channelId: string, encrypted: boolean): void {
    query(`UPDATE channels SET is_encrypted = $1 WHERE id = $2`, [encrypted ? 1 : 0, channelId]);
    if (!encrypted) {
      this.removeAllKeys(channelId);
    }
  }

  /** Check if a channel is encrypted */
  isChannelEncrypted(channelId: string): boolean {
    const result = query(`SELECT is_encrypted FROM channels WHERE id = $1`, [channelId]);
    return result.rows.length > 0 && !!result.rows[0].is_encrypted;
  }

  private mapRow(row: any): ChannelMemberKeyRow {
    return {
      id: row.id,
      channelId: row.channel_id,
      userId: row.user_id,
      publicKey: row.public_key,
      registeredAt: row.registered_at,
    };
  }
}

export const encryptionService = new EncryptionService();
