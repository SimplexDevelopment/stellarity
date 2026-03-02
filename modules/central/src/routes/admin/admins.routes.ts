/**
 * Admin Accounts Routes (Superadmin only)
 * 
 * GET    /api/admin/admins
 * POST   /api/admin/admins
 * DELETE /api/admin/admins/:id
 * PATCH  /api/admin/admins/:id/role
 */
import { Router, Response } from 'express';
import { adminAccountsService } from '../../services/admin-accounts.service.js';
import { requireSuperAdmin, AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

// All routes require superadmin
router.use(requireSuperAdmin);

router.get('/', async (_req: AdminRequest, res: Response) => {
  try {
    const admins = await adminAccountsService.list();
    res.json({ admins });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: AdminRequest, res: Response) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const admin = await adminAccountsService.create({
      username,
      password,
      displayName,
      role,
    });
    res.status(201).json({ admin, message: 'Admin created' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req: AdminRequest, res: Response) => {
  try {
    await adminAccountsService.remove(req.params.id, req.admin!.adminId);
    res.json({ message: 'Admin removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/role', async (req: AdminRequest, res: Response) => {
  try {
    const { role } = req.body;
    if (!role || !['admin', 'superadmin'].includes(role)) {
      res.status(400).json({ error: 'Valid role required (admin, superadmin)' });
      return;
    }

    const admin = await adminAccountsService.updateRole(req.params.id, role, req.admin!.adminId);
    res.json({ admin, message: 'Role updated' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
