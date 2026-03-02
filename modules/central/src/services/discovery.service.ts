/**
 * Discovery Service
 * 
 * Manages the instance discovery registry. Public instances register here
 * and send periodic heartbeats. Users can search and browse instances.
 */
import { query } from '../database/postgres.js';
import { logger } from '../utils/logger.js';

import type { DiscoveryListing, DiscoveryResults, DiscoveryCategory, DiscoverySortOrder } from '@stellarity/shared';
import type { InstanceRegistrationInput, DiscoveryQueryInput } from '@stellarity/shared';

class DiscoveryService {
  /** Register or update an instance in the discovery directory */
  async registerInstance(ownerId: string, input: InstanceRegistrationInput): Promise<{ instanceId: string }> {
    // Check if instance URL already registered
    const existing = await query(
      'SELECT id, owner_id FROM instance_registry WHERE url = $1',
      [input.url]
    );

    if (existing.rows.length > 0) {
      // Only the owner can update
      if (existing.rows[0].owner_id !== ownerId) {
        throw new Error('Instance URL already registered by another user');
      }

      // Update existing entry
      await query(
        `UPDATE instance_registry
         SET name = $1, description = $2, public_key = $3, tags = $4,
             region = $5, icon_url = $6, max_members = $7, last_heartbeat_at = NOW()
         WHERE id = $8`,
        [
          input.instanceName, input.description, input.publicKey,
          JSON.stringify(input.tags || []), input.region, input.iconUrl,
          input.maxMembers, existing.rows[0].id,
        ]
      );

      return { instanceId: existing.rows[0].id };
    }

    // Create new entry
    const result = await query(
      `INSERT INTO instance_registry (name, description, url, public_key, owner_id, tags, region, icon_url, max_members, last_heartbeat_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        input.instanceName, input.description, input.url, input.publicKey,
        ownerId, JSON.stringify(input.tags || []), input.region, input.iconUrl,
        input.maxMembers || 500,
      ]
    );

    logger.info(`Instance registered: ${input.instanceName} by user ${ownerId}`);
    return { instanceId: result.rows[0].id };
  }

  /** Process a heartbeat from an instance */
  async heartbeat(instanceId: string, memberCount: number, status: 'online' | 'maintenance'): Promise<void> {
    const result = await query(
      `UPDATE instance_registry
       SET member_count = $1, last_heartbeat_at = NOW()
       WHERE id = $2`,
      [memberCount, instanceId]
    );

    if (result.rowCount === 0) {
      throw new Error('Instance not found');
    }
  }

  /** Search and browse public instances */
  async search(input: DiscoveryQueryInput): Promise<DiscoveryResults> {
    const { search, tags, category, region, sort = 'relevance', page = 1, limit = 20 } = input;

    const conditions: string[] = ['ir.is_public = true'];
    const params: any[] = [];
    let paramIdx = 1;

    // Heartbeat freshness: only show instances seen in the last 10 minutes
    conditions.push(`ir.last_heartbeat_at > NOW() - INTERVAL '10 minutes'`);

    if (search) {
      conditions.push(`(ir.name ILIKE $${paramIdx} OR ir.description ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (category) {
      conditions.push(`ir.category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }

    if (region) {
      conditions.push(`ir.region = $${paramIdx}`);
      params.push(region);
      paramIdx++;
    }

    if (tags && tags.length > 0) {
      conditions.push(`ir.tags ?| $${paramIdx}`);
      params.push(tags);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Sort order
    let orderBy: string;
    switch (sort) {
      case 'members':
        orderBy = 'ir.member_count DESC';
        break;
      case 'newest':
        orderBy = 'ir.created_at DESC';
        break;
      case 'name':
        orderBy = 'ir.name ASC';
        break;
      case 'relevance':
      default:
        orderBy = 'ir.is_verified DESC, ir.member_count DESC';
        break;
    }

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) FROM instance_registry ir WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch page
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await query(
      `SELECT ir.id, ir.name, ir.description, ir.url, ir.public_key, ir.owner_id,
              ir.is_public, ir.is_verified, ir.tags, ir.category, ir.region,
              ir.member_count, ir.max_members, ir.icon_url, ir.created_at,
              ir.last_heartbeat_at
       FROM instance_registry ir
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    const listings: DiscoveryListing[] = result.rows.map((row: any) => ({
      instance: {
        id: row.id,
        name: row.name,
        description: row.description,
        url: row.url,
        publicKey: row.public_key,
        iconUrl: row.icon_url,
        region: row.region,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
        memberCount: row.member_count || 0,
        maxMembers: row.max_members || 500,
        isPublic: row.is_public,
        isVerified: row.is_verified,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        lastHeartbeatAt: row.last_heartbeat_at,
      },
      featured: row.is_verified,
      category: row.category as DiscoveryCategory | null,
      boostScore: row.is_verified ? 100 : 0,
    }));

    return {
      listings,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }

  /** Get a specific instance by ID */
  async getInstance(instanceId: string): Promise<DiscoveryListing | null> {
    const result = await query(
      `SELECT id, name, description, url, public_key, owner_id, is_public, is_verified,
              tags, category, region, member_count, max_members, icon_url, created_at,
              last_heartbeat_at
       FROM instance_registry WHERE id = $1`,
      [instanceId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      instance: {
        id: row.id,
        name: row.name,
        description: row.description,
        url: row.url,
        publicKey: row.public_key,
        iconUrl: row.icon_url,
        region: row.region,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
        memberCount: row.member_count || 0,
        maxMembers: row.max_members || 500,
        isPublic: row.is_public,
        isVerified: row.is_verified,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        lastHeartbeatAt: row.last_heartbeat_at,
      },
      featured: row.is_verified,
      category: row.category as DiscoveryCategory | null,
      boostScore: row.is_verified ? 100 : 0,
    };
  }

  /** Remove an instance from the registry (owner only) */
  async removeInstance(instanceId: string, userId: string): Promise<void> {
    const result = await query(
      'DELETE FROM instance_registry WHERE id = $1 AND owner_id = $2',
      [instanceId, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('Instance not found or you are not the owner');
    }

    logger.info(`Instance unregistered: ${instanceId} by user ${userId}`);
  }

  /** Get instances owned by a user */
  async getInstancesByOwner(userId: string): Promise<DiscoveryListing[]> {
    const result = await query(
      `SELECT id, name, description, url, public_key, owner_id, is_public, is_verified,
              tags, category, region, member_count, max_members, icon_url, created_at,
              last_heartbeat_at
       FROM instance_registry WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map((row: any) => ({
      instance: {
        id: row.id,
        name: row.name,
        description: row.description,
        url: row.url,
        publicKey: row.public_key,
        iconUrl: row.icon_url,
        region: row.region,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
        memberCount: row.member_count || 0,
        maxMembers: row.max_members || 500,
        isPublic: row.is_public,
        isVerified: row.is_verified,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        lastHeartbeatAt: row.last_heartbeat_at,
      },
      featured: row.is_verified,
      category: row.category as DiscoveryCategory | null,
      boostScore: row.is_verified ? 100 : 0,
    }));
  }

  /** Clean up stale instances (no heartbeat in 30 minutes) */
  async cleanupStaleInstances(): Promise<number> {
    const result = await query(
      `DELETE FROM instance_registry
       WHERE last_heartbeat_at < NOW() - INTERVAL '30 minutes'
       RETURNING id`
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info(`Cleaned up ${count} stale instances`);
    }
    return count;
  }
}

export const discoveryService = new DiscoveryService();
