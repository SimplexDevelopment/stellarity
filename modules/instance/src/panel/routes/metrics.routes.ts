/**
 * Panel Metrics Routes — /panel/api/metrics
 *
 * Instance-wide metrics: member counts, servers, messages, voice, storage.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query } from '../../database/database.js';
import { config } from '../../config/index.js';
import { isUsingFallback, checkRedisConnection } from '../../database/redis.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

const router = Router();

/** GET /panel/api/metrics — aggregate instance metrics */
router.get('/', async (req: PanelRequest, res: Response) => {
  try {
    // Total members
    const memberCount = query('SELECT COUNT(*) as count FROM instance_members').rows[0]?.count || 0;
    const bannedCount = query('SELECT COUNT(*) as count FROM instance_members WHERE is_banned = 1').rows[0]?.count || 0;

    // Servers
    const serverCount = query('SELECT COUNT(*) as count FROM servers').rows[0]?.count || 0;

    // Channels
    const channelCount = query('SELECT COUNT(*) as count FROM channels').rows[0]?.count || 0;
    const textChannels = query("SELECT COUNT(*) as count FROM channels WHERE type = 'text'").rows[0]?.count || 0;
    const voiceChannels = query("SELECT COUNT(*) as count FROM channels WHERE type = 'voice'").rows[0]?.count || 0;

    // Messages
    const totalMessages = query('SELECT COUNT(*) as count FROM messages').rows[0]?.count || 0;

    // Messages in time windows
    const messagesLast24h = query(
      "SELECT COUNT(*) as count FROM messages WHERE created_at >= datetime('now', '-1 day')"
    ).rows[0]?.count || 0;

    const messagesLast7d = query(
      "SELECT COUNT(*) as count FROM messages WHERE created_at >= datetime('now', '-7 days')"
    ).rows[0]?.count || 0;

    const messagesLast30d = query(
      "SELECT COUNT(*) as count FROM messages WHERE created_at >= datetime('now', '-30 days')"
    ).rows[0]?.count || 0;

    // Active voice connections
    const activeVoice = query('SELECT COUNT(*) as count FROM voice_states').rows[0]?.count || 0;

    // Active moderation actions
    const activeModerations = query(
      'SELECT COUNT(*) as count FROM moderation_actions WHERE is_active = 1'
    ).rows[0]?.count || 0;

    // Database file size
    let dbSizeBytes = 0;
    try {
      const dbPath = path.join(config.instance.dataDir, 'instance.db');
      const stats = fs.statSync(dbPath);
      dbSizeBytes = stats.size;
    } catch {
      // DB file not found or inaccessible
    }

    // Redis status
    const redisStatus = isUsingFallback() ? 'in-memory' : (await checkRedisConnection() ? 'connected' : 'disconnected');

    // Message volume per day (last 14 days)
    const messageVolume = query(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM messages
       WHERE created_at >= datetime('now', '-14 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    );

    // Top servers by member count
    const topServers = query(
      `SELECT s.id, s.name,
        (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count,
        (SELECT COUNT(*) FROM messages m
         JOIN channels c ON c.id = m.channel_id
         WHERE c.server_id = s.id) as message_count
       FROM servers s
       ORDER BY member_count DESC
       LIMIT 5`
    );

    res.json({
      members: {
        total: memberCount,
        banned: bannedCount,
        active: memberCount - bannedCount,
      },
      servers: {
        total: serverCount,
      },
      channels: {
        total: channelCount,
        text: textChannels,
        voice: voiceChannels,
      },
      messages: {
        total: totalMessages,
        last24h: messagesLast24h,
        last7d: messagesLast7d,
        last30d: messagesLast30d,
      },
      voice: {
        activeConnections: activeVoice,
      },
      moderation: {
        activeActions: activeModerations,
      },
      storage: {
        dbSizeBytes,
        dbSizeMB: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
      },
      system: {
        uptime: process.uptime(),
        redisStatus,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
      },
      messageVolume: messageVolume.rows.map(r => ({
        day: r.day,
        count: r.count,
      })),
      topServers: topServers.rows.map(s => ({
        id: s.id,
        name: s.name,
        memberCount: s.member_count,
        messageCount: s.message_count,
      })),
    });
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

export default router;
