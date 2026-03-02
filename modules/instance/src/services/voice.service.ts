import { query, now } from '../database/database.js';
import { voiceChannels } from '../database/redis.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface VoiceState {
  id: string;
  userId: string;
  channelId: string | null;
  serverId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  joinedAt: string;
}

export interface VoiceUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  speaking?: boolean;
}

class VoiceService {
  // Join a voice channel
  async joinChannel(
    userId: string,
    channelId: string,
    serverId: string
  ): Promise<{ users: string[]; channelKey: string; hostUserId: string; isHost: boolean }> {
    // Check channel user limit
    const channelResult = query(
      `SELECT user_limit FROM channels WHERE id = $1 AND type = 'voice'`,
      [channelId]
    );
    
    if (channelResult.rows.length === 0) {
      throw new Error('Voice channel not found');
    }
    
    const userLimit = channelResult.rows[0].user_limit;
    const currentUsers = await voiceChannels.getUserCount(channelId);
    
    if (userLimit > 0 && currentUsers >= userLimit) {
      throw new Error('Voice channel is full');
    }
    
    // Check max users per channel
    if (currentUsers >= config.voice.maxUsersPerChannel) {
      throw new Error('Voice channel has reached maximum capacity');
    }
    
    // Leave current channel if in one
    const currentChannel = await voiceChannels.getUserChannel(userId);
    if (currentChannel) {
      await this.leaveChannel(userId);
    }
    
    // Determine if this user becomes the host (first user in channel)
    const existingUsers = await voiceChannels.getUsers(channelId);
    let hostUserId = await voiceChannels.getHost(channelId);
    let isHost = false;
    
    if (existingUsers.length === 0 || !hostUserId) {
      // First user becomes host
      hostUserId = userId;
      isHost = true;
      await voiceChannels.setHost(channelId, userId);
      logger.info(`User ${userId} is now host of channel ${channelId}`);
    }
    
    // Update voice state in database
    query(
      `INSERT INTO voice_states (user_id, channel_id, server_id, joined_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET channel_id = excluded.channel_id, server_id = excluded.server_id, joined_at = $4`,
      [userId, channelId, serverId, now()]
    );
    
    // Add to Redis for real-time tracking
    await voiceChannels.join(channelId, userId);
    
    // Set initial connection quality
    await voiceChannels.updateConnectionQuality(channelId, userId, 100);
    
    // Get all users in channel
    const users = await voiceChannels.getUsers(channelId);
    
    // Generate channel encryption key (in production, use per-channel keys)
    const channelKey = `${serverId}:${channelId}:key`;
    
    logger.info(`User ${userId} joined voice channel ${channelId}`);
    
    return { users, channelKey, hostUserId, isHost };
  }
  
  // Leave voice channel
  async leaveChannel(userId: string): Promise<{ channelId: string | null; newHostId: string | null }> {
    const currentChannel = await voiceChannels.getUserChannel(userId);
    
    if (!currentChannel) {
      return { channelId: null, newHostId: null };
    }
    
    // Check if leaving user is the host
    const currentHost = await voiceChannels.getHost(currentChannel);
    let newHostId: string | null = null;
    
    // Remove from Redis
    await voiceChannels.leave(currentChannel, userId);
    
    // Update database
    query(
      `DELETE FROM voice_states WHERE user_id = $1`,
      [userId]
    );
    
    // If host left, migrate to new host
    if (currentHost === userId) {
      newHostId = await this.migrateHost(currentChannel);
    }
    
    logger.info(`User ${userId} left voice channel ${currentChannel}`);
    
    return { channelId: currentChannel, newHostId };
  }
  
  // Migrate host to best available user
  async migrateHost(channelId: string): Promise<string | null> {
    const newHost = await voiceChannels.findBestHost(channelId);
    
    if (newHost) {
      await voiceChannels.setHost(channelId, newHost);
      logger.info(`Host migrated to ${newHost} in channel ${channelId}`);
    } else {
      await voiceChannels.clearHost(channelId);
      logger.info(`No users remaining in channel ${channelId}, host cleared`);
    }
    
    return newHost;
  }
  
  // Update user's connection quality
  async updateConnectionQuality(channelId: string, userId: string, quality: number): Promise<void> {
    await voiceChannels.updateConnectionQuality(channelId, userId, quality);
  }
  
  // Force host migration (e.g., if current host has poor connection)
  async forceHostMigration(channelId: string): Promise<string | null> {
    return this.migrateHost(channelId);
  }
  
  // Get current host
  async getChannelHost(channelId: string): Promise<string | null> {
    return voiceChannels.getHost(channelId);
  }
  
  // Get users in a channel
  async getChannelUsers(channelId: string): Promise<VoiceUser[]> {
    const userIds = await voiceChannels.getUsers(channelId);
    
    if (userIds.length === 0) {
      return [];
    }
    
    // Build IN clause with individual placeholders
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    
    const result = query(
      `SELECT im.user_id as id, im.username, im.display_name, im.avatar_url, vs.self_mute, vs.self_deaf
       FROM instance_members im
       JOIN voice_states vs ON vs.user_id = im.user_id
       WHERE im.user_id IN (${placeholders})`,
      userIds
    );
    
    return result.rows.map((row: any) => ({
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      selfMute: !!row.self_mute,
      selfDeaf: !!row.self_deaf,
    }));
  }
  
  // Update voice state (mute/deaf)
  async updateVoiceState(
    userId: string,
    updates: { selfMute?: boolean; selfDeaf?: boolean }
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [userId];
    let paramIndex = 2;
    
    if (updates.selfMute !== undefined) {
      setClauses.push(`self_mute = $${paramIndex++}`);
      values.push(updates.selfMute ? 1 : 0);
    }
    
    if (updates.selfDeaf !== undefined) {
      setClauses.push(`self_deaf = $${paramIndex++}`);
      values.push(updates.selfDeaf ? 1 : 0);
    }
    
    if (setClauses.length === 0) return;
    
    query(
      `UPDATE voice_states SET ${setClauses.join(', ')} WHERE user_id = $1`,
      values
    );
  }
  
  // Get user's current voice state
  async getVoiceState(userId: string): Promise<VoiceState | null> {
    const result = query(
      `SELECT * FROM voice_states WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) return null;
    
    return {
      id: result.rows[0].id,
      userId: result.rows[0].user_id,
      channelId: result.rows[0].channel_id,
      serverId: result.rows[0].server_id,
      selfMute: !!result.rows[0].self_mute,
      selfDeaf: !!result.rows[0].self_deaf,
      joinedAt: result.rows[0].joined_at,
    };
  }
  
  // Get all voice channel occupancy for a server (Ventrilo/TeamSpeak-style display)
  async getServerVoiceOccupancy(serverId: string): Promise<
    { channelId: string; users: VoiceUser[] }[]
  > {
    // Get all voice channels for this server
    const channelResult = query(
      `SELECT id FROM channels WHERE server_id = $1 AND type = 'voice'`,
      [serverId]
    );

    const occupancy: { channelId: string; users: VoiceUser[] }[] = [];

    for (const row of channelResult.rows) {
      const users = await this.getChannelUsers(row.id);
      occupancy.push({ channelId: row.id, users });
    }

    return occupancy;
  }

  // Clean up disconnected users
  async cleanupDisconnectedUsers(connectedUserIds: string[]): Promise<void> {
    if (connectedUserIds.length === 0) {
      // Clear all voice states
      query('DELETE FROM voice_states');
      return;
    }
    
    // Build NOT IN clause with individual placeholders
    const placeholders = connectedUserIds.map((_, i) => `$${i + 1}`).join(', ');
    
    query(
      `DELETE FROM voice_states WHERE user_id NOT IN (${placeholders})`,
      connectedUserIds
    );
  }
}

export const voiceService = new VoiceService();
