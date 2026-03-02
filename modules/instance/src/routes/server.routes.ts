import { Router, Response } from 'express';
import { serverService } from '../services/server.service.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createServerSchema,
  updateServerSchema,
  createChannelSchema,
  updateChannelSchema,
  createCategorySchema,
  updateCategorySchema,
  createRoleSchema,
  updateRoleSchema,
} from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { emitToServer } from '../socket/emitter.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Server CRUD ────────────────────────────────────────────────────

// Browse all available servers (public + user's joined)
router.get('/browse', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const servers = await serverService.listBrowsableServers(req.user!.userId);
    res.json({ servers });
  } catch (error: any) {
    logger.error('Browse servers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's joined servers
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const servers = await serverService.getUserServers(req.user!.userId);
    res.json({ servers });
  } catch (error: any) {
    logger.error('Get servers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create server
router.post(
  '/',
  validate(createServerSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check creation policy
      const canCreate = await serverService.canUserCreateServer(req.user!.userId);
      if (!canCreate) {
        res.status(403).json({ error: 'You do not have permission to create servers on this instance' });
        return;
      }
      const server = await serverService.createServer(req.user!.userId, req.body);
      res.status(201).json({ server });
    } catch (error: any) {
      logger.error('Create server error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Get server by ID
router.get('/:serverId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }
    const server = await serverService.getServerById(serverId);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    res.json({ server });
  } catch (error: any) {
    logger.error('Get server error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update server
router.put(
  '/:serverId',
  validate(updateServerSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageServer');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage this server' });
        return;
      }
      const server = await serverService.updateServer(serverId, req.body);
      emitToServer(serverId, 'server:updated', server);
      res.json({ server });
    } catch (error: any) {
      logger.error('Update server error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Join server by invite code
router.post('/join/:inviteCode', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inviteCode } = req.params;
    const server = await serverService.joinServer(req.user!.userId, inviteCode);
    res.json({ server });
  } catch (error: any) {
    logger.error('Join server error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Join public server by ID (with optional password)
router.post('/:serverId/join', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const { password } = req.body || {};
    const server = await serverService.joinPublicServer(req.user!.userId, serverId, password);
    res.json({ server });
  } catch (error: any) {
    logger.error('Join public server error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Leave server
router.post('/:serverId/leave', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await serverService.leaveServer(req.user!.userId, req.params.serverId);
    res.json({ message: 'Left server successfully' });
  } catch (error: any) {
    logger.error('Leave server error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete server
router.delete('/:serverId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serverId = req.params.serverId;
    emitToServer(serverId, 'server:deleted', { serverId });
    await serverService.deleteServer(serverId, req.user!.userId);
    res.json({ message: 'Server deleted successfully' });
  } catch (error: any) {
    logger.error('Delete server error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get server members
router.get('/:serverId/members', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }
    const members = await serverService.getServerMembers(serverId);
    res.json({ members });
  } catch (error: any) {
    logger.error('Get members error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate invite code
router.post('/:serverId/invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const inviteCode = await serverService.regenerateInvite(req.params.serverId, req.user!.userId);
    res.json({ inviteCode });
  } catch (error: any) {
    logger.error('Regenerate invite error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Check if current user can create servers
router.get('/policy/can-create', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const canCreate = await serverService.canUserCreateServer(req.user!.userId);
    res.json({ canCreate });
  } catch (error: any) {
    logger.error('Check create policy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Channels ───────────────────────────────────────────────────────

// Get server channels
router.get('/:serverId/channels', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }
    const channels = await serverService.getServerChannels(serverId);
    res.json({ channels });
  } catch (error: any) {
    logger.error('Get channels error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create channel
router.post(
  '/:serverId/channels',
  validate(createChannelSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage channels' });
        return;
      }
      const channel = await serverService.createChannel(serverId, req.body);
      emitToServer(serverId, 'channel:created', channel);
      res.status(201).json({ channel });
    } catch (error: any) {
      logger.error('Create channel error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Update channel
router.put(
  '/:serverId/channels/:channelId',
  validate(updateChannelSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId, channelId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage channels' });
        return;
      }
      const channel = await serverService.updateChannel(channelId, req.body);
      emitToServer(serverId, 'channel:updated', channel);
      res.json({ channel });
    } catch (error: any) {
      logger.error('Update channel error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Delete channel
router.delete('/:serverId/channels/:channelId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, channelId } = req.params;
    const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
    if (!canManage) {
      res.status(403).json({ error: 'You do not have permission to manage channels' });
      return;
    }
    emitToServer(serverId, 'channel:deleted', { channelId, serverId });
    await serverService.deleteChannel(channelId);
    res.json({ message: 'Channel deleted' });
  } catch (error: any) {
    logger.error('Delete channel error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ── Categories ─────────────────────────────────────────────────────

// Get server categories
router.get('/:serverId/categories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }
    const categories = await serverService.getServerCategories(serverId);
    res.json({ categories });
  } catch (error: any) {
    logger.error('Get categories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post(
  '/:serverId/categories',
  validate(createCategorySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage channels' });
        return;
      }
      const category = await serverService.createCategory(serverId, req.body);
      emitToServer(serverId, 'category:created', category);
      res.status(201).json({ category });
    } catch (error: any) {
      logger.error('Create category error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Update category
router.put(
  '/:serverId/categories/:categoryId',
  validate(updateCategorySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId, categoryId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage channels' });
        return;
      }
      const category = await serverService.updateCategory(categoryId, req.body);
      emitToServer(serverId, 'category:updated', category);
      res.json({ category });
    } catch (error: any) {
      logger.error('Update category error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Delete category
router.delete('/:serverId/categories/:categoryId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, categoryId } = req.params;
    const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageChannels');
    if (!canManage) {
      res.status(403).json({ error: 'You do not have permission to manage channels' });
      return;
    }
    emitToServer(serverId, 'category:deleted', { categoryId, serverId });
    await serverService.deleteCategory(categoryId);
    res.json({ message: 'Category deleted' });
  } catch (error: any) {
    logger.error('Delete category error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ── Roles ──────────────────────────────────────────────────────────

// Get server roles
router.get('/:serverId/roles', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId } = req.params;
    const isMember = await serverService.isServerMember(serverId, req.user!.userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }
    const roles = await serverService.getServerRoles(serverId);
    res.json({ roles });
  } catch (error: any) {
    logger.error('Get roles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create role
router.post(
  '/:serverId/roles',
  validate(createRoleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageRoles');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage roles' });
        return;
      }
      const role = await serverService.createRole(serverId, req.body);
      emitToServer(serverId, 'role:created', role);
      res.status(201).json({ role });
    } catch (error: any) {
      logger.error('Create role error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Update role
router.put(
  '/:serverId/roles/:roleId',
  validate(updateRoleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { serverId, roleId } = req.params;
      const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageRoles');
      if (!canManage) {
        res.status(403).json({ error: 'You do not have permission to manage roles' });
        return;
      }
      const role = await serverService.updateRole(roleId, req.body);
      emitToServer(serverId, 'role:updated', role);
      res.json({ role });
    } catch (error: any) {
      logger.error('Update role error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Delete role
router.delete('/:serverId/roles/:roleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, roleId } = req.params;
    const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageRoles');
    if (!canManage) {
      res.status(403).json({ error: 'You do not have permission to manage roles' });
      return;
    }
    emitToServer(serverId, 'role:deleted', { roleId, serverId });
    await serverService.deleteRole(roleId);
    res.json({ message: 'Role deleted' });
  } catch (error: any) {
    logger.error('Delete role error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Assign/remove roles from a member
router.put('/:serverId/members/:userId/roles', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { serverId, userId } = req.params;
    const { roleIds } = req.body;

    const canManage = await serverService.hasPermission(serverId, req.user!.userId, 'manageRoles');
    if (!canManage) {
      res.status(403).json({ error: 'You do not have permission to manage roles' });
      return;
    }

    if (!Array.isArray(roleIds)) {
      res.status(400).json({ error: 'roleIds must be an array' });
      return;
    }

    // Get current roles
    const currentRoles = await serverService.getMemberRoleIds(serverId, userId);
    const targetSet = new Set(roleIds as string[]);
    const currentSet = new Set(currentRoles);

    // Add new roles
    for (const roleId of roleIds) {
      if (!currentSet.has(roleId)) {
        await serverService.assignRole(serverId, userId, roleId);
      }
    }

    // Remove old roles (except @everyone)
    const allRoles = await serverService.getServerRoles(serverId);
    const everyoneRoleId = allRoles.find(r => r.name === '@everyone')?.id;
    for (const roleId of currentRoles) {
      if (!targetSet.has(roleId) && roleId !== everyoneRoleId) {
        await serverService.removeRole(serverId, userId, roleId);
      }
    }

    const updatedRoles = await serverService.getMemberRoleIds(serverId, userId);
    emitToServer(serverId, 'member:role-updated', { serverId, userId, roleIds: updatedRoles });
    res.json({ roleIds: updatedRoles });
  } catch (error: any) {
    logger.error('Update member roles error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
