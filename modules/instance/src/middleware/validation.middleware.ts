import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { AppError, apiError } from '@stellarity/shared';

// Validation middleware factory
export function validate(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        
        res.status(400).json(apiError('Validation failed', errors));
        return;
      }
      
      logger.error('Validation error:', error);
      res.status(400).json(apiError('Invalid request data'));
    }
  };
}

// Error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
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

// Not found handler
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(apiError('Endpoint not found'));
}
