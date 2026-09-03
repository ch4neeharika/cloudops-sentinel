import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject } from 'zod';
import { ValidationError } from '@cloudops/shared';

export function validate(schema: AnyZodObject, source: 'body' | 'query' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      next(new ValidationError('Request validation failed', parsed.error.flatten()));
      return;
    }
    if (source === 'query') {
      Object.assign(req.query, parsed.data);
    } else {
      req.body = parsed.data;
    }
    next();
  };
}
