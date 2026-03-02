/**
 * Admin Routes — Barrel Export
 * 
 * All admin routes are mounted under /api/admin/*
 * Auth routes are partially public (login, refresh, mfa/login).
 * All others require admin authentication.
 */
import { Router } from 'express';
import { authenticateAdmin } from '../../middleware/admin-auth.middleware.js';

import adminAuthRoutes from './auth.routes.js';
import adminUsersRoutes from './users.routes.js';
import adminInstancesRoutes from './instances.routes.js';
import adminAuditLogsRoutes from './audit-logs.routes.js';
import adminSubscriptionsRoutes from './subscriptions.routes.js';
import adminMetricsRoutes from './metrics.routes.js';
import adminAccountsRoutes from './admins.routes.js';

const router = Router();

// Auth routes are partially public (login, refresh, mfa don't need auth)
router.use('/auth', adminAuthRoutes);

// All other admin routes require authentication
router.use('/users', authenticateAdmin, adminUsersRoutes);
router.use('/instances', authenticateAdmin, adminInstancesRoutes);
router.use('/audit-logs', authenticateAdmin, adminAuditLogsRoutes);
router.use('/subscriptions', authenticateAdmin, adminSubscriptionsRoutes);
router.use('/metrics', authenticateAdmin, adminMetricsRoutes);
router.use('/admins', authenticateAdmin, adminAccountsRoutes);

export default router;
