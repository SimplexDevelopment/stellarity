/**
 * Instance Routes
 * 
 * The instance server does NOT handle registration or login.
 * Authentication is managed by the central server via signed JWTs.
 * 
 * These routes provide:
 * - Instance info (public)
 * - Member registration on first connect
 * - Member profile on instance
 */
import { Router, Request, Response } from 'express';
import { instanceMemberService } from '../services/auth.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getInstancePublicInfo } from '../config/identity.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get instance public info (no auth required)
router.get('/info', async (_req: Request, res: Response) => {
  try {
    const info = await getInstancePublicInfo();
    res.json(info);
  } catch (error: any) {
    logger.error('Get instance info error:', error);
    res.status(500).json({ error: 'Failed to get instance info' });
  }
});

// Connect to instance — registers/updates the user as an instance member
// Called by the client on first connection to this instance
router.post('/connect', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const member = await instanceMemberService.ensureMember({
      sub: req.user!.userId,
      username: req.user!.username,
      displayName: req.user!.displayName,
      avatarUrl: req.user!.avatarUrl,
      tier: req.user!.tier as any,
    });

    await instanceMemberService.logAuditEvent(
      req.user!.userId,
      'instance_connect',
      'instance',
      null,
      null,
      req.ip || req.socket.remoteAddress
    );

    res.json({ member });
  } catch (error: any) {
    logger.error('Instance connect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user's instance member profile
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const member = await instanceMemberService.getMember(req.user!.userId);
    
    if (!member) {
      res.status(404).json({ error: 'Not a member of this instance' });
      return;
    }
    
    res.json({ member });
  } catch (error: any) {
    logger.error('Get member error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
