import { Request, Response, NextFunction } from 'express';
import { verifyAdminAccessToken } from '../config/keys.js';
import { logger } from '../utils/logger.js';

export interface AdminRequest extends Request {
  admin?: {
    adminId: string;
    username: string;
    role: 'admin' | 'superadmin';
  };
}

/** Authentication middleware for admin routes */
export async function authenticateAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const adminUser = await verifyAdminAccessToken(token);

    if (!adminUser) {
      res.status(401).json({ error: 'Invalid or expired admin token' });
      return;
    }

    req.admin = {
      adminId: adminUser.sub,
      username: adminUser.username,
      role: adminUser.role,
    };

    next();
  } catch (error) {
    logger.error('Admin authentication error:', error);
    res.status(401).json({ error: 'Admin authentication failed' });
  }
}

/** Require superadmin role */
export function requireSuperAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.admin || req.admin.role !== 'superadmin') {
    res.status(403).json({ error: 'Superadmin access required' });
    return;
  }
  next();
}
