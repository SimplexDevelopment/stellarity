/**
 * Admin Subscriptions Routes
 * 
 * GET   /api/admin/subscriptions
 * GET   /api/admin/subscriptions/stats
 * PATCH /api/admin/subscriptions/:userId
 */
import { Router, Response } from 'express';
import { adminSubscriptionsService } from '../../services/admin-subscriptions.service.js';
import { AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

router.get('/stats', async (_req: AdminRequest, res: Response) => {
  try {
    const stats = await adminSubscriptionsService.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req: AdminRequest, res: Response) => {
  try {
    const result = await adminSubscriptionsService.list({
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      status: req.query.status as string,
      tier: req.query.tier as string,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:userId', async (req: AdminRequest, res: Response) => {
  try {
    const { tier, expiresAt } = req.body;
    if (!tier || !['free', 'premium', 'enterprise'].includes(tier)) {
      res.status(400).json({ error: 'Valid tier required (free, premium, enterprise)' });
      return;
    }

    const result = await adminSubscriptionsService.overrideTier(req.params.userId, tier, expiresAt);
    res.json({ subscription: result, message: 'Tier updated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
