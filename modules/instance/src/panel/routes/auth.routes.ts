/**
 * Panel Auth Routes — POST /panel/api/auth/*
 *
 * Status: check if passphrase is configured (needs setup?)
 * Setup:  set initial passphrase on first-time use
 * Login:  verify passphrase → issue JWT
 * Verify: check if current session is still valid
 * Change: update passphrase (requires current passphrase)
 */
import { Router, Request, Response } from 'express';
import { verifyPassphrase, issueSessionToken, verifySessionToken, needsSetup, setupPassphrase, changePassphrase } from '../auth.js';
import { panelAuth } from '../middleware.js';
import { query, generateId, now } from '../../database/database.js';
import { logger } from '../../utils/logger.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Aggressive rate limiting on login to prevent brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** GET /panel/api/auth/status — check if passphrase has been configured */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const setup = await needsSetup();
    res.json({ needsSetup: setup });
  } catch (error) {
    logger.error('Panel auth status error:', error);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

// Rate limiting for setup (prevent abuse even though it's one-time)
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many setup attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** POST /panel/api/auth/setup — set the initial passphrase (first-time only) */
router.post('/setup', setupLimiter, async (req: Request, res: Response) => {
  try {
    const { passphrase } = req.body;

    if (!passphrase || typeof passphrase !== 'string') {
      res.status(400).json({ error: 'Passphrase is required' });
      return;
    }

    if (passphrase.length < 8) {
      res.status(400).json({ error: 'Passphrase must be at least 8 characters' });
      return;
    }

    const setup = await needsSetup();
    if (!setup) {
      res.status(409).json({ error: 'Passphrase has already been configured. Use change-passphrase instead.' });
      return;
    }

    await setupPassphrase(passphrase);
    const token = await issueSessionToken();

    // Audit log
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.setup.complete', 'panel', '{}', req.ip || 'unknown', now()]
    );

    logger.info('Panel initial passphrase set by user');
    res.json({ token, message: 'Passphrase configured successfully' });
  } catch (error: any) {
    logger.error('Panel setup error:', error);
    res.status(500).json({ error: error.message || 'Setup failed' });
  }
});

/** POST /panel/api/auth/login */
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { passphrase } = req.body;

    if (!passphrase || typeof passphrase !== 'string') {
      res.status(400).json({ error: 'Passphrase is required' });
      return;
    }

    const valid = await verifyPassphrase(passphrase);

    if (!valid) {
      // Audit failed login attempt
      query(
        `INSERT INTO audit_logs (id, user_id, action, target_type, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [generateId(), 'panel-admin', 'panel.login.failed', 'panel', '{}', req.ip || 'unknown', now()]
      );

      res.status(401).json({ error: 'Invalid passphrase' });
      return;
    }

    const token = await issueSessionToken();

    // Audit successful login
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.login.success', 'panel', '{}', req.ip || 'unknown', now()]
    );

    res.json({ token });
  } catch (error) {
    logger.error('Panel login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/** GET /panel/api/auth/verify */
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.json({ valid: false });
      return;
    }

    const token = authHeader.substring(7);
    const valid = await verifySessionToken(token);

    res.json({ valid });
  } catch {
    res.json({ valid: false });
  }
});

/** POST /panel/api/auth/change-passphrase — change the passphrase (requires auth + current passphrase) */
router.post('/change-passphrase', panelAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassphrase, newPassphrase } = req.body;

    if (!currentPassphrase || typeof currentPassphrase !== 'string') {
      res.status(400).json({ error: 'Current passphrase is required' });
      return;
    }

    if (!newPassphrase || typeof newPassphrase !== 'string') {
      res.status(400).json({ error: 'New passphrase is required' });
      return;
    }

    if (newPassphrase.length < 8) {
      res.status(400).json({ error: 'New passphrase must be at least 8 characters' });
      return;
    }

    await changePassphrase(currentPassphrase, newPassphrase);

    // Issue a new token since the old passphrase is now invalid
    const token = await issueSessionToken();

    // Audit log
    query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateId(), 'panel-admin', 'panel.passphrase.changed', 'panel', '{}', req.ip || 'unknown', now()]
    );

    res.json({ token, message: 'Passphrase changed successfully' });
  } catch (error: any) {
    if (error.message === 'Current passphrase is incorrect') {
      res.status(401).json({ error: error.message });
      return;
    }
    logger.error('Panel change passphrase error:', error);
    res.status(500).json({ error: 'Failed to change passphrase' });
  }
});

export default router;
