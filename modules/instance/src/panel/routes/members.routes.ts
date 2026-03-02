/**
 * Panel Member Management Routes — /panel/api/members
 *
 * Instance-wide member list, ban/unban, remove from instance.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query, generateId, now, transaction } from '../../database/database.js';
import { logger } from '../../utils/logger.js';

const router = Router();

/** GET /panel/api/members — instance-wide member list */
router.get('/', (req: PanelRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const filter = (req.query.filter as string) || 'all'; // all, banned, active

    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      conditions.push(`(im.username LIKE $${params.length + 1} OR im.display_name LIKE $${params.length + 1} OR im.user_id LIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (filter === 'banned') {
      conditions.push('im.is_banned = 1');
    } else if (filter === 'active') {
      conditions.push('im.is_banned = 0');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = query(
      `SELECT COUNT(*) as total FROM instance_members im ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const membersResult = query(
      `SELECT im.*,
        (SELECT COUNT(*) FROM server_members sm WHERE sm.user_id = im.user_id) as server_count
       FROM instance_members im
       ${whereClause}
       ORDER BY im.joined_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      members: membersResult.rows.map(m => ({
        userId: m.user_id,
        username: m.username,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        joinedAt: m.joined_at,
        lastSeenAt: m.last_seen_at,
        isBanned: !!m.is_banned,
        banReason: m.ban_reason,
        notes: m.notes,
        serverCount: m.server_count,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to list members:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/** GET /panel/api/members/:userId — member detail */
router.get('/:userId', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const memberResult = query(
      'SELECT * FROM instance_members WHERE user_id = $1',
      [userId]
    );

    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const member = memberResult.rows[0];

    // Servers the member is in
    const servers = query(
      `SELECT sm.*, s.name as server_name, s.owner_id
       FROM server_members sm
       JOIN servers s ON s.id = sm.server_id
       WHERE sm.user_id = $1`,
      [userId]
    );

    // Moderation history
    const modHistory = query(
      `SELECT ma.*, s.name as server_name, im.username as moderator_username
       FROM moderation_actions ma
       JOIN servers s ON s.id = ma.server_id
       LEFT JOIN instance_members im ON im.user_id = ma.moderator_id
       WHERE ma.user_id = $1
       ORDER BY ma.created_at DESC`,
      [userId]
    );

    // Roles across all servers
    const roles = query(
      `SELECT r.*, s.name as server_name
       FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       JOIN server_members sm ON sm.id = mr.member_id
       JOIN servers s ON s.id = r.server_id
       WHERE sm.user_id = $1`,
      [userId]
    );

    res.json({
      member: {
        userId: member.user_id,
        username: member.username,
        displayName: member.display_name,
        avatarUrl: member.avatar_url,
        joinedAt: member.joined_at,
        lastSeenAt: member.last_seen_at,
        isBanned: !!member.is_banned,
        banReason: member.ban_reason,
        notes: member.notes,
      },
      servers: servers.rows.map(s => ({
        serverId: s.server_id,
        serverName: s.server_name,
        nickname: s.nickname,
        isOwner: s.owner_id === userId,
        joinedAt: s.joined_at,
      })),
      moderationHistory: modHistory.rows.map(a => ({
        id: a.id,
        serverId: a.server_id,
        serverName: a.server_name,
        moderatorId: a.moderator_id,
        moderatorUsername: a.moderator_username,
        action: a.action,
        reason: a.reason,
        duration: a.duration,
        expiresAt: a.expires_at,
        isActive: !!a.is_active,
        createdAt: a.created_at,
      })),
      roles: roles.rows.map(r => ({
        roleId: r.id,
        roleName: r.name,
        serverName: r.server_name,
        color: r.color,
      })),
    });
  } catch (error) {
    logger.error('Failed to get member details:', error);
    res.status(500).json({ error: 'Failed to get member details' });
  }
});

/** PUT /panel/api/members/:userId/ban — instance-wide ban */
router.put('/:userId/ban', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const memberResult = query(
      'SELECT user_id, username FROM instance_members WHERE user_id = $1',
      [userId]
    );

    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const username = memberResult.rows[0].username;

    transaction(() => {
      // Set instance-level ban
      query(
        'UPDATE instance_members SET is_banned = 1, ban_reason = $1 WHERE user_id = $2',
        [reason || 'Banned by instance owner', userId]
      );

      // Remove from all servers
      query('DELETE FROM server_members WHERE user_id = $1', [userId]);

      // Audit log
      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.member.ban', 'member', userId,
          JSON.stringify({ username, reason: reason || 'Banned by instance owner' }), now()]
      );
    });

    res.json({ success: true, message: `${username} banned from instance` });
  } catch (error) {
    logger.error('Failed to ban member:', error);
    res.status(500).json({ error: 'Failed to ban member' });
  }
});

/** PUT /panel/api/members/:userId/unban — remove instance ban */
router.put('/:userId/unban', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const memberResult = query(
      'SELECT user_id, username FROM instance_members WHERE user_id = $1',
      [userId]
    );

    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const username = memberResult.rows[0].username;

    transaction(() => {
      query(
        'UPDATE instance_members SET is_banned = 0, ban_reason = NULL WHERE user_id = $1',
        [userId]
      );

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.member.unban', 'member', userId,
          JSON.stringify({ username }), now()]
      );
    });

    res.json({ success: true, message: `${username} unbanned` });
  } catch (error) {
    logger.error('Failed to unban member:', error);
    res.status(500).json({ error: 'Failed to unban member' });
  }
});

/** DELETE /panel/api/members/:userId — remove member from instance entirely */
router.delete('/:userId', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const memberResult = query(
      'SELECT user_id, username FROM instance_members WHERE user_id = $1',
      [userId]
    );

    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const username = memberResult.rows[0].username;

    transaction(() => {
      // Remove from all servers
      query('DELETE FROM server_members WHERE user_id = $1', [userId]);
      // Remove from instance
      query('DELETE FROM instance_members WHERE user_id = $1', [userId]);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.member.remove', 'member', userId,
          JSON.stringify({ username }), now()]
      );
    });

    res.json({ success: true, message: `${username} removed from instance` });
  } catch (error) {
    logger.error('Failed to remove member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/** PUT /panel/api/members/:userId/notes — update member notes */
router.put('/:userId/notes', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    query('UPDATE instance_members SET notes = $1 WHERE user_id = $2', [notes || null, userId]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update member notes:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

export default router;
