/**
 * Admin Instances Routes
 * 
 * GET    /api/admin/instances
 * GET    /api/admin/instances/:id
 * POST   /api/admin/instances/:id/verify
 * POST   /api/admin/instances/:id/unverify
 * DELETE /api/admin/instances/:id
 */
import { Router, Response } from 'express';
import { adminInstancesService } from '../../services/admin-instances.service.js';
import { AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

router.get('/', async (req: AdminRequest, res: Response) => {
  try {
    const result = await adminInstancesService.list({
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      search: req.query.search as string,
      isPublic: req.query.isPublic ? req.query.isPublic === 'true' : undefined,
      isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined,
      staleOnly: req.query.staleOnly === 'true',
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
    const instance = await adminInstancesService.getById(req.params.id);
    res.json({ instance });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.post('/:id/verify', async (req: AdminRequest, res: Response) => {
  try {
    const instance = await adminInstancesService.verify(req.params.id);
    res.json({ instance, message: 'Instance verified' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/unverify', async (req: AdminRequest, res: Response) => {
  try {
    const instance = await adminInstancesService.unverify(req.params.id);
    res.json({ instance, message: 'Instance unverified' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req: AdminRequest, res: Response) => {
  try {
    await adminInstancesService.remove(req.params.id);
    res.json({ message: 'Instance removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
