import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError, verifyAccessToken } from '@cloudops/shared';
import type { ApiConfig } from '../config';

export function authMiddleware(config: ApiConfig) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError());
      return;
    }
    try {
      req.auth = verifyAccessToken(header.slice('Bearer '.length), config.JWT_SECRET);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles: Array<'admin' | 'operator' | 'viewer'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
