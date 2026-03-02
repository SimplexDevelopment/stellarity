/**
 * Admin Users Routes
 * 
 * GET    /api/admin/users
 * GET    /api/admin/users/:id
 * PATCH  /api/admin/users/:id
 * POST   /api/admin/users/:id/suspend
 * POST   /api/admin/users/:id/unsuspend
 * POST   /api/admin/users/:id/reset-mfa
 * DELETE /api/admin/users/:id
 */
import { Router, Response } from 'express';
import { adminUsersService } from '../../services/admin-users.service.js';
import { AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

router.get('/', async (req: AdminRequest, res: Response) => {
  try {
    const result = await adminUsersService.list({
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      search: req.query.search as string,
      tier: req.query.tier as string,
      status: req.query.status as string,
      suspended: req.query.suspended ? req.query.suspended === 'true' : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as string,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: AdminRequest, res: Response) => {
  try {
    const user = await adminUsersService.getById(req.params.id);
    res.json({ user });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.patch('/:id', async (req: AdminRequest, res: Response) => {
  try {
    const user = await adminUsersService.update(req.params.id, req.body);
    res.json({ user });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/suspend', async (req: AdminRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const user = await adminUsersService.suspend(req.params.id, req.admin!.adminId, reason);
    res.json({ user, message: 'User suspended' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/unsuspend', async (req: AdminRequest, res: Response) => {
  try {
    const user = await adminUsersService.unsuspend(req.params.id);
    res.json({ user, message: 'User unsuspended' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/reset-mfa', async (req: AdminRequest, res: Response) => {
  try {
    await adminUsersService.resetMfa(req.params.id);
    res.json({ message: 'MFA reset successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req: AdminRequest, res: Response) => {
  try {
    await adminUsersService.deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
