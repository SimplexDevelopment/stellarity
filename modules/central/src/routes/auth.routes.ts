/**
 * Central Auth Routes
 * 
 * Endpoints for registration, login, MFA, token management, and profile.
 * Also exposes the Ed25519 public key for instance verification.
 */
import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { authenticate, validate } from '../middleware/auth.middleware.js';
import { getPublicKeyPem } from '../config/keys.js';
import { registerSchema, loginSchema, mfaVerifySchema, updateProfileSchema } from '@stellarity/shared';
import { logger } from '../utils/logger.js';

import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// ── Public Key Endpoint (used by instances) ──────────────────────────

/** GET /api/auth/public-key — Returns the Ed25519 public key PEM */
router.get('/public-key', (_req: Request, res: Response) => {
  try {
    const pem = getPublicKeyPem();
    res.json({ publicKey: pem, algorithm: 'EdDSA' });
  } catch (error) {
    logger.error('Failed to get public key:', error);
    res.status(500).json({ error: 'Public key not available' });
  }
});

// ── Registration ─────────────────────────────────────────────────────

/** POST /api/auth/register */
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    if (error.message === 'Username already taken' || error.message === 'Email already registered') {
      res.status(409).json({ error: error.message });
    } else {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// ── Login ────────────────────────────────────────────────────────────

/** POST /api/auth/login */
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress;
    const result = await authService.login(req.body, ip);

    if (result.mfaRequired) {
      res.status(200).json({
        mfaRequired: true,
        mfaToken: result.mfaToken,
      });
      return;
    }

    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiry: result.accessTokenExpiry,
    });
  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      res.status(401).json({ error: 'Invalid credentials' });
    } else {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
});

// ── Token Refresh ────────────────────────────────────────────────────

/** POST /api/auth/refresh */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const tokens = await authService.refreshTokens(refreshToken);
    res.json(tokens);
  } catch (error: any) {
    if (error.message === 'Invalid or expired refresh token') {
      res.status(401).json({ error: error.message });
    } else {
      logger.error('Token refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  }
});

// ── Logout ───────────────────────────────────────────────────────────

/** POST /api/auth/logout */
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await authService.logout(req.user!.userId, req.body.refreshToken);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ── Get Current User ─────────────────────────────────────────────────

/** GET /api/auth/me */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await authService.getUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// ── Update Profile ───────────────────────────────────────────────────

/** PATCH /api/auth/profile */
router.patch('/profile', authenticate, validate(updateProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await authService.updateProfile(req.user!.userId, req.body);
    res.json({ user });
  } catch (error: any) {
    if (error.message === 'User not found') {
      res.status(404).json({ error: error.message });
    } else {
      logger.error('Profile update error:', error);
      res.status(500).json({ error: 'Profile update failed' });
    }
  }
});

// ── MFA Setup ────────────────────────────────────────────────────────

/** POST /api/auth/mfa/setup — Generate TOTP secret and QR code */
router.post('/mfa/setup', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await authService.setupMFA(req.user!.userId);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'MFA is already enabled') {
      res.status(409).json({ error: error.message });
    } else {
      logger.error('MFA setup error:', error);
      res.status(500).json({ error: 'MFA setup failed' });
    }
  }
});

/** POST /api/auth/mfa/verify — Verify TOTP code to complete MFA setup */
router.post('/mfa/verify', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'MFA code is required' });
      return;
    }
    const result = await authService.verifyMFASetup(req.user!.userId, token);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'Invalid MFA code') {
      res.status(401).json({ error: error.message });
    } else if (error.message === 'MFA is already enabled' || error.message === 'MFA setup not initiated') {
      res.status(400).json({ error: error.message });
    } else {
      logger.error('MFA verify error:', error);
      res.status(500).json({ error: 'MFA verification failed' });
    }
  }
});

/** POST /api/auth/mfa/login — Verify MFA during login flow */
router.post('/mfa/login', async (req: Request, res: Response) => {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      res.status(400).json({ error: 'MFA token and code are required' });
      return;
    }
    const ip = req.ip || req.socket.remoteAddress;
    const result = await authService.verifyMFALogin(mfaToken, code, ip);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'Invalid MFA code' || error.message === 'Invalid or expired MFA token') {
      res.status(401).json({ error: error.message });
    } else {
      logger.error('MFA login error:', error);
      res.status(500).json({ error: 'MFA login failed' });
    }
  }
});

/** POST /api/auth/mfa/disable — Disable MFA (requires valid TOTP code) */
router.post('/mfa/disable', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Current MFA code is required' });
      return;
    }
    await authService.disableMFA(req.user!.userId, token);
    res.json({ disabled: true });
  } catch (error: any) {
    if (error.message === 'Invalid MFA code') {
      res.status(401).json({ error: error.message });
    } else if (error.message === 'MFA is not enabled') {
      res.status(400).json({ error: error.message });
    } else {
      logger.error('MFA disable error:', error);
      res.status(500).json({ error: 'MFA disable failed' });
    }
  }
});

export default router;
