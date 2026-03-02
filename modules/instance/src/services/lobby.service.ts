import { query, generateId, now } from '../database/database.js';
import { voiceChannels } from '../database/redis.js';
import { logger } from '../utils/logger.js';
import { emitToServer } from '../socket/emitter.js';

import type { Channel, ServerFeatures } from '@stellarity/shared';
import { DEFAULT_SERVER_FEATURES } from '@stellarity/shared';

class LobbyService {
  // ── Temporary Lobby Management ───────────────────────────────────

  /** Create a temporary "Build a Lobby" voice channel */
  async createTemporaryLobby(
    serverId: string,
    userId: string,
    input: { name: string; userLimit?: number; password?: string; categoryId?: string | null }
  ): Promise<Channel> {
    const { name, userLimit = 0, password, categoryId } = input;
    const channelId = generateId();

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
    }

    // Get next position in category
    const posResult = query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM channels WHERE server_id = $1`,
      [serverId]
    );
    const position = posResult.rows[0].next_pos;

    query(
      `INSERT INTO channels (id, server_id, category_id, name, type, position, bitrate, user_limit, is_temporary, created_by, password_hash, expires_when_empty)
       VALUES ($1, $2, $3, $4, 'voice', $5, 64000, $6, 1, $7, $8, 1)`,
      [channelId, serverId, categoryId || null, name, position, userLimit, userId, passwordHash]
    );

    const result = query(`SELECT * FROM channels WHERE id = $1`, [channelId]);
    const channel = this.mapChannel(result.rows[0]);

    logger.info(`Temporary lobby created: "${name}" in server ${serverId} by ${userId}`);
    return channel;
  }

  /** Create an overflow lobby when a voice channel is full */
  async createOverflowLobby(serverId: string, sourceChannelId: string): Promise<Channel> {
    // Get source channel info
    const sourceResult = query(`SELECT * FROM channels WHERE id = $1`, [sourceChannelId]);
    if (sourceResult.rows.length === 0) {
      throw new Error('Source channel not found');
    }
    const source = sourceResult.rows[0];

    // Count existing overflow lobbies for this source
    const overflowCount = query(
      `SELECT COUNT(*) as cnt FROM channels WHERE server_id = $1 AND is_temporary = 1 AND name LIKE $2`,
      [serverId, `${source.name} (Overflow%`]
    );
    const num = (overflowCount.rows[0].cnt || 0) + 1;

    const channelId = generateId();
    const name = `${source.name} (Overflow #${num})`;

    const posResult = query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM channels WHERE server_id = $1`,
      [serverId]
    );
    const position = posResult.rows[0].next_pos;

    query(
      `INSERT INTO channels (id, server_id, category_id, name, type, position, bitrate, user_limit, is_temporary, created_by, expires_when_empty)
       VALUES ($1, $2, $3, $4, 'voice', $5, $6, $7, 1, NULL, 1)`,
      [channelId, serverId, source.category_id || null, name, position, source.bitrate || 64000, source.user_limit || 0]
    );

    const result = query(`SELECT * FROM channels WHERE id = $1`, [channelId]);
    const channel = this.mapChannel(result.rows[0]);

    logger.info(`Overflow lobby created: "${name}" in server ${serverId}`);
    return channel;
  }

  /** Destroy a temporary lobby — clean up DB and Redis */
  async destroyLobby(channelId: string): Promise<{ serverId: string } | null> {
    // Get channel info before deleting
    const chanResult = query(`SELECT * FROM channels WHERE id = $1 AND is_temporary = 1`, [channelId]);
    if (chanResult.rows.length === 0) return null;

    const serverId = chanResult.rows[0].server_id;

    // Clean up voice states for this channel
    query(`DELETE FROM voice_states WHERE channel_id = $1`, [channelId]);

    // Delete the channel
    query(`DELETE FROM channels WHERE id = $1`, [channelId]);

    logger.info(`Temporary lobby destroyed: ${channelId} in server ${serverId}`);
    return { serverId };
  }

  /** Check if a temp lobby is empty and should be cleaned up */
  async checkAndCleanupEmptyLobbies(): Promise<void> {
    // Get all temporary channels that expire when empty
    const tempChannels = query(
      `SELECT id, server_id FROM channels WHERE is_temporary = 1 AND expires_when_empty = 1`
    );

    for (const row of tempChannels.rows) {
      const userCount = await voiceChannels.getUserCount(row.id);
      if (userCount === 0) {
        const result = await this.destroyLobby(row.id);
        if (result) {
          emitToServer(result.serverId, 'lobby:destroyed', {
            channelId: row.id,
            serverId: result.serverId,
          });
          emitToServer(result.serverId, 'channel:deleted', {
            channelId: row.id,
            serverId: result.serverId,
          });
        }
      }
    }
  }

  /** Verify a lobby password */
  async verifyLobbyPassword(channelId: string, password: string): Promise<boolean> {
    const result = query(`SELECT password_hash FROM channels WHERE id = $1`, [channelId]);
    if (result.rows.length === 0) return false;

    const hash = result.rows[0].password_hash;
    if (!hash) return true; // No password set

    return Bun.password.verify(password, hash);
  }

  // ── Server Features ──────────────────────────────────────────────

  /** Get server features (with defaults) */
  getServerFeatures(serverId: string): ServerFeatures {
    const result = query(`SELECT * FROM server_features WHERE server_id = $1`, [serverId]);
    if (result.rows.length === 0) {
      return { ...DEFAULT_SERVER_FEATURES };
    }
    const row = result.rows[0];
    return {
      buildALobbyEnabled: row.build_a_lobby_enabled === 1 || row.build_a_lobby_enabled === true,
      buildALobbyPosition: row.build_a_lobby_position ?? 0,
      autoOverflowEnabled: row.auto_overflow_enabled === 1 || row.auto_overflow_enabled === true,
    };
  }

  /** Update server features */
  updateServerFeatures(serverId: string, input: Partial<ServerFeatures>): ServerFeatures {
    // Upsert
    const existing = query(`SELECT server_id FROM server_features WHERE server_id = $1`, [serverId]);
    if (existing.rows.length === 0) {
      query(`INSERT INTO server_features (server_id) VALUES ($1)`, [serverId]);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.buildALobbyEnabled !== undefined) {
      updates.push(`build_a_lobby_enabled = $${paramIndex++}`);
      values.push(input.buildALobbyEnabled ? 1 : 0);
    }
    if (input.buildALobbyPosition !== undefined) {
      updates.push(`build_a_lobby_position = $${paramIndex++}`);
      values.push(input.buildALobbyPosition);
    }
    if (input.autoOverflowEnabled !== undefined) {
      updates.push(`auto_overflow_enabled = $${paramIndex++}`);
      values.push(input.autoOverflowEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(serverId);
      query(
        `UPDATE server_features SET ${updates.join(', ')}, updated_at = '${now()}' WHERE server_id = $${paramIndex}`,
        values
      );
    }

    return this.getServerFeatures(serverId);
  }

  /** Get the Comms (voice) category ID for a server, if it exists */
  getVoiceCategoryId(serverId: string): string | null {
    const result = query(
      `SELECT id FROM categories WHERE server_id = $1 AND (name = 'Comms' OR name = 'comms') ORDER BY position ASC LIMIT 1`,
      [serverId]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  // ── Mapper ───────────────────────────────────────────────────────

  private mapChannel(row: any): Channel {
    return {
      id: row.id,
      serverId: row.server_id,
      categoryId: row.category_id || null,
      name: row.name,
      type: row.type,
      description: row.description,
      position: row.position,
      bitrate: row.bitrate,
      userLimit: row.user_limit,
      isTemporary: row.is_temporary === 1 || row.is_temporary === true,
      createdBy: row.created_by || null,
      expiresWhenEmpty: row.expires_when_empty === 1 || row.expires_when_empty === true,
      hasPassword: row.password_hash !== null && row.password_hash !== undefined,
      isEncrypted: row.is_encrypted === 1 || row.is_encrypted === true,
      ephemeralDefault: row.ephemeral_default || null,
      createdAt: row.created_at,
    };
  }
}

export const lobbyService = new LobbyService();
