/**
 * Panel Audit Log Routes — /panel/api/audit-logs
 *
 * View the instance-wide audit trail.
 */
import { Router, Response } from 'express';
import { PanelRequest } from '../middleware.js';
import { query } from '../../database/database.js';
import { logger } from '../../utils/logger.js';

const router = Router();

/** GET /panel/api/audit-logs — paginated audit logs */
router.get('/', (req: PanelRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const action = req.query.action as string;
    const userId = req.query.userId as string;
    const targetType = req.query.targetType as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const conditions: string[] = [];
    const params: any[] = [];

    if (action) {
      conditions.push(`al.action LIKE $${params.length + 1}`);
      params.push(`%${action}%`);
    }
    if (userId) {
      conditions.push(`al.user_id = $${params.length + 1}`);
      params.push(userId);
    }
    if (targetType) {
      conditions.push(`al.target_type = $${params.length + 1}`);
      params.push(targetType);
    }
    if (startDate) {
      conditions.push(`al.created_at >= $${params.length + 1}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`al.created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = query(
      `SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const logsResult = query(
      `SELECT al.*,
        im.username as user_username, im.display_name as user_display_name
       FROM audit_logs al
       LEFT JOIN instance_members im ON im.user_id = al.user_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    // Get unique action types for filter dropdown
    const actionTypes = query(
      'SELECT DISTINCT action FROM audit_logs ORDER BY action ASC'
    );

    res.json({
      logs: logsResult.rows.map(log => ({
        id: log.id,
        userId: log.user_id,
        userUsername: log.user_username || log.user_id,
        userDisplayName: log.user_display_name,
        action: log.action,
        targetType: log.target_type,
        targetId: log.target_id,
        details: log.details ? JSON.parse(log.details) : null,
        ipAddress: log.ip_address,
        createdAt: log.created_at,
      })),
      actionTypes: actionTypes.rows.map(r => r.action),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to list audit logs:', error);
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
});

export default router;
