import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { encryptionService } from '../services/encryption.service.js';
import { serverService } from '../services/server.service.js';
import { emitToServer } from '../socket/emitter.js';
import { logger } from '../utils/logger.js';
import { channelKeyRegistrationSchema } from '@stellarity/shared';

const router = Router();

router.use(authenticate);

// Register a public key for an encrypted channel
router.post('/channels/:channelId/keys', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const parsed = channelKeyRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const keyRecord = encryptionService.registerKey(channelId, req.user!.userId, parsed.data.publicKey);

    // Notify other members that a key was registered
    emitToServer(channel.serverId, 'channel:key-exchange', {
      channelId,
      userId: req.user!.userId,
      publicKey: parsed.data.publicKey,
    });

    res.status(201).json(keyRecord);
  } catch (error) {
    logger.error('Failed to register channel key:', error);
    res.status(500).json({ error: 'Failed to register key' });
  }
});

// Get all member keys for a channel
router.get('/channels/:channelId/keys', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isMember = await serverService.isServerMember(channel.serverId, req.user!.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You do not have access to this channel' });
    }

    const keys = encryptionService.getChannelKeys(channelId);
    res.json(keys);
  } catch (error) {
    logger.error('Failed to get channel keys:', error);
    res.status(500).json({ error: 'Failed to fetch channel keys' });
  }
});

// Remove own key from a channel
router.delete('/channels/:channelId/keys', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;

    const removed = encryptionService.removeKey(channelId, req.user!.userId);
    if (!removed) {
      return res.status(404).json({ error: 'Key not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to remove channel key:', error);
    res.status(500).json({ error: 'Failed to remove key' });
  }
});

// Toggle channel encryption (server owner only)
router.patch('/channels/:channelId/encryption', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { encrypted } = req.body;

    if (typeof encrypted !== 'boolean') {
      return res.status(400).json({ error: 'encrypted field must be a boolean' });
    }

    const channel = await serverService.getChannel(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const isOwner = await serverService.isServerOwner(channel.serverId, req.user!.userId);
    if (!isOwner) {
      return res.status(403).json({ error: 'Only server owner can toggle encryption' });
    }

    encryptionService.setChannelEncrypted(channelId, encrypted);

    emitToServer(channel.serverId, 'channel:key-rotated', {
      channelId,
      encrypted,
    });

    res.json({ channelId, encrypted });
  } catch (error) {
    logger.error('Failed to toggle channel encryption:', error);
    res.status(500).json({ error: 'Failed to toggle encryption' });
  }
});

export default router;
