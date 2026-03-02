/**
 * Admin Auth Routes
 * 
 * POST /api/admin/auth/login
 * POST /api/admin/auth/mfa/login
 * POST /api/admin/auth/refresh
 * POST /api/admin/auth/logout
 * GET  /api/admin/auth/me
 * POST /api/admin/auth/mfa/setup
 * POST /api/admin/auth/mfa/verify
 * POST /api/admin/auth/mfa/disable
 * POST /api/admin/auth/change-password
 */
import { Router, Request, Response } from 'express';
import { adminAuthService } from '../../services/admin-auth.service.js';
import { authenticateAdmin, AdminRequest } from '../../middleware/admin-auth.middleware.js';

const router = Router();

// ── Public (no auth) ──────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const result = await adminAuthService.login(username, password, req.ip);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

router.post('/mfa/login', async (req: Request, res: Response) => {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      res.status(400).json({ error: 'MFA token and code required' });
      return;
    }

    const result = await adminAuthService.verifyMfaLogin(mfaToken, code, req.ip);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const result = await adminAuthService.refresh(refreshToken, req.ip);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// ── Protected (admin auth required) ───────────────────────

router.post('/logout', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;
    await adminAuthService.logout(req.admin!.adminId, refreshToken);
    res.json({ message: 'Logged out' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const admin = await adminAuthService.getProfile(req.admin!.adminId);
    res.json({ admin });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.post('/mfa/setup', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const result = await adminAuthService.setupMfa(req.admin!.adminId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/mfa/verify', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'MFA code required' });
      return;
    }

    const result = await adminAuthService.verifyMfa(req.admin!.adminId, code);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/mfa/disable', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'MFA code required' });
      return;
    }

    await adminAuthService.disableMfa(req.admin!.adminId, code);
    res.json({ message: 'MFA disabled' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/change-password', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password required' });
      return;
    }

    await adminAuthService.changePassword(req.admin!.adminId, currentPassword, newPassword);
    res.json({ message: 'Password changed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
