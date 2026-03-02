/**
 * Panel Authentication Middleware
 *
 * Protects panel API routes by verifying the panel session JWT.
 */
import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from './auth.js';
import { logger } from '../utils/logger.js';

export interface PanelRequest extends Request {
  panelAdmin?: boolean;
}

/** Require a valid panel session JWT */
export async function panelAuth(
  req: PanelRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Panel authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const valid = await verifySessionToken(token);

    if (!valid) {
      res.status(401).json({ error: 'Invalid or expired panel session' });
      return;
    }

    req.panelAdmin = true;
    next();
  } catch (error) {
    logger.error('Panel auth middleware error:', error);
    res.status(401).json({ error: 'Panel authentication failed' });
  }
}
