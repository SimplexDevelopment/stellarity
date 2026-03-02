/**
 * Admin Metrics Service
 * 
 * Platform-wide metrics and DM buffer management.
 */
import { query } from '../database/postgres.js';
import { getOnlineUserCount } from '../socket/index.js';

class AdminMetricsService {

  async getDashboardMetrics(): Promise<{
    totalUsers: number;
    onlineUsers: number;
    totalInstances: number;
    activeInstances: number;
    verifiedInstances: number;
    dmBufferSize: number;
    suspendedUsers: number;
    mfaEnabledUsers: number;
    registrationsToday: number;
    registrationsThisWeek: number;
    tierDistribution: Record<string, number>;
  }> {
    const [
      userCountResult,
      instanceCountResult,
      activeInstanceResult,
      verifiedInstanceResult,
      bufferSizeResult,
      suspendedResult,
      mfaResult,
      regTodayResult,
      regWeekResult,
      tierResult,
    ] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM instance_registry'),
      query(`SELECT COUNT(*) FROM instance_registry WHERE last_heartbeat_at > NOW() - INTERVAL '5 minutes'`),
      query('SELECT COUNT(*) FROM instance_registry WHERE is_verified = true'),
      query('SELECT COUNT(*) FROM dm_buffer WHERE delivered_at IS NULL'),
      query('SELECT COUNT(*) FROM users WHERE is_suspended = true'),
      query('SELECT COUNT(*) FROM users WHERE mfa_enabled = true'),
      query(`SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE`),
      query(`SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`),
      query('SELECT subscription_tier, COUNT(*) as count FROM users GROUP BY subscription_tier'),
    ]);

    const tierDistribution: Record<string, number> = {};
    for (const row of tierResult.rows) {
      tierDistribution[row.subscription_tier] = parseInt(row.count, 10);
    }

    return {
      totalUsers: parseInt(userCountResult.rows[0].count, 10),
      onlineUsers: getOnlineUserCount(),
      totalInstances: parseInt(instanceCountResult.rows[0].count, 10),
      activeInstances: parseInt(activeInstanceResult.rows[0].count, 10),
      verifiedInstances: parseInt(verifiedInstanceResult.rows[0].count, 10),
      dmBufferSize: parseInt(bufferSizeResult.rows[0].count, 10),
      suspendedUsers: parseInt(suspendedResult.rows[0].count, 10),
      mfaEnabledUsers: parseInt(mfaResult.rows[0].count, 10),
      registrationsToday: parseInt(regTodayResult.rows[0].count, 10),
      registrationsThisWeek: parseInt(regWeekResult.rows[0].count, 10),
      tierDistribution,
    };
  }

  async getRegistrationHistory(days: number = 30): Promise<Array<{ date: string; count: number }>> {
    const result = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    return result.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      count: parseInt(row.count, 10),
    }));
  }

  async getDmBufferStats(): Promise<{
    totalPending: number;
    totalDelivered: number;
    totalExpired: number;
    conversations: any[];
  }> {
    const [pendingResult, deliveredResult, expiredResult, conversationResult] = await Promise.all([
      query('SELECT COUNT(*) FROM dm_buffer WHERE delivered_at IS NULL AND expires_at > NOW()'),
      query('SELECT COUNT(*) FROM dm_buffer WHERE delivered_at IS NOT NULL'),
      query('SELECT COUNT(*) FROM dm_buffer WHERE expires_at <= NOW() AND delivered_at IS NULL'),
      query(
        `SELECT dc.id, u1.username as user1, u2.username as user2,
                COUNT(db.id) FILTER (WHERE db.delivered_at IS NULL) as pending_count,
                MAX(db.created_at) as last_message_at
         FROM dm_conversations dc
         JOIN users u1 ON dc.user1_id = u1.id
         JOIN users u2 ON dc.user2_id = u2.id
         LEFT JOIN dm_buffer db ON db.conversation_id = dc.id
         GROUP BY dc.id, u1.username, u2.username
         HAVING COUNT(db.id) FILTER (WHERE db.delivered_at IS NULL) > 0
         ORDER BY pending_count DESC
         LIMIT 50`
      ),
    ]);

    return {
      totalPending: parseInt(pendingResult.rows[0].count, 10),
      totalDelivered: parseInt(deliveredResult.rows[0].count, 10),
      totalExpired: parseInt(expiredResult.rows[0].count, 10),
      conversations: conversationResult.rows.map(row => ({
        id: row.id,
        user1: row.user1,
        user2: row.user2,
        pendingCount: parseInt(row.pending_count, 10),
        lastMessageAt: row.last_message_at,
      })),
    };
  }

  async purgeDmBuffer(conversationId: string): Promise<{ purged: number }> {
    const result = await query(
      'DELETE FROM dm_buffer WHERE conversation_id = $1 AND delivered_at IS NULL',
      [conversationId]
    );
    return { purged: result.rowCount || 0 };
  }

  async purgeExpiredDmBuffers(): Promise<{ purged: number }> {
    const result = await query(
      'DELETE FROM dm_buffer WHERE expires_at <= NOW() AND delivered_at IS NULL'
    );
    return { purged: result.rowCount || 0 };
  }
}

export const adminMetricsService = new AdminMetricsService();
