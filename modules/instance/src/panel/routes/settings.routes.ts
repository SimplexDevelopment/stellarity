/**
 * Panel Settings Routes — /panel/api/settings
 *
 * View and update instance configuration at runtime.
 * Settings stored in instance_settings table override env vars/defaults.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query, generateId, now } from '../../database/database.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const router = Router();

/** Get a setting from DB, falling back to config default */
function getSetting(key: string, defaultValue: string | null): string | null {
  const result = query('SELECT value FROM instance_settings WHERE key = $1', [key]);
  if (result.rows.length > 0) return result.rows[0].value;
  return defaultValue;
}

/** Upsert a setting */
function setSetting(key: string, value: string): void {
  const timestamp = now();
  query(
    `INSERT INTO instance_settings (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = $4, updated_at = $5`,
    [key, value, timestamp, value, timestamp]
  );
}

/** GET /panel/api/settings — return current instance config */
router.get('/', (req: PanelRequest, res: Response) => {
  try {
    const settings = {
      name: getSetting('instance_name', config.instance.name),
      description: getSetting('instance_description', config.instance.description),
      region: getSetting('instance_region', config.instance.region),
      tags: JSON.parse(getSetting('instance_tags', JSON.stringify(config.instance.tags)) || '[]'),
      isPublic: getSetting('instance_public', String(config.instance.isPublic)) === 'true',
      maxMembers: parseInt(getSetting('instance_max_members', String(config.instance.maxMembers)) || '500', 10),
      iconUrl: getSetting('instance_icon_url', config.instance.iconUrl),
      serverCreationPolicy: getSetting('server_creation_policy', 'everyone') as 'everyone' | 'selected',
    };

    res.json({ settings });
  } catch (error) {
    logger.error('Failed to get panel settings:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

/** PUT /panel/api/settings — update instance settings */
router.put('/', (req: PanelRequest, res: Response) => {
  try {
    const { name, description, region, tags, isPublic, maxMembers, iconUrl } = req.body;
    const changes: string[] = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Instance name cannot be empty' });
        return;
      }
      setSetting('instance_name', name.trim());
      changes.push(`name → ${name.trim()}`);
    }

    if (description !== undefined) {
      setSetting('instance_description', description || '');
      changes.push(`description updated`);
    }

    if (region !== undefined) {
      setSetting('instance_region', region || '');
      changes.push(`region → ${region || 'none'}`);
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        res.status(400).json({ error: 'Tags must be an array' });
        return;
      }
      setSetting('instance_tags', JSON.stringify(tags));
      changes.push(`tags → [${tags.join(', ')}]`);
    }

    if (isPublic !== undefined) {
      setSetting('instance_public', String(!!isPublic));
      changes.push(`isPublic → ${!!isPublic}`);
    }

    if (maxMembers !== undefined) {
      const max = parseInt(String(maxMembers), 10);
      if (isNaN(max) || max < 1) {
        res.status(400).json({ error: 'maxMembers must be a positive number' });
        return;
      }
      setSetting('instance_max_members', String(max));
      changes.push(`maxMembers → ${max}`);
    }

    if (iconUrl !== undefined) {
      setSetting('instance_icon_url', iconUrl || '');
      changes.push(`iconUrl updated`);
    }

    if (req.body.serverCreationPolicy !== undefined) {
      const policy = req.body.serverCreationPolicy;
      if (policy !== 'everyone' && policy !== 'selected') {
        res.status(400).json({ error: 'serverCreationPolicy must be "everyone" or "selected"' });
        return;
      }
      setSetting('server_creation_policy', policy);
      changes.push(`serverCreationPolicy → ${policy}`);
    }

    // Audit log
    if (changes.length > 0) {
      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.settings.update', 'settings', 'instance', JSON.stringify({ changes }), now()]
      );
    }

    // Return updated settings
    const settings = {
      name: getSetting('instance_name', config.instance.name),
      description: getSetting('instance_description', config.instance.description),
      region: getSetting('instance_region', config.instance.region),
      tags: JSON.parse(getSetting('instance_tags', JSON.stringify(config.instance.tags)) || '[]'),
      isPublic: getSetting('instance_public', String(config.instance.isPublic)) === 'true',
      maxMembers: parseInt(getSetting('instance_max_members', String(config.instance.maxMembers)) || '500', 10),
      iconUrl: getSetting('instance_icon_url', config.instance.iconUrl),
      serverCreationPolicy: getSetting('server_creation_policy', 'everyone') as 'everyone' | 'selected',
    };

    res.json({ settings, changes });
  } catch (error) {
    logger.error('Failed to update panel settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Server Creators Management ──────────────────────────────────

/** GET /panel/api/settings/server-creators — list users allowed to create servers */
router.get('/server-creators', (req: PanelRequest, res: Response) => {
  try {
    const result = query(
      `SELECT sc.user_id, im.username, im.display_name, sc.added_at
       FROM server_creators sc
       LEFT JOIN instance_members im ON im.user_id = sc.user_id
       ORDER BY sc.added_at DESC`
    );
    res.json({ creators: result.rows });
  } catch (error) {
    logger.error('Failed to get server creators:', error);
    res.status(500).json({ error: 'Failed to get server creators' });
  }
});

/** POST /panel/api/settings/server-creators — add a user as a server creator */
router.post('/server-creators', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    // Verify user exists on this instance
    const user = query('SELECT user_id, username FROM instance_members WHERE user_id = $1', [userId]);
    if (user.rows.length === 0) {
      res.status(404).json({ error: 'User not found on this instance' });
      return;
    }
    query(
      `INSERT INTO server_creators (user_id, added_at)
       VALUES ($1, $2)
       ON CONFLICT(user_id) DO NOTHING`,
      [userId, now()]
    );
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.server-creator.add', 'user', userId, JSON.stringify({ username: user.rows[0].username }), now()]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to add server creator:', error);
    res.status(500).json({ error: 'Failed to add server creator' });
  }
});

/** DELETE /panel/api/settings/server-creators/:userId — remove a server creator */
router.delete('/server-creators/:userId', (req: PanelRequest, res: Response) => {
  try {
    const { userId } = req.params;
    query('DELETE FROM server_creators WHERE user_id = $1', [userId]);
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.server-creator.remove', 'user', userId, '{}', now()]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove server creator:', error);
    res.status(500).json({ error: 'Failed to remove server creator' });
  }
});

// ── Server Features Management ──────────────────────────────────

/** GET /panel/api/settings/server-features — list all server feature settings */
router.get('/server-features', (req: PanelRequest, res: Response) => {
  try {
    const result = query(
      `SELECT sf.*, s.name as server_name
       FROM server_features sf
       LEFT JOIN servers s ON s.id = sf.server_id
       ORDER BY sf.server_id`
    );
    res.json({
      features: result.rows.map(r => ({
        serverId: r.server_id,
        serverName: r.server_name,
        buildALobbyEnabled: r.build_a_lobby_enabled === 1,
        buildALobbyPosition: r.build_a_lobby_position ?? 0,
        autoOverflowEnabled: r.auto_overflow_enabled === 1,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to get server features:', error);
    res.status(500).json({ error: 'Failed to get server features' });
  }
});

/** PUT /panel/api/settings/server-features/:serverId — update feature settings for a server */
router.put('/server-features/:serverId', (req: PanelRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const { buildALobbyEnabled, buildALobbyPosition, autoOverflowEnabled } = req.body;

    const serverCheck = query('SELECT id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    // Upsert: insert row if it doesn't exist, then update
    const existing = query('SELECT server_id FROM server_features WHERE server_id = $1', [serverId]);
    if (existing.rows.length === 0) {
      query('INSERT INTO server_features (server_id) VALUES ($1)', [serverId]);
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const changes: Record<string, any> = {};

    if (buildALobbyEnabled !== undefined) {
      setClauses.push(`build_a_lobby_enabled = $${idx++}`);
      params.push(buildALobbyEnabled ? 1 : 0);
      changes.buildALobbyEnabled = buildALobbyEnabled;
    }
    if (buildALobbyPosition !== undefined) {
      setClauses.push(`build_a_lobby_position = $${idx++}`);
      params.push(buildALobbyPosition);
      changes.buildALobbyPosition = buildALobbyPosition;
    }
    if (autoOverflowEnabled !== undefined) {
      setClauses.push(`auto_overflow_enabled = $${idx++}`);
      params.push(autoOverflowEnabled ? 1 : 0);
      changes.autoOverflowEnabled = autoOverflowEnabled;
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(now());
    params.push(serverId);

    query(
      `UPDATE server_features SET ${setClauses.join(', ')} WHERE server_id = $${idx}`,
      params
    );

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.server-feature.update', 'server', serverId,
        JSON.stringify(changes), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update server features:', error);
    res.status(500).json({ error: 'Failed to update server features' });
  }
});

/** DELETE /panel/api/settings/server-features/:serverId — reset features to defaults */
router.delete('/server-features/:serverId', (req: PanelRequest, res: Response) => {
  try {
    const { serverId } = req.params;

    const existing = query('SELECT * FROM server_features WHERE server_id = $1', [serverId]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Server features not found' });
      return;
    }

    query('DELETE FROM server_features WHERE server_id = $1', [serverId]);

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.server-feature.reset', 'server', serverId,
        '{}', now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to reset server features:', error);
    res.status(500).json({ error: 'Failed to reset server features' });
  }
});

// ── Raw Instance Settings ───────────────────────────────────────

/** GET /panel/api/settings/raw — all raw key-value settings */
router.get('/raw', (req: PanelRequest, res: Response) => {
  try {
    const result = query('SELECT key, value, updated_at FROM instance_settings ORDER BY key ASC');
    res.json({
      settings: result.rows.map(r => ({
        key: r.key,
        value: r.value,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to get raw settings:', error);
    res.status(500).json({ error: 'Failed to get raw settings' });
  }
});

/** PUT /panel/api/settings/raw — upsert a raw key-value setting */
router.put('/raw', (req: PanelRequest, res: Response) => {
  try {
    const { key, value } = req.body;

    if (!key || typeof key !== 'string') {
      res.status(400).json({ error: 'key is required' });
      return;
    }

    setSetting(key, value ?? '');

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.settings.raw-update', 'settings', key,
        JSON.stringify({ key, value }), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update raw setting:', error);
    res.status(500).json({ error: 'Failed to update raw setting' });
  }
});

/** DELETE /panel/api/settings/raw/:key — delete a raw setting */
router.delete('/raw/:key', (req: PanelRequest, res: Response) => {
  try {
    const { key } = req.params;

    query('DELETE FROM instance_settings WHERE key = $1', [key]);

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.settings.raw-delete', 'settings', key,
        JSON.stringify({ key }), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete raw setting:', error);
    res.status(500).json({ error: 'Failed to delete raw setting' });
  }
});

export default router;
