import { Router, Response } from 'express';
import { lobbyService } from '../services/lobby.service.js';
import { serverService } from '../services/server.service.js';
import { voiceService } from '../services/voice.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { createLobbySchema, serverFeaturesSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { emitToServer } from '../socket/emitter.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Lobbies ─────────────────────────────────────────────────────────

// Create a Build-a-Lobby (temporary voice channel)
router.post(
  '/:serverId/lobbies',
  validate(createLobbySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;

      // Check membership
      const isMember = await serverService.isServerMember(serverId, req.user!.userId);
      if (!isMember) {
        res.status(403).json({ error: 'Not a member of this server' });
        return;
      }

      // Check connectVoice permission
      const canConnect = await serverService.hasPermission(serverId, req.user!.userId, 'connectVoice');
      if (!canConnect) {
        res.status(403).json({ error: 'You do not have permission to connect to voice channels' });
        return;
      }

      // Check if Build-a-Lobby is enabled
      const features = lobbyService.getServerFeatures(serverId);
      if (!features.buildALobbyEnabled) {
        res.status(403).json({ error: 'Build-a-Lobby is not enabled on this server' });
        return;
      }

      // Get the Comms category to place the lobby in
      const categoryId = lobbyService.getVoiceCategoryId(serverId);

      const channel = await lobbyService.createTemporaryLobby(serverId, req.user!.userId, {
        ...req.body,
        categoryId,
      });

      // Broadcast to server
      emitToServer(serverId, 'lobby:created', { channel });
      emitToServer(serverId, 'channel:created', { channel });

      res.status(201).json({ channel });
    } catch (error: any) {
      logger.error('Create lobby error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Delete a temporary lobby
router.delete('/:serverId/lobbies/:channelId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, channelId } = req.params;

    // Check if lobby creator or has manageChannels permission
    const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
    // Also allow the lobby creator to delete it
    const channelResult = await serverService.getChannelById(channelId);
    if (!channelResult) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    const isCreator = channelResult.createdBy === req.user!.userId;
    if (!canManage && !isCreator) {
      res.status(403).json({ error: 'You do not have permission to delete this lobby' });
      return;
    }

    const result = await lobbyService.destroyLobby(channelId);
    if (!result) {
      res.status(404).json({ error: 'Temporary lobby not found' });
      return;
    }

    emitToServer(serverId, 'lobby:destroyed', { channelId, serverId });
    emitToServer(serverId, 'channel:deleted', { channelId, serverId });

    res.json({ message: 'Lobby deleted' });
  } catch (error: any) {
    logger.error('Delete lobby error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify lobby password
router.post('/:serverId/lobbies/:channelId/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const valid = await lobbyService.verifyLobbyPassword(channelId, password);
    if (!valid) {
      res.status(403).json({ error: 'Incorrect password' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Verify lobby password error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ── Voice Channel Occupancy ─────────────────────────────────────────

// Get all voice channel occupancy for a server
router.get('/:serverId/voice-occupancy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }

    const occupancy = await voiceService.getServerVoiceOccupancy(serverId);
    res.json({ channels: occupancy });
  } catch (error: any) {
    logger.error('Get voice occupancy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Server Features ─────────────────────────────────────────────────

// Get server features
router.get('/:serverId/features', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }

    const features = lobbyService.getServerFeatures(serverId);
    res.json({ features });
  } catch (error: any) {
    logger.error('Get server features error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update server features
router.put(
  '/:serverId/features',
  validate(serverFeaturesSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageServer');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage this server' });
        return;
      }

      const features = lobbyService.updateServerFeatures(serverId, req.body);
      res.json({ features });
    } catch (error: any) {
      logger.error('Update server features error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

export default router;
