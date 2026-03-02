/**
 * Panel Server Oversight Routes — /panel/api/servers
 *
 * Instance owner can view all servers, their details,
 * force-delete servers, and transfer ownership.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query, generateId, now, transaction } from '../../database/database.js';
import { logger } from '../../utils/logger.js';

const router = Router();

/** GET /panel/api/servers — list all servers with stats */
router.get('/', (req: PanelRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const params: any[] = [];

    if (search) {
      whereClause = 'WHERE s.name LIKE $1 OR s.id LIKE $1';
      params.push(`%${search}%`);
    }

    // Count total
    const countResult = query(
      `SELECT COUNT(*) as total FROM servers s ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    // Get servers with member and channel counts
    const serversResult = query(
      `SELECT
        s.id, s.name, s.description, s.icon_url, s.owner_id, s.invite_code,
        s.max_members, s.created_at, s.updated_at,
        (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count,
        (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id) as channel_count,
        (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id AND c.type = 'text') as text_channel_count,
        (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id AND c.type = 'voice') as voice_channel_count,
        im.username as owner_username, im.display_name as owner_display_name
       FROM servers s
       LEFT JOIN instance_members im ON im.user_id = s.owner_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      servers: serversResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        iconUrl: row.icon_url,
        ownerId: row.owner_id,
        ownerUsername: row.owner_username,
        ownerDisplayName: row.owner_display_name,
        inviteCode: row.invite_code,
        maxMembers: row.max_members,
        memberCount: row.member_count,
        channelCount: row.channel_count,
        textChannelCount: row.text_channel_count,
        voiceChannelCount: row.voice_channel_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to list servers:', error);
    res.status(500).json({ error: 'Failed to list servers' });
  }
});

/** GET /panel/api/servers/:id — detailed server view */
router.get('/:id', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;

    const serverResult = query(
      `SELECT s.*, im.username as owner_username, im.display_name as owner_display_name
       FROM servers s
       LEFT JOIN instance_members im ON im.user_id = s.owner_id
       WHERE s.id = $1`,
      [id]
    );

    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const server = serverResult.rows[0];

    // Get channels
    const channels = query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC',
      [id]
    );

    // Get members
    const members = query(
      `SELECT sm.*, im.username, im.display_name, im.avatar_url, im.is_banned
       FROM server_members sm
       JOIN instance_members im ON im.user_id = sm.user_id
       WHERE sm.server_id = $1
       ORDER BY sm.joined_at ASC`,
      [id]
    );

    // Get roles
    const roles = query(
      'SELECT * FROM roles WHERE server_id = $1 ORDER BY position DESC',
      [id]
    );

    // Get recent moderation actions
    const modActions = query(
      `SELECT ma.*, im.username as moderator_username
       FROM moderation_actions ma
       LEFT JOIN instance_members im ON im.user_id = ma.moderator_id
       WHERE ma.server_id = $1
       ORDER BY ma.created_at DESC LIMIT 20`,
      [id]
    );

    res.json({
      server: {
        id: server.id,
        name: server.name,
        description: server.description,
        iconUrl: server.icon_url,
        ownerId: server.owner_id,
        ownerUsername: server.owner_username,
        ownerDisplayName: server.owner_display_name,
        inviteCode: server.invite_code,
        maxMembers: server.max_members,
        createdAt: server.created_at,
        updatedAt: server.updated_at,
      },
      channels: channels.rows.map(ch => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        description: ch.description,
        position: ch.position,
        bitrate: ch.bitrate,
        userLimit: ch.user_limit,
      })),
      members: members.rows.map(m => ({
        id: m.id,
        userId: m.user_id,
        username: m.username,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        nickname: m.nickname,
        isBanned: !!m.is_banned,
        joinedAt: m.joined_at,
      })),
      roles: roles.rows.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: JSON.parse(r.permissions || '{}'),
      })),
      recentModeration: modActions.rows.map(a => ({
        id: a.id,
        userId: a.user_id,
        moderatorId: a.moderator_id,
        moderatorUsername: a.moderator_username,
        action: a.action,
        reason: a.reason,
        isActive: !!a.is_active,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to get server details:', error);
    res.status(500).json({ error: 'Failed to get server details' });
  }
});

/** DELETE /panel/api/servers/:id — force-delete a server */
router.delete('/:id', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;

    const serverResult = query('SELECT id, name FROM servers WHERE id = $1', [id]);
    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const serverName = serverResult.rows[0].name;

    // CASCADE handles server_members, channels, messages, roles, etc.
    transaction(() => {
      query('DELETE FROM servers WHERE id = $1', [id]);

      // Audit log
      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.server.delete', 'server', id, JSON.stringify({ serverName }), now()]
      );
    });

    res.json({ success: true, message: `Server "${serverName}" deleted` });
  } catch (error) {
    logger.error('Failed to delete server:', error);
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

/** PUT /panel/api/servers/:id/owner — transfer server ownership */
router.put('/:id/owner', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { newOwnerId } = req.body;

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      res.status(400).json({ error: 'newOwnerId is required' });
      return;
    }

    const serverResult = query('SELECT id, name, owner_id FROM servers WHERE id = $1', [id]);
    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Verify new owner is a member of the server
    const memberCheck = query(
      'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
      [id, newOwnerId]
    );
    if (memberCheck.rows.length === 0) {
      res.status(400).json({ error: 'New owner must be a member of the server' });
      return;
    }

    const previousOwner = serverResult.rows[0].owner_id;

    transaction(() => {
      query('UPDATE servers SET owner_id = $1 WHERE id = $2', [newOwnerId, id]);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.server.transfer', 'server', id,
          JSON.stringify({ previousOwner, newOwner: newOwnerId }), now()]
      );
    });

    res.json({ success: true, message: 'Server ownership transferred' });
  } catch (error) {
    logger.error('Failed to transfer server ownership:', error);
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

export default router;
