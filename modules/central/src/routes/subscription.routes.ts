/**
 * Subscription Routes
 * 
 * Endpoints for subscription management and tier info.
 */
import { Router, Response } from 'express';
import { subscriptionService, TIER_LIMITS } from '../services/subscription.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';

import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import type { SubscriptionTier } from '@stellarity/shared';

const router = Router();

// All subscription routes require authentication
router.use(authenticate);

// ── Get Subscription ─────────────────────────────────────────────────

/** GET /api/subscription — Get current user's subscription info */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subscription = await subscriptionService.getSubscription(req.user!.userId);
    const tier = await subscriptionService.getUserTier(req.user!.userId);
    const limits = subscriptionService.getTierLimits(tier);
    const instanceLimit = await subscriptionService.checkInstanceLimit(req.user!.userId);

    res.json({
      subscription,
      tier,
      limits,
      instanceUsage: instanceLimit,
    });
  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to retrieve subscription' });
  }
});

// ── Get Tier Info ────────────────────────────────────────────────────

/** GET /api/subscription/tiers — Get all tier details (public info) */
router.get('/tiers', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    tiers: Object.entries(TIER_LIMITS).map(([name, limits]) => ({
      name: name as SubscriptionTier,
      limits,
    })),
  });
});

// ── Cancel Subscription ──────────────────────────────────────────────

/** POST /api/subscription/cancel */
router.post('/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await subscriptionService.cancelSubscription(req.user!.userId);
    res.json({ message: 'Subscription cancelled', tier: 'free' });
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
