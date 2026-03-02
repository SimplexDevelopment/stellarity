import { query, generateId, now } from '../database/database.js';
import { logger } from '../utils/logger.js';
import { serverService } from './server.service.js';
import { instanceMemberService } from './auth.service.js';

import type {
  ModerationAction,
  ModerationActionType,
  CreateModerationInput,
  ModerationSummary,
} from '@stellarity/shared';

class ModerationService {
  /**
   * Execute a moderation action (ban, kick, mute, warn, timeout).
   * Validates permissions before applying.
   */
  async executeAction(input: CreateModerationInput): Promise<ModerationAction> {
    const { serverId, userId, moderatorId, action, reason, duration } = input;

    // Validate moderator has permission
    await this.validatePermission(serverId, moderatorId, action);

    // Cannot moderate self
    if (userId === moderatorId) {
      throw new Error('Cannot moderate yourself');
    }

    // Cannot moderate the server owner
    const isOwner = await serverService.isServerOwner(serverId, userId);
    if (isOwner) {
      throw new Error('Cannot moderate the server owner');
    }

    // Deactivate any previous active action of the same type
    query(
      `UPDATE moderation_actions SET is_active = 0
       WHERE server_id = $1 AND user_id = $2 AND action = $3 AND is_active = 1`,
      [serverId, userId, action]
    );

    // Calculate expiry for timed actions
    let expiresAt: string | null = null;
    if (duration && (action === 'timeout' || action === 'mute')) {
      const expiry = new Date(Date.now() + duration * 1000);
      expiresAt = expiry.toISOString();
    }

    const id = generateId();
    const createdAt = now();

    query(
      `INSERT INTO moderation_actions (id, server_id, user_id, moderator_id, action, reason, duration, expires_at, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, serverId, userId, moderatorId, action, reason || null, duration || null, expiresAt, 1, createdAt]
    );

    // Execute side effects
    switch (action) {
      case 'ban':
        // Remove from server
        await serverService.removeMember(serverId, userId);
        // Mark as banned in instance member data
        query(
          `UPDATE instance_members SET is_banned = 1, ban_reason = $1 WHERE user_id = $2`,
          [reason || 'Banned by moderator', userId]
        );
        break;

      case 'kick':
        // Remove from server (they can rejoin unless banned)
        await serverService.removeMember(serverId, userId);
        break;

      case 'mute':
      case 'timeout':
        // These are checked in real-time by the socket/message handlers
        break;

      case 'warn':
        // Logged only — no enforcement side effect
        break;
    }

    // Log audit event
    instanceMemberService.logAuditEvent(
      moderatorId,
      `moderation:${action}`,
      `${action} user ${userId} in server ${serverId}${reason ? `: ${reason}` : ''}`
    );

    logger.info(
      `Moderation: ${moderatorId} ${action}ed ${userId} in server ${serverId}${reason ? ` — ${reason}` : ''}`
    );

    return {
      id,
      serverId,
      userId,
      moderatorId,
      action,
      reason: reason || null,
      duration: duration || null,
      expiresAt,
      isActive: true,
      createdAt,
    };
  }

  /** Revoke an active moderation action (e.g. unban, unmute) */
  async revokeAction(
    actionId: string,
    moderatorId: string,
    serverId: string
  ): Promise<void> {
    // Validate moderator
    const actionResult = query(
      `SELECT * FROM moderation_actions WHERE id = $1 AND server_id = $2`,
      [actionId, serverId]
    );

    if (actionResult.rows.length === 0) {
      throw new Error('Moderation action not found');
    }

    const modAction = this.mapAction(actionResult.rows[0]);

    // Need same permission to revoke
    await this.validatePermission(serverId, moderatorId, modAction.action);

    query(
      `UPDATE moderation_actions SET is_active = 0 WHERE id = $1`,
      [actionId]
    );

    // Undo side effects
    if (modAction.action === 'ban') {
      query(
        `UPDATE instance_members SET is_banned = 0, ban_reason = NULL WHERE user_id = $1`,
        [modAction.userId]
      );
    }

    instanceMemberService.logAuditEvent(
      moderatorId,
      `moderation:revoke:${modAction.action}`,
      `Revoked ${modAction.action} on user ${modAction.userId} in server ${serverId}`
    );

    logger.info(`Moderation: ${moderatorId} revoked ${modAction.action} on ${modAction.userId}`);
  }

  /** Unban a user from a server */
  async unbanUser(serverId: string, userId: string, moderatorId: string): Promise<void> {
    await this.validatePermission(serverId, moderatorId, 'ban');

    // Find active ban
    const banResult = query(
      `SELECT id FROM moderation_actions
       WHERE server_id = $1 AND user_id = $2 AND action = 'ban' AND is_active = 1
       ORDER BY created_at DESC LIMIT 1`,
      [serverId, userId]
    );

    if (banResult.rows.length === 0) {
      throw new Error('No active ban found for this user');
    }

    await this.revokeAction(banResult.rows[0].id, moderatorId, serverId);
  }

  /** Check if a user is banned from a server */
  isUserBanned(serverId: string, userId: string): boolean {
    const result = query(
      `SELECT id FROM moderation_actions
       WHERE server_id = $1 AND user_id = $2 AND action = 'ban' AND is_active = 1
       LIMIT 1`,
      [serverId, userId]
    );
    return result.rows.length > 0;
  }

  /** Check if a user is muted or timed out in a server */
  isUserMuted(serverId: string, userId: string): boolean {
    const currentTime = now();
    const result = query(
      `SELECT id FROM moderation_actions
       WHERE server_id = $1 AND user_id = $2
         AND action IN ('mute', 'timeout')
         AND is_active = 1
         AND (expires_at IS NULL OR expires_at > $3)
       LIMIT 1`,
      [serverId, userId, currentTime]
    );
    return result.rows.length > 0;
  }

  /** Get moderation history for a user in a server */
  getUserActions(serverId: string, userId: string, limit = 50): ModerationAction[] {
    const result = query(
      `SELECT * FROM moderation_actions
       WHERE server_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [serverId, userId, limit]
    );
    return result.rows.map((r: any) => this.mapAction(r));
  }

  /** Get all active moderation actions for a server */
  getActiveActions(serverId: string): ModerationAction[] {
    const result = query(
      `SELECT * FROM moderation_actions
       WHERE server_id = $1 AND is_active = 1
       ORDER BY created_at DESC`,
      [serverId]
    );
    return result.rows.map((r: any) => this.mapAction(r));
  }

  /** Get moderation summary for a user in a server */
  getUserSummary(serverId: string, userId: string): ModerationSummary {
    const isBanned = this.isUserBanned(serverId, userId);
    const isMuted = this.isUserMuted(serverId, userId);

    // Check for active timeout specifically
    const currentTime = now();
    const timeoutResult = query(
      `SELECT expires_at FROM moderation_actions
       WHERE server_id = $1 AND user_id = $2
         AND action = 'timeout' AND is_active = 1
         AND expires_at > $3
       ORDER BY expires_at DESC LIMIT 1`,
      [serverId, userId, currentTime]
    );
    const isTimedOut = timeoutResult.rows.length > 0;
    const timeoutExpiresAt = isTimedOut ? timeoutResult.rows[0].expires_at : null;

    // Total and recent actions
    const countResult = query(
      `SELECT COUNT(*) as total FROM moderation_actions
       WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId]
    );
    const totalActions = Number(countResult.rows[0].total);

    const recentActions = this.getUserActions(serverId, userId, 10);

    return {
      userId,
      serverId,
      isBanned,
      isMuted,
      isTimedOut,
      timeoutExpiresAt,
      totalActions,
      recentActions,
    };
  }

  /** Get full ban list for a server */
  getBanList(serverId: string): ModerationAction[] {
    const result = query(
      `SELECT * FROM moderation_actions
       WHERE server_id = $1 AND action = 'ban' AND is_active = 1
       ORDER BY created_at DESC`,
      [serverId]
    );
    return result.rows.map((r: any) => this.mapAction(r));
  }

  /** Expire timed-out moderation actions (call periodically) */
  expireActions(): number {
    const currentTime = now();
    const result = query(
      `UPDATE moderation_actions SET is_active = 0
       WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= $1`,
      [currentTime]
    );
    const expired = result.rowCount || 0;
    if (expired > 0) {
      logger.info(`Expired ${expired} moderation action(s)`);
    }
    return expired;
  }

  /** Validate moderator has the required permission for the action type */
  private async validatePermission(
    serverId: string,
    moderatorId: string,
    action: ModerationActionType
  ): Promise<void> {
    const permissionMap: Record<ModerationActionType, string> = {
      ban: 'banMembers',
      kick: 'kickMembers',
      mute: 'muteMembers',
      timeout: 'muteMembers',
      warn: 'kickMembers', // warn requires at least kick permission
    };

    const requiredPermission = permissionMap[action];
    const hasPermission = await serverService.hasPermission(serverId, moderatorId, requiredPermission);

    if (!hasPermission) {
      throw new Error(`Missing permission: ${requiredPermission}`);
    }
  }

  private mapAction(row: any): ModerationAction {
    return {
      id: row.id,
      serverId: row.server_id,
      userId: row.user_id,
      moderatorId: row.moderator_id,
      action: row.action,
      reason: row.reason,
      duration: row.duration,
      expiresAt: row.expires_at,
      isActive: !!row.is_active,
      createdAt: row.created_at,
    };
  }
}

export const moderationService = new ModerationService();
