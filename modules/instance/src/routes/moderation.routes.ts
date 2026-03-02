import { Router, Response } from 'express';
import { moderationService } from '../services/moderation.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';

import type { ModerationActionType } from '@stellarity/shared';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Execute moderation action ─────────────────────────────
// POST /api/servers/:serverId/moderation
router.post('/:serverId/moderation', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const { userId, action, reason, duration } = req.body;

    if (!userId || !action) {
      res.status(400).json({ error: 'userId and action are required' });
      return;
    }

    const validActions: ModerationActionType[] = ['ban', 'kick', 'mute', 'warn', 'timeout'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
      return;
    }

    const result = await moderationService.executeAction({
      serverId,
      userId,
      moderatorId: req.user!.userId,
      action,
      reason,
      duration,
    });

    res.status(201).json({ action: result });
  } catch (error: any) {
    logger.error('Moderation action error:', error);
    const status = error.message.includes('permission') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// ─── Revoke moderation action ──────────────────────────────
// DELETE /api/servers/:serverId/moderation/:actionId
router.delete('/:serverId/moderation/:actionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, actionId } = req.params;

    await moderationService.revokeAction(actionId, req.user!.userId, serverId);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Revoke moderation error:', error);
    const status = error.message.includes('permission') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// ─── Unban user ────────────────────────────────────────────
// POST /api/servers/:serverId/moderation/unban/:userId
router.post('/:serverId/moderation/unban/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, userId } = req.params;

    await moderationService.unbanUser(serverId, userId, req.user!.userId);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Unban error:', error);
    const status = error.message.includes('permission') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// ─── Get active moderation actions ─────────────────────────
// GET /api/servers/:serverId/moderation
router.get('/:serverId/moderation', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;

    // Only moderators can view — check for any moderation permission
    const canView = await Promise.any([
      (async () => {
        const { serverService } = await import('../services/server.service.js');
        if (await serverService.hasPermission(serverId, req.user!.userId, 'banMembers')) return true;
        if (await serverService.hasPermission(serverId, req.user!.userId, 'kickMembers')) return true;
        if (await serverService.hasPermission(serverId, req.user!.userId, 'muteMembers')) return true;
        throw new Error('no permission');
      })(),
    ]).catch(() => false);

    if (!canView) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const actions = moderationService.getActiveActions(serverId);
    res.json({ actions });
  } catch (error: any) {
    logger.error('Get moderation actions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Get user moderation summary ───────────────────────────
// GET /api/servers/:serverId/moderation/user/:userId
router.get('/:serverId/moderation/user/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, userId } = req.params;

    // Only moderators or the user themselves can view
    if (userId !== req.user!.userId) {
      const { serverService } = await import('../services/server.service.js');
      const hasPerm = await serverService.hasPermission(serverId, req.user!.userId, 'kickMembers');
      if (!hasPerm) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
    }

    const summary = moderationService.getUserSummary(serverId, userId);
    res.json({ summary });
  } catch (error: any) {
    logger.error('Get user moderation summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Get ban list ──────────────────────────────────────────
// GET /api/servers/:serverId/moderation/bans
router.get('/:serverId/moderation/bans', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;

    const { serverService } = await import('../services/server.service.js');
    const hasPerm = await serverService.hasPermission(serverId, req.user!.userId, 'banMembers');
    if (!hasPerm) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const bans = moderationService.getBanList(serverId);
    res.json({ bans });
  } catch (error: any) {
    logger.error('Get ban list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Get user moderation history ───────────────────────────
// GET /api/servers/:serverId/moderation/history/:userId
router.get('/:serverId/moderation/history/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, userId } = req.params;

    const { serverService } = await import('../services/server.service.js');
    const hasPerm = await serverService.hasPermission(serverId, req.user!.userId, 'kickMembers');
    if (!hasPerm) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const actions = moderationService.getUserActions(serverId, userId);
    res.json({ actions });
  } catch (error: any) {
    logger.error('Get moderation history error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
