/**
 * Panel Server Oversight Routes — /panel/api/servers
 *
 * Instance owner can view all servers, their details,
 * create servers, edit server metadata, force-delete servers,
 * transfer ownership, and regenerate invite codes.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query, generateId, now, transaction } from '../../database/database.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

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
      whereClause = 'WHERE s.name LIKE $1 OR s.id LIKE $2';
      params.push(`%${search}%`, `%${search}%`);
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

    // Get categories
    const categoriesResult = query(
      'SELECT * FROM categories WHERE server_id = $1 ORDER BY position ASC',
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
        categoryId: ch.category_id,
        position: ch.position,
        bitrate: ch.bitrate,
        userLimit: ch.user_limit,
      })),
      categories: categoriesResult.rows.map(cat => ({
        id: cat.id,
        name: cat.name,
        position: cat.position,
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

/** POST /panel/api/servers — create a new server */
router.post('/', (req: PanelRequest, res: Response) => {
  try {
    const { name, description, ownerId, maxMembers } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Server name is required' });
      return;
    }

    if (!ownerId || typeof ownerId !== 'string') {
      res.status(400).json({ error: 'Owner ID is required' });
      return;
    }

    // Verify owner exists as an instance member
    const ownerCheck = query('SELECT user_id FROM instance_members WHERE user_id = $1', [ownerId]);
    if (ownerCheck.rows.length === 0) {
      res.status(400).json({ error: 'Owner must be a registered instance member' });
      return;
    }

    const serverId = generateId();
    const inviteCode = crypto.randomBytes(4).toString('hex');
    const timestamp = now();

    transaction(() => {
      query(
        `INSERT INTO servers (id, name, description, owner_id, invite_code, max_members, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [serverId, name.trim(), description?.trim() || null, ownerId, inviteCode, maxMembers || 100, timestamp, timestamp]
      );

      // Add owner as a server member
      query(
        `INSERT INTO server_members (id, server_id, user_id, joined_at)
         VALUES ($1, $2, $3, $4)`,
        [generateId(), serverId, ownerId, timestamp]
      );

      // Create default "General" category and text channel
      const categoryId = generateId();
      query(
        `INSERT INTO categories (id, server_id, name, position, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [categoryId, serverId, 'General', 0, timestamp]
      );

      query(
        `INSERT INTO channels (id, server_id, category_id, name, type, position, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [generateId(), serverId, categoryId, 'general', 'text', 0, timestamp, timestamp]
      );

      // Create default @everyone role
      query(
        `INSERT INTO roles (id, server_id, name, color, position, permissions, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), serverId, '@everyone', null, 0, JSON.stringify({}), timestamp]
      );

      // Audit log
      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.server.create', 'server', serverId,
          JSON.stringify({ name: name.trim(), ownerId }), timestamp]
      );
    });

    res.json({ success: true, serverId, inviteCode });
  } catch (error) {
    logger.error('Failed to create server:', error);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

/** PUT /panel/api/servers/:id — edit server metadata */
router.put('/:id', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, maxMembers } = req.body;

    const serverResult = query('SELECT id, name, description, max_members FROM servers WHERE id = $1', [id]);
    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const changes: Record<string, any> = {};
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
      changes.name = { from: serverResult.rows[0].name, to: name.trim() };
    }

    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(description?.trim() || null);
      changes.description = { from: serverResult.rows[0].description, to: description?.trim() || null };
    }

    if (maxMembers !== undefined && typeof maxMembers === 'number' && maxMembers > 0) {
      setClauses.push(`max_members = $${paramIndex++}`);
      params.push(maxMembers);
      changes.maxMembers = { from: serverResult.rows[0].max_members, to: maxMembers };
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push(`updated_at = $${paramIndex++}`);
    params.push(now());
    params.push(id);

    transaction(() => {
      query(`UPDATE servers SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`, params);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.server.edit', 'server', id,
          JSON.stringify({ changes }), now()]
      );
    });

    res.json({ success: true, message: 'Server updated', changes: Object.keys(changes) });
  } catch (error) {
    logger.error('Failed to update server:', error);
    res.status(500).json({ error: 'Failed to update server' });
  }
});

/** POST /panel/api/servers/:id/regenerate-invite — regenerate invite code */
router.post('/:id/regenerate-invite', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;

    const serverResult = query('SELECT id, name, invite_code FROM servers WHERE id = $1', [id]);
    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const oldInviteCode = serverResult.rows[0].invite_code;
    const newInviteCode = crypto.randomBytes(4).toString('hex');

    transaction(() => {
      query('UPDATE servers SET invite_code = $1, updated_at = $2 WHERE id = $3', [newInviteCode, now(), id]);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.server.regenerate-invite', 'server', id,
          JSON.stringify({ oldInviteCode, newInviteCode }), now()]
      );
    });

    res.json({ success: true, inviteCode: newInviteCode });
  } catch (error) {
    logger.error('Failed to regenerate invite code:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

// ══════════════════════════════════════════════════════════
// Category Management (sub-resource of server)
// ══════════════════════════════════════════════════════════

/** POST /panel/api/servers/:id/categories — create a category */
router.post('/:id/categories', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId } = req.params;
    const { name, position } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }

    const serverCheck = query('SELECT id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Get next position if not specified
    const nextPos = position ?? (() => {
      const maxResult = query('SELECT MAX(position) as max_pos FROM categories WHERE server_id = $1', [serverId]);
      return (maxResult.rows[0]?.max_pos ?? -1) + 1;
    })();

    const categoryId = generateId();
    const timestamp = now();

    transaction(() => {
      query(
        `INSERT INTO categories (id, server_id, name, position, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [categoryId, serverId, name.trim(), nextPos, timestamp]
      );

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.category.create', 'category', categoryId,
          JSON.stringify({ name: name.trim(), serverId }), timestamp]
      );
    });

    res.json({ success: true, categoryId });
  } catch (error) {
    logger.error('Failed to create category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

/** PUT /panel/api/servers/:id/categories/:catId — update a category */
router.put('/:id/categories/:catId', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId, catId } = req.params;
    const { name, position } = req.body;

    const catResult = query('SELECT * FROM categories WHERE id = $1 AND server_id = $2', [catId, serverId]);
    if (catResult.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      setClauses.push(`name = $${idx++}`);
      params.push(name.trim());
    }
    if (position !== undefined && typeof position === 'number') {
      setClauses.push(`position = $${idx++}`);
      params.push(position);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    params.push(catId);
    query(`UPDATE categories SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.category.edit', 'category', catId,
        JSON.stringify({ serverId, changes: { name, position } }), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/** DELETE /panel/api/servers/:id/categories/:catId — delete a category */
router.delete('/:id/categories/:catId', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId, catId } = req.params;

    const catResult = query('SELECT * FROM categories WHERE id = $1 AND server_id = $2', [catId, serverId]);
    if (catResult.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const catName = catResult.rows[0].name;

    transaction(() => {
      // Move channels in this category to uncategorized (null)
      query('UPDATE channels SET category_id = NULL WHERE category_id = $1', [catId]);
      query('DELETE FROM categories WHERE id = $1', [catId]);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.category.delete', 'category', catId,
          JSON.stringify({ serverId, name: catName }), now()]
      );
    });

    res.json({ success: true, message: `Category "${catName}" deleted` });
  } catch (error) {
    logger.error('Failed to delete category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ══════════════════════════════════════════════════════════
// Channel Management (sub-resource of server)
// ══════════════════════════════════════════════════════════

/** POST /panel/api/servers/:id/channels — create a channel */
router.post('/:id/channels', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId } = req.params;
    const { name, type, description, categoryId, position, bitrate, userLimit } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Channel name is required' });
      return;
    }

    const channelType = type === 'voice' ? 'voice' : 'text';

    const serverCheck = query('SELECT id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Validate category if provided
    if (categoryId) {
      const catCheck = query('SELECT id FROM categories WHERE id = $1 AND server_id = $2', [categoryId, serverId]);
      if (catCheck.rows.length === 0) {
        res.status(400).json({ error: 'Category not found in this server' });
        return;
      }
    }

    const nextPos = position ?? (() => {
      const maxResult = query('SELECT MAX(position) as max_pos FROM channels WHERE server_id = $1', [serverId]);
      return (maxResult.rows[0]?.max_pos ?? -1) + 1;
    })();

    const channelId = generateId();
    const timestamp = now();

    transaction(() => {
      query(
        `INSERT INTO channels (id, server_id, category_id, name, type, description, position, bitrate, user_limit, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [channelId, serverId, categoryId || null, name.trim(), channelType, description?.trim() || null,
          nextPos, bitrate || null, userLimit || null, timestamp, timestamp]
      );

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.channel.create', 'channel', channelId,
          JSON.stringify({ name: name.trim(), type: channelType, serverId }), timestamp]
      );
    });

    res.json({ success: true, channelId });
  } catch (error) {
    logger.error('Failed to create channel:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

/** PUT /panel/api/servers/:id/channels/:chId — update a channel */
router.put('/:id/channels/:chId', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId, chId } = req.params;
    const { name, description, categoryId, position, bitrate, userLimit } = req.body;

    const chResult = query('SELECT * FROM channels WHERE id = $1 AND server_id = $2', [chId, serverId]);
    if (chResult.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      setClauses.push(`name = $${idx++}`);
      params.push(name.trim());
    }
    if (description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      params.push(description?.trim() || null);
    }
    if (categoryId !== undefined) {
      setClauses.push(`category_id = $${idx++}`);
      params.push(categoryId || null);
    }
    if (position !== undefined && typeof position === 'number') {
      setClauses.push(`position = $${idx++}`);
      params.push(position);
    }
    if (bitrate !== undefined) {
      setClauses.push(`bitrate = $${idx++}`);
      params.push(bitrate || null);
    }
    if (userLimit !== undefined) {
      setClauses.push(`user_limit = $${idx++}`);
      params.push(userLimit || null);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(now());
    params.push(chId);

    query(`UPDATE channels SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.channel.edit', 'channel', chId,
        JSON.stringify({ serverId, changes: req.body }), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/** DELETE /panel/api/servers/:id/channels/:chId — delete a channel */
router.delete('/:id/channels/:chId', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId, chId } = req.params;

    const chResult = query('SELECT * FROM channels WHERE id = $1 AND server_id = $2', [chId, serverId]);
    if (chResult.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const chName = chResult.rows[0].name;

    transaction(() => {
      query('DELETE FROM channels WHERE id = $1', [chId]);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.channel.delete', 'channel', chId,
          JSON.stringify({ serverId, name: chName }), now()]
      );
    });

    res.json({ success: true, message: `Channel "${chName}" deleted` });
  } catch (error) {
    logger.error('Failed to delete channel:', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// ══════════════════════════════════════════════════════════
// Role Management (sub-resource of server)
// ══════════════════════════════════════════════════════════

/** POST /panel/api/servers/:id/roles — create a role */
router.post('/:id/roles', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId } = req.params;
    const { name, color, position, permissions } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Role name is required' });
      return;
    }

    const serverCheck = query('SELECT id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const nextPos = position ?? (() => {
      const maxResult = query('SELECT MAX(position) as max_pos FROM roles WHERE server_id = $1', [serverId]);
      return (maxResult.rows[0]?.max_pos ?? 0) + 1;
    })();

    const roleId = generateId();
    const timestamp = now();

    transaction(() => {
      query(
        `INSERT INTO roles (id, server_id, name, color, position, permissions, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [roleId, serverId, name.trim(), color || null, nextPos,
          JSON.stringify(permissions || {}), timestamp]
      );

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.role.create', 'role', roleId,
          JSON.stringify({ name: name.trim(), serverId }), timestamp]
      );
    });

    res.json({ success: true, roleId });
  } catch (error) {
    logger.error('Failed to create role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

/** PUT /panel/api/servers/:id/roles/:roleId — update a role */
router.put('/:id/roles/:roleId', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId, roleId } = req.params;
    const { name, color, position, permissions } = req.body;

    const roleResult = query('SELECT * FROM roles WHERE id = $1 AND server_id = $2', [roleId, serverId]);
    if (roleResult.rows.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      setClauses.push(`name = $${idx++}`);
      params.push(name.trim());
    }
    if (color !== undefined) {
      setClauses.push(`color = $${idx++}`);
      params.push(color || null);
    }
    if (position !== undefined && typeof position === 'number') {
      setClauses.push(`position = $${idx++}`);
      params.push(position);
    }
    if (permissions !== undefined) {
      setClauses.push(`permissions = $${idx++}`);
      params.push(JSON.stringify(permissions));
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    params.push(roleId);
    query(`UPDATE roles SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.role.edit', 'role', roleId,
        JSON.stringify({ serverId, changes: req.body }), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/** DELETE /panel/api/servers/:id/roles/:roleId — delete a role */
router.delete('/:id/roles/:roleId', (req: PanelRequest, res: Response) => {
  try {
    const { id: serverId, roleId } = req.params;

    const roleResult = query('SELECT * FROM roles WHERE id = $1 AND server_id = $2', [roleId, serverId]);
    if (roleResult.rows.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const roleName = roleResult.rows[0].name;

    if (roleName === '@everyone') {
      res.status(400).json({ error: 'Cannot delete the @everyone role' });
      return;
    }

    transaction(() => {
      // Remove member_roles references
      query('DELETE FROM member_roles WHERE role_id = $1', [roleId]);
      query('DELETE FROM roles WHERE id = $1', [roleId]);

      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.role.delete', 'role', roleId,
          JSON.stringify({ serverId, name: roleName }), now()]
      );
    });

    res.json({ success: true, message: `Role "${roleName}" deleted` });
  } catch (error) {
    logger.error('Failed to delete role:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

export default router;
