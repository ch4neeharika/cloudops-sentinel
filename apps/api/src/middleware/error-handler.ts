import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@cloudops/shared';
import type { Logger } from '@cloudops/shared';

export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const error =
      err instanceof AppError
        ? err
        : new AppError({
            message: 'Internal server error',
            statusCode: 500,
            code: 'INTERNAL_ERROR',
          });
    if (error.statusCode >= 500) {
      logger.error(
        {
          err,
          correlationId: req.correlationId,
          path: req.path,
        },
        error.message,
      );
    }
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.statusCode >= 500 ? 'Internal server error' : error.message,
        details: error.statusCode >= 500 ? undefined : error.details,
        correlationId: req.correlationId,
      },
    });
  };
}
