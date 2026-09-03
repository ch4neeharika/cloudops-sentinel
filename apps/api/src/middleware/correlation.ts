import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-correlation-id') || req.header('x-request-id');
  const correlationId = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}
