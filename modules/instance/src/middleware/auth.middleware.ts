import { Request, Response, NextFunction } from 'express';
import { verifyCentralToken } from '../utils/centralAuth.js';
import { cache } from '../database/redis.js';
import { logger } from '../utils/logger.js';
import { apiError } from '@stellarity/shared';

import type { TokenUser } from '@stellarity/shared';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    tier: string;
  };
}

/**
 * Authentication middleware for instance server.
 * Verifies JWTs signed by the central server using Ed25519 (EdDSA).
 * The instance never manages passwords or user accounts directly.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(apiError('Authentication required'));
      return;
    }
    
    const token = authHeader.substring(7);
    
    // Check if token is blacklisted on this instance
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      res.status(401).json(apiError('Token has been revoked'));
      return;
    }
    
    // Verify token signature against central server's public key
    const tokenUser = await verifyCentralToken(token);
    
    if (!tokenUser) {
      res.status(401).json(apiError('Invalid or expired token'));
      return;
    }
    
    // Attach user info from JWT claims to request
    req.user = {
      userId: tokenUser.sub,
      username: tokenUser.username,
      displayName: tokenUser.displayName,
      avatarUrl: tokenUser.avatarUrl,
      tier: tokenUser.tier,
    };
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json(apiError('Authentication failed'));
  }
}

/** Optional authentication (doesn't fail if no token) */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenUser = await verifyCentralToken(token);
      
      if (tokenUser) {
        req.user = {
          userId: tokenUser.sub,
          username: tokenUser.username,
          displayName: tokenUser.displayName,
          avatarUrl: tokenUser.avatarUrl,
          tier: tokenUser.tier,
        };
      }
    }
    
    next();
  } catch {
    next();
  }
}
