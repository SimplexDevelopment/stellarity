import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/keys.js';
import { logger } from '../utils/logger.js';
import { AppError, apiError } from '@stellarity/shared';

import type { TokenUser } from '@stellarity/shared';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    tier: 'free' | 'premium' | 'enterprise';
  };
}

/** Authentication middleware for the central server */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(apiError('Authentication required'));
      return;
    }

    const token = authHeader.substring(7);
    const tokenUser = await verifyAccessToken(token);

    if (!tokenUser) {
      res.status(401).json(apiError('Invalid or expired token'));
      return;
    }

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

/** Optional auth — doesn't fail if no token */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenUser = await verifyAccessToken(token);

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

/** Validate request body against a Zod schema */
export function validate(schema: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      const errors = error.errors?.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message,
      })) || [{ field: 'unknown', message: 'Validation failed' }];

      res.status(400).json(apiError('Validation failed', errors));
    }
  };
}

/** Error handler middleware */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Operational errors thrown by services — return structured response
  if (err instanceof AppError) {
    res.status(err.statusCode).json(apiError(err.message));
    return;
  }

  // Unexpected errors — log and hide details in production
  logger.error('Unhandled error:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  res.status(500).json(apiError(message));
}

/** 404 handler */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(apiError('Endpoint not found'));
}
