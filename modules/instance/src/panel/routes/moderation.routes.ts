/**
 * Panel Moderation Oversight Routes — /panel/api/moderation
 *
 * View and manage moderation actions across all servers.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query, generateId, now } from '../../database/database.js';
import { logger } from '../../utils/logger.js';

const router = Router();

/** GET /panel/api/moderation/actions — all moderation actions */
router.get('/actions', (req: PanelRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const serverId = req.query.serverId as string;
    const actionType = req.query.action as string;
    const activeOnly = req.query.active === 'true';

    const conditions: string[] = [];
    const params: any[] = [];

    if (serverId) {
      conditions.push(`ma.server_id = $${params.length + 1}`);
      params.push(serverId);
    }
    if (actionType) {
      conditions.push(`ma.action = $${params.length + 1}`);
      params.push(actionType);
    }
    if (activeOnly) {
      conditions.push('ma.is_active = 1');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = query(
      `SELECT COUNT(*) as total FROM moderation_actions ma ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const actionsResult = query(
      `SELECT ma.*,
        s.name as server_name,
        im_user.username as user_username,
        im_user.display_name as user_display_name,
        im_mod.username as moderator_username
       FROM moderation_actions ma
       JOIN servers s ON s.id = ma.server_id
       LEFT JOIN instance_members im_user ON im_user.user_id = ma.user_id
       LEFT JOIN instance_members im_mod ON im_mod.user_id = ma.moderator_id
       ${whereClause}
       ORDER BY ma.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      actions: actionsResult.rows.map(a => ({
        id: a.id,
        serverId: a.server_id,
        serverName: a.server_name,
        userId: a.user_id,
        userUsername: a.user_username,
        userDisplayName: a.user_display_name,
        moderatorId: a.moderator_id,
        moderatorUsername: a.moderator_username,
        action: a.action,
        reason: a.reason,
        duration: a.duration,
        expiresAt: a.expires_at,
        isActive: !!a.is_active,
        createdAt: a.created_at,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to list moderation actions:', error);
    res.status(500).json({ error: 'Failed to list moderation actions' });
  }
});

/** GET /panel/api/moderation/banned — currently banned users */
router.get('/banned', (req: PanelRequest, res: Response) => {
  try {
    // Instance-level bans
    const instanceBans = query(
      `SELECT user_id, username, display_name, ban_reason
       FROM instance_members WHERE is_banned = 1
       ORDER BY username ASC`
    );

    // Server-level active bans
    const serverBans = query(
      `SELECT ma.user_id, ma.server_id, ma.reason, ma.created_at, ma.expires_at,
        s.name as server_name,
        im.username as user_username
       FROM moderation_actions ma
       JOIN servers s ON s.id = ma.server_id
       LEFT JOIN instance_members im ON im.user_id = ma.user_id
       WHERE ma.action = 'ban' AND ma.is_active = 1
       ORDER BY ma.created_at DESC`
    );

    res.json({
      instanceBans: instanceBans.rows.map(b => ({
        userId: b.user_id,
        username: b.username,
        displayName: b.display_name,
        reason: b.ban_reason,
      })),
      serverBans: serverBans.rows.map(b => ({
        userId: b.user_id,
        username: b.user_username,
        serverId: b.server_id,
        serverName: b.server_name,
        reason: b.reason,
        createdAt: b.created_at,
        expiresAt: b.expires_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to list banned users:', error);
    res.status(500).json({ error: 'Failed to list banned users' });
  }
});

/** PUT /panel/api/moderation/actions/:id/revoke — revoke an active moderation action */
router.put('/actions/:id/revoke', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;

    const actionResult = query(
      `SELECT ma.*, s.name as server_name, im.username as user_username
       FROM moderation_actions ma
       JOIN servers s ON s.id = ma.server_id
       LEFT JOIN instance_members im ON im.user_id = ma.user_id
       WHERE ma.id = $1`,
      [id]
    );

    if (actionResult.rows.length === 0) {
      res.status(404).json({ error: 'Moderation action not found' });
      return;
    }

    const action = actionResult.rows[0];

    if (!action.is_active) {
      res.status(400).json({ error: 'Moderation action is already inactive' });
      return;
    }

    query('UPDATE moderation_actions SET is_active = 0 WHERE id = $1', [id]);

    // If it was an instance ban, also unban from instance_members
    if (action.action === 'ban') {
      query(
        'UPDATE instance_members SET is_banned = 0, ban_reason = NULL WHERE user_id = $1',
        [action.user_id]
      );
    }

    // Audit log
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.moderation.revoke', 'moderation_action', id,
        JSON.stringify({
          action: action.action,
          userId: action.user_id,
          username: action.user_username,
          serverId: action.server_id,
          serverName: action.server_name,
        }), now()]
    );

    res.json({
      success: true,
      message: `${action.action} against ${action.user_username || action.user_id} revoked`,
    });
  } catch (error) {
    logger.error('Failed to revoke moderation action:', error);
    res.status(500).json({ error: 'Failed to revoke moderation action' });
  }
});

export default router;
