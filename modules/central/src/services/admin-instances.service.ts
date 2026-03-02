/**
 * Admin Instances Service
 * 
 * Manages instance registry from the admin perspective:
 * list, verify/unverify, delete, view stale.
 */
import { query } from '../database/postgres.js';

class AdminInstancesService {

  async list(params: {
    page?: number;
    limit?: number;
    search?: string;
    isPublic?: boolean;
    isVerified?: boolean;
    staleOnly?: boolean;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ instances: any[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 25, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (params.search) {
      conditions.push(`(LOWER(name) LIKE $${paramIdx} OR LOWER(url) LIKE $${paramIdx})`);
      values.push(`%${params.search.toLowerCase()}%`);
      paramIdx++;
    }

    if (params.isPublic !== undefined) {
      conditions.push(`is_public = $${paramIdx}`);
      values.push(params.isPublic);
      paramIdx++;
    }

    if (params.isVerified !== undefined) {
      conditions.push(`is_verified = $${paramIdx}`);
      values.push(params.isVerified);
      paramIdx++;
    }

    if (params.staleOnly) {
      conditions.push(`(last_heartbeat_at IS NULL OR last_heartbeat_at < NOW() - INTERVAL '5 minutes')`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const validSortCols: Record<string, string> = {
      name: 'name',
      member_count: 'member_count',
      created_at: 'created_at',
      last_heartbeat_at: 'last_heartbeat_at',
    };
    const sortBy = validSortCols[params.sortBy || 'created_at'] || 'created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(`SELECT COUNT(*) FROM instance_registry ${whereClause}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT ir.*, u.username as owner_username
       FROM instance_registry ir
       LEFT JOIN users u ON ir.owner_id = u.id
       ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset]
    );

    return {
      instances: dataResult.rows.map(this.sanitize),
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async getById(instanceId: string): Promise<any> {
    const result = await query(
      `SELECT ir.*, u.username as owner_username
       FROM instance_registry ir
       LEFT JOIN users u ON ir.owner_id = u.id
       WHERE ir.id = $1`,
      [instanceId]
    );

    if (result.rows.length === 0) throw new Error('Instance not found');
    return this.sanitize(result.rows[0]);
  }

  async verify(instanceId: string): Promise<any> {
    const result = await query(
      'UPDATE instance_registry SET is_verified = true WHERE id = $1 RETURNING *',
      [instanceId]
    );
    if (result.rows.length === 0) throw new Error('Instance not found');
    return this.sanitize(result.rows[0]);
  }

  async unverify(instanceId: string): Promise<any> {
    const result = await query(
      'UPDATE instance_registry SET is_verified = false WHERE id = $1 RETURNING *',
      [instanceId]
    );
    if (result.rows.length === 0) throw new Error('Instance not found');
    return this.sanitize(result.rows[0]);
  }

  async remove(instanceId: string): Promise<void> {
    const result = await query('DELETE FROM instance_registry WHERE id = $1', [instanceId]);
    if (result.rowCount === 0) throw new Error('Instance not found');
  }

  private sanitize(row: any): any {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      url: row.url,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username || null,
      isPublic: row.is_public,
      isVerified: row.is_verified,
      tags: row.tags,
      category: row.category,
      region: row.region,
      memberCount: row.member_count,
      maxMembers: row.max_members,
      iconUrl: row.icon_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastHeartbeatAt: row.last_heartbeat_at,
    };
  }
}

export const adminInstancesService = new AdminInstancesService();
