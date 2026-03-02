/**
 * Admin Audit Logs Routes
 * 
 * GET /api/admin/audit-logs
 * GET /api/admin/audit-logs/stats
 */
import { Router, Response } from 'express';
import { adminAuditService } from '../../services/admin-audit.service.js';
import { AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

router.get('/stats', async (_req: AdminRequest, res: Response) => {
  try {
    const stats = await adminAuditService.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req: AdminRequest, res: Response) => {
  try {
    const result = await adminAuditService.list({
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      userId: req.query.userId as string,
      action: req.query.action as string,
      actorType: req.query.actorType as string,
      targetType: req.query.targetType as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      sortOrder: req.query.sortOrder as string,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
