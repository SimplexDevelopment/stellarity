/**
 * Admin Metrics & DM Buffer Routes
 * 
 * GET    /api/admin/metrics
 * GET    /api/admin/metrics/registrations
 * GET    /api/admin/metrics/dm-buffer
 * DELETE /api/admin/metrics/dm-buffer/:conversationId
 * POST   /api/admin/metrics/dm-buffer/purge-expired
 */
import { Router, Response } from 'express';
import { adminMetricsService } from '../../services/admin-metrics.service.js';
import { AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

router.get('/', async (_req: AdminRequest, res: Response) => {
  try {
    const metrics = await adminMetricsService.getDashboardMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/registrations', async (req: AdminRequest, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const history = await adminMetricsService.getRegistrationHistory(days);
    res.json({ history });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dm-buffer', async (_req: AdminRequest, res: Response) => {
  try {
    const stats = await adminMetricsService.getDmBufferStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/dm-buffer/:conversationId', async (req: AdminRequest, res: Response) => {
  try {
    const result = await adminMetricsService.purgeDmBuffer(req.params.conversationId);
    res.json({ ...result, message: 'Buffer purged' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/dm-buffer/purge-expired', async (_req: AdminRequest, res: Response) => {
  try {
    const result = await adminMetricsService.purgeExpiredDmBuffers();
    res.json({ ...result, message: 'Expired buffers purged' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
