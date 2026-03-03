/**
 * Discovery Routes
 * 
 * Public instance browsing, registration for instance owners,
 * and heartbeat endpoint for live instances.
 */
import { Router, Request, Response } from 'express';
import { discoveryService } from '../services/discovery.service.js';
import { authenticate, optionalAuth, validate } from '../middleware/auth.middleware.js';
import { instanceRegistrationSchema, discoveryQuerySchema } from '@stellarity/shared';
import { logger } from '../utils/logger.js';

import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// ── Browse / Search ──────────────────────────────────────────────────

/** GET /api/discovery — Search public instances */
router.get('/', async (req: Request, res: Response) => {
  try {
    const input = discoveryQuerySchema.parse({
      search: req.query.search,
      tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) : undefined,
      category: req.query.category,
      region: req.query.region,
      sort: req.query.sort,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });

    const results = await discoveryService.search(input);
    res.json(results);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Invalid query parameters', errors: error.errors });
    } else {
      logger.error('Discovery search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  }
});

// ── Get Instance Details ─────────────────────────────────────────────

/** GET /api/discovery/:id */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const listing = await discoveryService.getInstance(req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }
    res.json(listing);
  } catch (error) {
    logger.error('Get instance error:', error);
    res.status(500).json({ error: 'Failed to retrieve instance' });
  }
});

// ── Register Instance ────────────────────────────────────────────────

/** POST /api/discovery/register — Register a new instance */
router.post('/register', authenticate, validate(instanceRegistrationSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await discoveryService.registerInstance(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (error: any) {
    if (error.message.includes('already registered')) {
      res.status(409).json({ error: error.message });
    } else {
      logger.error('Instance registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// ── Heartbeat ────────────────────────────────────────────────────────

/** POST /api/discovery/heartbeat — Instance heartbeat (auto-registers on first call) */
router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      res.status(400).json({ error: 'instanceId is required' });
      return;
    }

    await discoveryService.heartbeat(req.body);
    res.json({ acknowledged: true });
  } catch (error: any) {
    if (error.message === 'First heartbeat must include instanceName and publicKey') {
      res.status(400).json({ error: error.message });
    } else {
      logger.error('Heartbeat error:', error);
      res.status(500).json({ error: 'Heartbeat failed' });
    }
  }
});

// ── My Instances ─────────────────────────────────────────────────────

/** GET /api/discovery/mine — Get instances owned by current user */
router.get('/mine', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const listings = await discoveryService.getInstancesByOwner(req.user!.userId);
    res.json({ instances: listings });
  } catch (error) {
    logger.error('Get my instances error:', error);
    res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

// ── Remove Instance ──────────────────────────────────────────────────

/** DELETE /api/discovery/:id */
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await discoveryService.removeInstance(req.params.id, req.user!.userId);
    res.json({ message: 'Instance removed from registry' });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      logger.error('Remove instance error:', error);
      res.status(500).json({ error: 'Failed to remove instance' });
    }
  }
});

export default router;
