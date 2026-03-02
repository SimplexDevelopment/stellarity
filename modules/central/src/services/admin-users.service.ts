/**
 * Admin Users Service
 * 
 * Manages user accounts from the admin perspective:
 * list, search, suspend, unsuspend, reset MFA, change tier.
 */
import { query } from '../database/postgres.js';
import { logger } from '../utils/logger.js';

class AdminUsersService {

  async list(params: {
    page?: number;
    limit?: number;
    search?: string;
    tier?: string;
    status?: string;
    suspended?: boolean;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ users: any[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 25, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (params.search) {
      conditions.push(`(LOWER(username) LIKE $${paramIdx} OR LOWER(email) LIKE $${paramIdx} OR LOWER(display_name) LIKE $${paramIdx})`);
      values.push(`%${params.search.toLowerCase()}%`);
      paramIdx++;
    }

    if (params.tier) {
      conditions.push(`subscription_tier = $${paramIdx}`);
      values.push(params.tier);
      paramIdx++;
    }

    if (params.status) {
      conditions.push(`status = $${paramIdx}`);
      values.push(params.status);
      paramIdx++;
    }

    if (params.suspended !== undefined) {
      conditions.push(`is_suspended = $${paramIdx}`);
      values.push(params.suspended);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const validSortCols: Record<string, string> = {
      username: 'username',
      email: 'email',
      created_at: 'created_at',
      last_seen_at: 'last_seen_at',
      subscription_tier: 'subscription_tier',
    };
    const sortBy = validSortCols[params.sortBy || 'created_at'] || 'created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT id, username, email, display_name, avatar_url, status, status_message,
              subscription_tier, subscription_expires_at, mfa_enabled, is_verified,
              is_suspended, suspended_at, suspension_reason,
              created_at, updated_at, last_seen_at
       FROM users ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset]
    );

    return {
      users: dataResult.rows.map(this.sanitize),
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async getById(userId: string): Promise<any> {
    const result = await query(
      `SELECT id, username, email, display_name, avatar_url, status, status_message,
              subscription_tier, subscription_expires_at, mfa_enabled, is_verified,
              is_suspended, suspended_at, suspended_by, suspension_reason,
              created_at, updated_at, last_seen_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) throw new Error('User not found');
    return this.sanitize(result.rows[0]);
  }

  async update(userId: string, updates: {
    displayName?: string;
    subscriptionTier?: string;
    subscriptionExpiresAt?: string | null;
    isVerified?: boolean;
  }): Promise<any> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (updates.displayName !== undefined) {
      sets.push(`display_name = $${paramIdx++}`);
      values.push(updates.displayName);
    }
    if (updates.subscriptionTier !== undefined) {
      sets.push(`subscription_tier = $${paramIdx++}`);
      values.push(updates.subscriptionTier);
    }
    if (updates.subscriptionExpiresAt !== undefined) {
      sets.push(`subscription_expires_at = $${paramIdx++}`);
      values.push(updates.subscriptionExpiresAt);
    }
    if (updates.isVerified !== undefined) {
      sets.push(`is_verified = $${paramIdx++}`);
      values.push(updates.isVerified);
    }

    if (sets.length === 0) throw new Error('No updates provided');

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) throw new Error('User not found');
    return this.sanitize(result.rows[0]);
  }

  async suspend(userId: string, adminId: string, reason?: string): Promise<any> {
    const result = await query(
      `UPDATE users SET is_suspended = true, suspended_at = NOW(), suspended_by = $2, suspension_reason = $3
       WHERE id = $1 RETURNING *`,
      [userId, adminId, reason || null]
    );

    if (result.rows.length === 0) throw new Error('User not found');

    // Revoke all refresh tokens for this user
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    return this.sanitize(result.rows[0]);
  }

  async unsuspend(userId: string): Promise<any> {
    const result = await query(
      `UPDATE users SET is_suspended = false, suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
       WHERE id = $1 RETURNING *`,
      [userId]
    );

    if (result.rows.length === 0) throw new Error('User not found');
    return this.sanitize(result.rows[0]);
  }

  async resetMfa(userId: string): Promise<void> {
    await query(
      `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = '[]'::jsonb
       WHERE id = $1`,
      [userId]
    );
  }

  async deleteUser(userId: string): Promise<void> {
    const result = await query('DELETE FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) throw new Error('User not found');
  }

  private sanitize(row: any): any {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      status: row.status,
      statusMessage: row.status_message,
      subscriptionTier: row.subscription_tier,
      subscriptionExpiresAt: row.subscription_expires_at,
      mfaEnabled: row.mfa_enabled,
      isVerified: row.is_verified,
      isSuspended: row.is_suspended,
      suspendedAt: row.suspended_at,
      suspendedBy: row.suspended_by,
      suspensionReason: row.suspension_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
    };
  }
}

export const adminUsersService = new AdminUsersService();
