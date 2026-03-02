/**
 * Admin Audit Service
 * 
 * Read-only access to audit logs with filtering and pagination.
 */
import { query } from '../database/postgres.js';

class AdminAuditService {

  async list(params: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    actorType?: string;
    targetType?: string;
    startDate?: string;
    endDate?: string;
    sortOrder?: string;
  }): Promise<{ logs: any[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (params.userId) {
      conditions.push(`(al.user_id = $${paramIdx} OR al.actor_id = $${paramIdx})`);
      values.push(params.userId);
      paramIdx++;
    }

    if (params.action) {
      conditions.push(`al.action LIKE $${paramIdx}`);
      values.push(`%${params.action}%`);
      paramIdx++;
    }

    if (params.actorType) {
      conditions.push(`al.actor_type = $${paramIdx}`);
      values.push(params.actorType);
      paramIdx++;
    }

    if (params.targetType) {
      conditions.push(`al.target_type = $${paramIdx}`);
      values.push(params.targetType);
      paramIdx++;
    }

    if (params.startDate) {
      conditions.push(`al.created_at >= $${paramIdx}`);
      values.push(params.startDate);
      paramIdx++;
    }

    if (params.endDate) {
      conditions.push(`al.created_at <= $${paramIdx}`);
      values.push(params.endDate);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(`SELECT COUNT(*) FROM audit_logs al ${whereClause}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT al.*, u.username as user_username
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.created_at ${sortOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset]
    );

    return {
      logs: dataResult.rows.map(this.sanitize),
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async getStats(): Promise<{
    totalLogs: number;
    actionCounts: Record<string, number>;
    recentActivity: any[];
  }> {
    const totalResult = await query('SELECT COUNT(*) FROM audit_logs');
    const totalLogs = parseInt(totalResult.rows[0].count, 10);

    const actionResult = await query(
      `SELECT action, COUNT(*) as count FROM audit_logs
       GROUP BY action ORDER BY count DESC LIMIT 20`
    );
    const actionCounts: Record<string, number> = {};
    for (const row of actionResult.rows) {
      actionCounts[row.action] = parseInt(row.count, 10);
    }

    const recentResult = await query(
      `SELECT al.*, u.username as user_username
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC LIMIT 10`
    );

    return {
      totalLogs,
      actionCounts,
      recentActivity: recentResult.rows.map(this.sanitize),
    };
  }

  private sanitize(row: any): any {
    return {
      id: row.id,
      userId: row.user_id,
      userUsername: row.user_username || null,
      actorType: row.actor_type || 'user',
      actorId: row.actor_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    };
  }
}

export const adminAuditService = new AdminAuditService();
