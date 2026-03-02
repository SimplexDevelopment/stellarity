import { query, generateId, now } from '../database/database.js';
import { logger } from '../utils/logger.js';

import type { TokenUser, MemberUser } from '@stellarity/shared';

export interface InstanceMember {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  lastSeenAt: string | null;
  isBanned: boolean;
  banReason: string | null;
  notes: string | null;
}

class InstanceMemberService {
  /**
   * Ensure a user from the central auth system is registered as an instance member.
   * Called on first connection to this instance. Upserts to handle profile changes.
   */
  async ensureMember(tokenUser: TokenUser): Promise<InstanceMember> {
    const timestamp = now();

    // SQLite upsert
    const result = query(
      `INSERT INTO instance_members (user_id, username, display_name, avatar_url, last_seen_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         last_seen_at = excluded.last_seen_at
       RETURNING user_id, username, display_name, avatar_url, joined_at, last_seen_at, is_banned, ban_reason, notes`,
      [tokenUser.sub, tokenUser.username, tokenUser.displayName, tokenUser.avatarUrl, timestamp]
    );

    const row = result.rows[0];
    logger.debug(`Member ensured on instance: ${tokenUser.username}`);

    return this.mapMember(row);
  }

  /** Get a member by their central user ID */
  async getMember(userId: string): Promise<InstanceMember | null> {
    const result = query(
      `SELECT user_id, username, display_name, avatar_url, joined_at, last_seen_at,
              is_banned, ban_reason, notes
       FROM instance_members WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;
    return this.mapMember(result.rows[0]);
  }

  /** Get member user info for display purposes */
  async getMemberUser(userId: string): Promise<MemberUser | null> {
    const result = query(
      `SELECT user_id, username, display_name, avatar_url
       FROM instance_members WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    };
  }

  /** Check if a user is banned from the instance */
  async isBanned(userId: string): Promise<boolean> {
    const result = query(
      'SELECT is_banned FROM instance_members WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return false;
    return !!result.rows[0].is_banned;
  }

  /** Update last seen timestamp */
  async updateLastSeen(userId: string): Promise<void> {
    query(
      'UPDATE instance_members SET last_seen_at = $1 WHERE user_id = $2',
      [now(), userId]
    );
  }

  /** Get total member count for this instance */
  async getMemberCount(): Promise<number> {
    const result = query('SELECT COUNT(*) as count FROM instance_members');
    return result.rows[0].count;
  }

  /** Remove a member from the instance */
  async removeMember(userId: string): Promise<void> {
    query('DELETE FROM instance_members WHERE user_id = $1', [userId]);
    logger.info(`Member removed from instance: ${userId}`);
  }

  /** Update instance-level notes on a user */
  async setNotes(userId: string, notes: string | null): Promise<void> {
    query('UPDATE instance_members SET notes = $1 WHERE user_id = $2', [notes, userId]);
  }

  /** Log an audit event on this instance */
  async logAuditEvent(
    userId: string | null,
    action: string,
    targetType?: string,
    targetId?: string | null,
    details?: object | null,
    ipAddress?: string
  ): Promise<void> {
    try {
      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), userId, action, targetType, targetId, details ? JSON.stringify(details) : null, ipAddress]
      );
    } catch (error) {
      logger.error('Failed to log audit event:', error);
    }
  }

  private mapMember(row: any): InstanceMember {
    return {
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      joinedAt: row.joined_at,
      lastSeenAt: row.last_seen_at,
      isBanned: !!row.is_banned,
      banReason: row.ban_reason,
      notes: row.notes,
    };
  }
}

export const instanceMemberService = new InstanceMemberService();
