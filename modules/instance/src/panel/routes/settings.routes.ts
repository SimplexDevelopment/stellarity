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
  query(
    `INSERT INTO instance_settings (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
    [key, value, now()]
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
      `SELECT sc.user_id, u.username, u.display_name, sc.added_at
       FROM server_creators sc
       LEFT JOIN users u ON u.id = sc.user_id
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
    // Verify user exists
    const user = query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
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

/** GET /panel/api/settings/server-features — list all server feature flags */
router.get('/server-features', (req: PanelRequest, res: Response) => {
  try {
    const result = query(
      `SELECT sf.*, s.name as server_name
       FROM server_features sf
       LEFT JOIN servers s ON s.id = sf.server_id
       ORDER BY sf.server_id, sf.feature`
    );
    res.json({
      features: result.rows.map(r => ({
        id: r.id,
        serverId: r.server_id,
        serverName: r.server_name,
        feature: r.feature,
        enabled: !!r.enabled,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to get server features:', error);
    res.status(500).json({ error: 'Failed to get server features' });
  }
});

/** POST /panel/api/settings/server-features — add a feature flag */
router.post('/server-features', (req: PanelRequest, res: Response) => {
  try {
    const { serverId, feature, enabled } = req.body;

    if (!serverId || !feature) {
      res.status(400).json({ error: 'serverId and feature are required' });
      return;
    }

    const serverCheck = query('SELECT id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const id = generateId();
    query(
      `INSERT INTO server_features (id, server_id, feature, enabled, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, serverId, feature, enabled !== false ? 1 : 0, now()]
    );

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.server-feature.add', 'server', serverId,
        JSON.stringify({ feature, enabled: enabled !== false }), now()]
    );

    res.json({ success: true, id });
  } catch (error) {
    logger.error('Failed to add server feature:', error);
    res.status(500).json({ error: 'Failed to add server feature' });
  }
});

/** DELETE /panel/api/settings/server-features/:id — remove a feature flag */
router.delete('/server-features/:id', (req: PanelRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = query('SELECT * FROM server_features WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Feature flag not found' });
      return;
    }

    query('DELETE FROM server_features WHERE id = $1', [id]);

    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.server-feature.remove', 'server', existing.rows[0].server_id,
        JSON.stringify({ feature: existing.rows[0].feature }), now()]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove server feature:', error);
    res.status(500).json({ error: 'Failed to remove server feature' });
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
