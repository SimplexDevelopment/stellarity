/**
 * Admin Subscriptions Service
 * 
 * View and manage user subscriptions from the admin panel.
 */
import { query } from '../database/postgres.js';

class AdminSubscriptionsService {

  async list(params: {
    page?: number;
    limit?: number;
    status?: string;
    tier?: string;
  }): Promise<{ subscriptions: any[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 25, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (params.status) {
      conditions.push(`s.status = $${paramIdx}`);
      values.push(params.status);
      paramIdx++;
    }

    if (params.tier) {
      conditions.push(`s.tier = $${paramIdx}`);
      values.push(params.tier);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM subscriptions s ${whereClause}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT s.*, u.username, u.email, u.display_name
       FROM subscriptions s
       LEFT JOIN users u ON s.user_id = u.id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset]
    );

    return {
      subscriptions: dataResult.rows.map(this.sanitize),
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async overrideTier(userId: string, tier: string, expiresAt?: string | null): Promise<any> {
    // Update user's subscription tier
    await query(
      `UPDATE users SET subscription_tier = $1, subscription_expires_at = $2 WHERE id = $3`,
      [tier, expiresAt || null, userId]
    );

    // Upsert subscription record
    const existing = await query('SELECT id FROM subscriptions WHERE user_id = $1', [userId]);

    if (existing.rows.length > 0) {
      await query(
        `UPDATE subscriptions SET tier = $1, status = 'active', current_period_end = $2 WHERE user_id = $3`,
        [tier, expiresAt || null, userId]
      );
    } else if (tier !== 'free') {
      await query(
        `INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', NOW(), $3)`,
        [userId, tier, expiresAt || null]
      );
    }

    return { userId, tier, expiresAt: expiresAt || null };
  }

  async getStats(): Promise<{
    tierDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
    totalPremium: number;
    totalEnterprise: number;
  }> {
    const tierResult = await query(
      `SELECT subscription_tier, COUNT(*) as count FROM users GROUP BY subscription_tier`
    );
    const tierDistribution: Record<string, number> = {};
    for (const row of tierResult.rows) {
      tierDistribution[row.subscription_tier] = parseInt(row.count, 10);
    }

    const statusResult = await query(
      `SELECT status, COUNT(*) as count FROM subscriptions GROUP BY status`
    );
    const statusDistribution: Record<string, number> = {};
    for (const row of statusResult.rows) {
      statusDistribution[row.status] = parseInt(row.count, 10);
    }

    return {
      tierDistribution,
      statusDistribution,
      totalPremium: tierDistribution['premium'] || 0,
      totalEnterprise: tierDistribution['enterprise'] || 0,
    };
  }

  private sanitize(row: any): any {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      tier: row.tier,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const adminSubscriptionsService = new AdminSubscriptionsService();
