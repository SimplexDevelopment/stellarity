import { query, generateId, now } from '../database/database.js';
import { generateInviteCode } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

import type {
  Server,
  Channel,
  Category,
  Role,
  ServerMember,
  RolePermissions,
  BrowsableServer,
} from '@stellarity/shared';
import { DEFAULT_PERMISSIONS } from '@stellarity/shared';

class ServerService {
  // ── Server CRUD ──────────────────────────────────────────────────

  /** Create a new server with default channels and @everyone role */
  async createServer(ownerId: string, input: {
    name: string;
    description?: string;
    iconUrl?: string;
    isPublic?: boolean;
    password?: string;
  }): Promise<Server> {
    const { name, description, iconUrl, isPublic = true, password } = input;
    const inviteCode = generateInviteCode();
    const serverId = generateId();

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
    }

    // Create server
    query(
      `INSERT INTO servers (id, name, description, icon_url, owner_id, invite_code, is_public, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [serverId, name, description, iconUrl, ownerId, inviteCode, isPublic ? 1 : 0, passwordHash]
    );

    const serverResult = query(
      `SELECT id, name, description, icon_url, owner_id, invite_code, max_members, is_public, password_hash, created_at
       FROM servers WHERE id = $1`,
      [serverId]
    );

    const server = this.mapServer(serverResult.rows[0]);

    // Add owner as member
    const ownerMemberId = generateId();
    query(
      `INSERT INTO server_members (id, server_id, user_id)
       VALUES ($1, $2, $3)`,
      [ownerMemberId, server.id, ownerId]
    );

    // Create @everyone default role
    const everyoneRoleId = generateId();
    query(
      `INSERT INTO roles (id, server_id, name, color, position, permissions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [everyoneRoleId, serverId, '@everyone', null, 0, JSON.stringify(DEFAULT_PERMISSIONS)]
    );

    // Assign @everyone role to owner
    query(
      `INSERT INTO member_roles (member_id, role_id) VALUES ($1, $2)`,
      [ownerMemberId, everyoneRoleId]
    );

    // Create default categories
    const relayCat = await this.createCategory(server.id, { name: 'Relay', position: 0 });
    const commsCat = await this.createCategory(server.id, { name: 'Comms', position: 1 });

    // Create default channels in their categories
    await this.createChannel(server.id, { name: 'general', type: 'text', categoryId: relayCat.id });
    await this.createChannel(server.id, { name: 'voice-lobby', type: 'voice', bitrate: 64000, categoryId: commsCat.id });

    // Create default server features
    query(
      `INSERT INTO server_features (server_id) VALUES ($1)`,
      [server.id]
    );

    logger.info(`Server created: ${server.name} by ${ownerId}`);

    return server;
  }

  /** Update a server's settings */
  async updateServer(serverId: string, input: {
    name?: string;
    description?: string | null;
    iconUrl?: string | null;
    isPublic?: boolean;
    password?: string;
    removePassword?: boolean;
  }): Promise<Server> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.iconUrl !== undefined) {
      updates.push(`icon_url = $${paramIndex++}`);
      values.push(input.iconUrl);
    }
    if (input.isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      values.push(input.isPublic ? 1 : 0);
    }
    if (input.removePassword) {
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(null);
    } else if (input.password) {
      const hash = await Bun.password.hash(input.password, { algorithm: 'argon2id' });
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      const existing = await this.getServerById(serverId);
      if (!existing) throw new Error('Server not found');
      return existing;
    }

    values.push(serverId);
    query(
      `UPDATE servers SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    const result = await this.getServerById(serverId);
    if (!result) throw new Error('Server not found');

    logger.info(`Server updated: ${serverId}`);
    return result;
  }

  /** Get server by ID */
  async getServerById(serverId: string): Promise<Server | null> {
    const result = query(
      `SELECT s.*, (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count
       FROM servers s
       WHERE s.id = $1`,
      [serverId]
    );

    if (result.rows.length === 0) return null;
    return this.mapServer(result.rows[0]);
  }

  /** Get servers that the user has joined */
  async getUserServers(userId: string): Promise<Server[]> {
    const result = query(
      `SELECT s.*, (SELECT COUNT(*) FROM server_members sm2 WHERE sm2.server_id = s.id) as member_count
       FROM servers s
       JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );

    return result.rows.map((r: any) => this.mapServer(r));
  }

  /** Browse all available servers — public + user's joined servers (deduped) */
  async listBrowsableServers(userId: string): Promise<BrowsableServer[]> {
    const result = query(
      `SELECT
         s.id, s.name, s.description, s.icon_url, s.is_public, s.password_hash, s.invite_code,
         (SELECT COUNT(*) FROM server_members sm2 WHERE sm2.server_id = s.id) as member_count,
         CASE WHEN sm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member
       FROM servers s
       LEFT JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $1
       WHERE s.is_public = 1 OR sm.user_id IS NOT NULL
       ORDER BY is_member DESC, s.created_at DESC`,
      [userId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      memberCount: Number(row.member_count),
      isPublic: row.is_public === 1,
      hasPassword: row.password_hash !== null,
      inviteCode: row.is_public === 1 ? row.invite_code : null,
      isMember: row.is_member === 1,
    }));
  }

  /** Join server by invite code */
  async joinServer(userId: string, inviteCode: string): Promise<Server> {
    const serverResult = query(
      `SELECT * FROM servers WHERE invite_code = $1`,
      [inviteCode]
    );

    if (serverResult.rows.length === 0) {
      throw new Error('Invalid invite code');
    }

    const server = this.mapServer(serverResult.rows[0]);
    return this._addMember(server, userId);
  }

  /** Join a public server by ID, with optional password */
  async joinPublicServer(userId: string, serverId: string, password?: string): Promise<Server> {
    const serverResult = query(`SELECT * FROM servers WHERE id = $1`, [serverId]);
    if (serverResult.rows.length === 0) {
      throw new Error('Server not found');
    }

    const row = serverResult.rows[0];
    if (!row.is_public) {
      throw new Error('This server is invite-only');
    }

    // Check password if server is password-protected
    if (row.password_hash) {
      if (!password) {
        throw new Error('This server requires a password');
      }
      const valid = await Bun.password.verify(password, row.password_hash);
      if (!valid) {
        throw new Error('Incorrect server password');
      }
    }

    const server = this.mapServer(row);
    return this._addMember(server, userId);
  }

  /** Internal helper: add a user as a server member and assign @everyone role */
  private async _addMember(server: Server, userId: string): Promise<Server> {
    // Check if already a member
    const memberCheck = query(
      `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
      [server.id, userId]
    );
    if (memberCheck.rows.length > 0) {
      throw new Error('Already a member of this server');
    }

    // Check member limit
    const countResult = query(
      `SELECT COUNT(*) as count FROM server_members WHERE server_id = $1`,
      [server.id]
    );
    if (countResult.rows[0].count >= server.maxMembers) {
      throw new Error('Server is full');
    }

    // Add member
    const memberId = generateId();
    query(
      `INSERT INTO server_members (id, server_id, user_id) VALUES ($1, $2, $3)`,
      [memberId, server.id, userId]
    );

    // Assign @everyone role
    const everyoneRole = query(
      `SELECT id FROM roles WHERE server_id = $1 AND name = '@everyone'`,
      [server.id]
    );
    if (everyoneRole.rows.length > 0) {
      query(
        `INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES ($1, $2)`,
        [memberId, everyoneRole.rows[0].id]
      );
    }

    logger.info(`User ${userId} joined server ${server.name}`);
    return server;
  }

  /** Leave server */
  async leaveServer(userId: string, serverId: string): Promise<void> {
    const serverResult = query(`SELECT owner_id FROM servers WHERE id = $1`, [serverId]);
    if (serverResult.rows.length === 0) {
      throw new Error('Server not found');
    }
    if (serverResult.rows[0].owner_id === userId) {
      throw new Error('Owner cannot leave the server. Transfer ownership or delete the server.');
    }

    query(`DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, [serverId, userId]);
    logger.info(`User ${userId} left server ${serverId}`);
  }

  /** Get server members */
  async getServerMembers(serverId: string): Promise<ServerMember[]> {
    const result = query(
      `SELECT sm.*, im.username, im.display_name, im.avatar_url
       FROM server_members sm
       JOIN instance_members im ON im.user_id = sm.user_id
       WHERE sm.server_id = $1
       ORDER BY sm.joined_at ASC`,
      [serverId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      serverId: row.server_id,
      userId: row.user_id,
      nickname: row.nickname,
      roles: [],
      joinedAt: row.joined_at,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        status: row.status,
      },
    }));
  }

  /** Delete server (owner only) */
  async deleteServer(serverId: string, userId: string): Promise<void> {
    const serverResult = query(`SELECT owner_id FROM servers WHERE id = $1`, [serverId]);
    if (serverResult.rows.length === 0) throw new Error('Server not found');
    if (serverResult.rows[0].owner_id !== userId) throw new Error('Only the owner can delete the server');

    query(`DELETE FROM servers WHERE id = $1`, [serverId]);
    logger.info(`Server deleted: ${serverId}`);
  }

  /** Regenerate invite code (owner only) */
  async regenerateInvite(serverId: string, userId: string): Promise<string> {
    const serverResult = query(`SELECT owner_id FROM servers WHERE id = $1`, [serverId]);
    if (serverResult.rows.length === 0) throw new Error('Server not found');
    if (serverResult.rows[0].owner_id !== userId) throw new Error('Only the owner can regenerate the invite code');

    const newCode = generateInviteCode();
    query(`UPDATE servers SET invite_code = $1 WHERE id = $2`, [newCode, serverId]);
    return newCode;
  }

  /** Remove a member from a server */
  async removeMember(serverId: string, userId: string): Promise<void> {
    query(`DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, [serverId, userId]);
  }

  // ── Channels ─────────────────────────────────────────────────────

  /** Create channel */
  async createChannel(serverId: string, input: {
    name: string;
    type: 'text' | 'voice';
    description?: string;
    categoryId?: string | null;
    bitrate?: number;
    userLimit?: number;
  }): Promise<Channel> {
    const { name, type, description, categoryId, bitrate, userLimit } = input;
    const channelId = generateId();

    const posResult = query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM channels WHERE server_id = $1`,
      [serverId]
    );
    const position = posResult.rows[0].next_pos;

    query(
      `INSERT INTO channels (id, server_id, category_id, name, type, description, position, bitrate, user_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [channelId, serverId, categoryId || null, name.toLowerCase(), type, description, position, bitrate || 64000, userLimit || 0]
    );

    const chanResult = query(`SELECT * FROM channels WHERE id = $1`, [channelId]);
    logger.info(`Channel created: ${name} in server ${serverId}`);
    return this.mapChannel(chanResult.rows[0]);
  }

  /** Update channel */
  async updateChannel(channelId: string, input: {
    name?: string;
    description?: string | null;
    categoryId?: string | null;
    position?: number;
    bitrate?: number;
    userLimit?: number;
  }): Promise<Channel> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(input.name.toLowerCase()); }
    if (input.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(input.description); }
    if (input.categoryId !== undefined) { updates.push(`category_id = $${paramIndex++}`); values.push(input.categoryId); }
    if (input.position !== undefined) { updates.push(`position = $${paramIndex++}`); values.push(input.position); }
    if (input.bitrate !== undefined) { updates.push(`bitrate = $${paramIndex++}`); values.push(input.bitrate); }
    if (input.userLimit !== undefined) { updates.push(`user_limit = $${paramIndex++}`); values.push(input.userLimit); }

    if (updates.length > 0) {
      values.push(channelId);
      query(`UPDATE channels SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    }

    const result = query(`SELECT * FROM channels WHERE id = $1`, [channelId]);
    if (result.rows.length === 0) throw new Error('Channel not found');
    return this.mapChannel(result.rows[0]);
  }

  /** Delete channel */
  async deleteChannel(channelId: string): Promise<void> {
    query(`DELETE FROM channels WHERE id = $1`, [channelId]);
    logger.info(`Channel deleted: ${channelId}`);
  }

  /** Get server channels */
  async getServerChannels(serverId: string): Promise<Channel[]> {
    const result = query(
      `SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC`,
      [serverId]
    );
    return result.rows.map((r: any) => this.mapChannel(r));
  }

  /** Get channel by ID */
  async getChannelById(channelId: string): Promise<Channel | null> {
    const result = query(`SELECT * FROM channels WHERE id = $1`, [channelId]);
    if (result.rows.length === 0) return null;
    return this.mapChannel(result.rows[0]);
  }

  /** Alias for getChannelById */
  async getChannel(channelId: string): Promise<Channel | null> {
    return this.getChannelById(channelId);
  }

  // ── Categories ───────────────────────────────────────────────────

  /** Create category */
  async createCategory(serverId: string, input: { name: string; position?: number }): Promise<Category> {
    const categoryId = generateId();

    const posResult = query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM categories WHERE server_id = $1`,
      [serverId]
    );
    const position = input.position ?? posResult.rows[0].next_pos;

    query(
      `INSERT INTO categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)`,
      [categoryId, serverId, input.name, position]
    );

    const result = query(`SELECT * FROM categories WHERE id = $1`, [categoryId]);
    logger.info(`Category created: ${input.name} in server ${serverId}`);
    return this.mapCategory(result.rows[0]);
  }

  /** Update category */
  async updateCategory(categoryId: string, input: { name?: string; position?: number }): Promise<Category> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(input.name); }
    if (input.position !== undefined) { updates.push(`position = $${paramIndex++}`); values.push(input.position); }

    if (updates.length > 0) {
      values.push(categoryId);
      query(`UPDATE categories SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    }

    const result = query(`SELECT * FROM categories WHERE id = $1`, [categoryId]);
    if (result.rows.length === 0) throw new Error('Category not found');
    return this.mapCategory(result.rows[0]);
  }

  /** Delete category (channels move to uncategorized) */
  async deleteCategory(categoryId: string): Promise<void> {
    // Channels referencing this category will have category_id set to NULL via ON DELETE SET NULL
    query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
    logger.info(`Category deleted: ${categoryId}`);
  }

  /** Get all categories for a server */
  async getServerCategories(serverId: string): Promise<Category[]> {
    const result = query(
      `SELECT * FROM categories WHERE server_id = $1 ORDER BY position ASC`,
      [serverId]
    );
    return result.rows.map((r: any) => this.mapCategory(r));
  }

  // ── Roles ────────────────────────────────────────────────────────

  /** Create role */
  async createRole(serverId: string, input: { name: string; color?: string; permissions?: Partial<RolePermissions> }): Promise<Role> {
    const roleId = generateId();

    const posResult = query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM roles WHERE server_id = $1`,
      [serverId]
    );
    const position = posResult.rows[0].next_pos;

    const permissions = { ...DEFAULT_PERMISSIONS, ...input.permissions };

    query(
      `INSERT INTO roles (id, server_id, name, color, position, permissions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [roleId, serverId, input.name, input.color || null, position, JSON.stringify(permissions)]
    );

    const result = query(`SELECT * FROM roles WHERE id = $1`, [roleId]);
    logger.info(`Role created: ${input.name} in server ${serverId}`);
    return this.mapRole(result.rows[0]);
  }

  /** Update role */
  async updateRole(roleId: string, input: {
    name?: string;
    color?: string | null;
    position?: number;
    permissions?: Partial<RolePermissions>;
  }): Promise<Role> {
    // Prevent editing @everyone name
    const existing = query(`SELECT * FROM roles WHERE id = $1`, [roleId]);
    if (existing.rows.length === 0) throw new Error('Role not found');

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined && existing.rows[0].name !== '@everyone') {
      updates.push(`name = $${paramIndex++}`); values.push(input.name);
    }
    if (input.color !== undefined) { updates.push(`color = $${paramIndex++}`); values.push(input.color); }
    if (input.position !== undefined) { updates.push(`position = $${paramIndex++}`); values.push(input.position); }
    if (input.permissions !== undefined) {
      const current = typeof existing.rows[0].permissions === 'string'
        ? JSON.parse(existing.rows[0].permissions)
        : existing.rows[0].permissions;
      const merged = { ...current, ...input.permissions };
      updates.push(`permissions = $${paramIndex++}`); values.push(JSON.stringify(merged));
    }

    if (updates.length > 0) {
      values.push(roleId);
      query(`UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    }

    const result = query(`SELECT * FROM roles WHERE id = $1`, [roleId]);
    return this.mapRole(result.rows[0]);
  }

  /** Delete role (cannot delete @everyone) */
  async deleteRole(roleId: string): Promise<void> {
    const existing = query(`SELECT name FROM roles WHERE id = $1`, [roleId]);
    if (existing.rows.length === 0) throw new Error('Role not found');
    if (existing.rows[0].name === '@everyone') throw new Error('Cannot delete the @everyone role');

    query(`DELETE FROM roles WHERE id = $1`, [roleId]);
    logger.info(`Role deleted: ${roleId}`);
  }

  /** Get all roles for a server */
  async getServerRoles(serverId: string): Promise<Role[]> {
    const result = query(
      `SELECT * FROM roles WHERE server_id = $1 ORDER BY position ASC`,
      [serverId]
    );
    return result.rows.map((r: any) => this.mapRole(r));
  }

  /** Assign a role to a member */
  async assignRole(serverId: string, userId: string, roleId: string): Promise<void> {
    const member = query(
      `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId]
    );
    if (member.rows.length === 0) throw new Error('Not a server member');

    query(
      `INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES ($1, $2)`,
      [member.rows[0].id, roleId]
    );
  }

  /** Remove a role from a member */
  async removeRole(serverId: string, userId: string, roleId: string): Promise<void> {
    const member = query(
      `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId]
    );
    if (member.rows.length === 0) throw new Error('Not a server member');

    query(`DELETE FROM member_roles WHERE member_id = $1 AND role_id = $2`, [member.rows[0].id, roleId]);
  }

  /** Get role IDs assigned to a member */
  async getMemberRoleIds(serverId: string, userId: string): Promise<string[]> {
    const result = query(
      `SELECT mr.role_id
       FROM member_roles mr
       JOIN server_members sm ON sm.id = mr.member_id
       WHERE sm.server_id = $1 AND sm.user_id = $2`,
      [serverId, userId]
    );
    return result.rows.map((r: any) => r.role_id);
  }

  // ── Permissions ──────────────────────────────────────────────────

  /** Check if user is member of server */
  async isServerMember(serverId: string, userId: string): Promise<boolean> {
    const result = query(
      `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId]
    );
    return result.rows.length > 0;
  }

  /** Check if user is server owner */
  async isServerOwner(serverId: string, userId: string): Promise<boolean> {
    const result = query(
      `SELECT id FROM servers WHERE id = $1 AND owner_id = $2`,
      [serverId, userId]
    );
    return result.rows.length > 0;
  }

  /** Get user's merged permissions from all roles in a server */
  async getMemberPermissions(serverId: string, userId: string): Promise<Record<string, boolean>> {
    const result = query(
      `SELECT r.permissions
       FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       JOIN server_members sm ON sm.id = mr.member_id
       WHERE sm.server_id = $1 AND sm.user_id = $2
       ORDER BY r.position DESC`,
      [serverId, userId]
    );

    const merged: Record<string, boolean> = {};
    for (const row of result.rows) {
      const perms = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
      for (const [key, value] of Object.entries(perms)) {
        if (value === true) merged[key] = true;
      }
    }
    return merged;
  }

  /** Check if user has a specific permission */
  async hasPermission(serverId: string, userId: string, permission: string): Promise<boolean> {
    const isOwner = await this.isServerOwner(serverId, userId);
    if (isOwner) return true;

    const perms = await this.getMemberPermissions(serverId, userId);
    return !!perms[permission];
  }

  // ── Server Creation Policy ───────────────────────────────────────

  /** Check if a user is allowed to create servers on this instance */
  async canUserCreateServer(userId: string): Promise<boolean> {
    const policySetting = query(
      `SELECT value FROM instance_settings WHERE key = 'server_creation_policy'`
    );
    const policy = policySetting.rows.length > 0 ? policySetting.rows[0].value : 'everyone';

    if (policy === 'everyone') return true;

    // 'selected' — check if user is in server_creators table
    const creator = query(
      `SELECT user_id FROM server_creators WHERE user_id = $1`,
      [userId]
    );
    return creator.rows.length > 0;
  }

  // ── Mappers ──────────────────────────────────────────────────────

  private mapServer(row: any): Server {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      ownerId: row.owner_id,
      inviteCode: row.invite_code,
      maxMembers: row.max_members,
      isPublic: row.is_public === 1 || row.is_public === true,
      hasPassword: row.password_hash !== null && row.password_hash !== undefined,
      createdAt: row.created_at,
      memberCount: row.member_count !== undefined ? Number(row.member_count) : undefined,
    };
  }

  private mapChannel(row: any): Channel {
    return {
      id: row.id,
      serverId: row.server_id,
      categoryId: row.category_id || null,
      name: row.name,
      type: row.type,
      description: row.description,
      position: row.position,
      bitrate: row.bitrate,
      userLimit: row.user_limit,
      isTemporary: row.is_temporary === 1 || row.is_temporary === true,
      createdBy: row.created_by || null,
      expiresWhenEmpty: row.expires_when_empty === 1 || row.expires_when_empty === true,
      hasPassword: row.password_hash !== null && row.password_hash !== undefined,
      isEncrypted: row.is_encrypted === 1 || row.is_encrypted === true,
      ephemeralDefault: row.ephemeral_default || null,
      createdAt: row.created_at,
    };
  }

  private mapCategory(row: any): Category {
    return {
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  private mapRole(row: any): Role {
    return {
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      color: row.color,
      position: row.position,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      createdAt: row.created_at,
    };
  }
}

export const serverService = new ServerService();
