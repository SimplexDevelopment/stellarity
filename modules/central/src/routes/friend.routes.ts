/**
 * Friend Routes
 * 
 * Endpoints for managing friend requests, friend list, and blocking.
 */
import { Router, Response } from 'express';
import { friendService } from '../services/friend.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { friendRequestSchema, AppError } from '@stellarity/shared';
import { logger } from '../utils/logger.js';

import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// ── Friend List ──────────────────────────────────────────────────────

/** GET /api/friends — Get accepted friends */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const friends = await friendService.getFriends(req.user!.userId);
    res.json(friends);
  } catch (error) {
    logger.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// ── Friend Requests ──────────────────────────────────────────────────

/** GET /api/friends/requests/incoming — Get incoming friend requests */
router.get('/requests/incoming', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = await friendService.getIncomingRequests(req.user!.userId);
    res.json(requests);
  } catch (error) {
    logger.error('Get incoming requests error:', error);
    res.status(500).json({ error: 'Failed to fetch incoming requests' });
  }
});

/** GET /api/friends/requests/outgoing — Get outgoing friend requests */
router.get('/requests/outgoing', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = await friendService.getOutgoingRequests(req.user!.userId);
    res.json(requests);
  } catch (error) {
    logger.error('Get outgoing requests error:', error);
    res.status(500).json({ error: 'Failed to fetch outgoing requests' });
  }
});

/** POST /api/friends/request — Send a friend request */
router.post('/request', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = friendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const friendship = await friendService.sendRequest(
      req.user!.userId,
      parsed.data.recipientUsername,
      parsed.data.message
    );

    res.status(201).json(friendship);
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

/** POST /api/friends/:friendshipId/accept — Accept a friend request */
router.post('/:friendshipId/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { friendshipId } = req.params;
    const friendship = await friendService.acceptRequest(friendshipId, req.user!.userId);
    res.json(friendship);
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

/** POST /api/friends/:friendshipId/reject — Reject a friend request */
router.post('/:friendshipId/reject', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { friendshipId } = req.params;
    const rejected = await friendService.rejectRequest(friendshipId, req.user!.userId);
    if (!rejected) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// ── Friend Removal ──────────────────────────────────────────────────

/** DELETE /api/friends/:friendshipId — Remove a friend */
router.delete('/:friendshipId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { friendshipId } = req.params;
    const removed = await friendService.removeFriend(friendshipId, req.user!.userId);
    if (!removed) {
      return res.status(404).json({ error: 'Friendship not found' });
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// ── Blocking ─────────────────────────────────────────────────────────

/** GET /api/friends/blocked — Get blocked users */
router.get('/blocked', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const blocked = await friendService.getBlockedUsers(req.user!.userId);
    res.json(blocked);
  } catch (error) {
    logger.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
});

/** POST /api/friends/block — Block a user */
router.post('/block', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId: blockedUserId } = req.body;
    if (!blockedUserId || typeof blockedUserId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const block = await friendService.blockUser(req.user!.userId, blockedUserId);
    res.json(block);
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

/** DELETE /api/friends/block/:userId — Unblock a user */
router.delete('/block/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId: blockedUserId } = req.params;
    const unblocked = await friendService.unblockUser(req.user!.userId, blockedUserId);
    if (!unblocked) {
      return res.status(404).json({ error: 'Block not found' });
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

export default router;
