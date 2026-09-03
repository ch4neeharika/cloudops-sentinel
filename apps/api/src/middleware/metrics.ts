import type { Request, Response, NextFunction } from 'express';
import type { Metrics } from '@cloudops/shared';

export function metricsMiddleware(metrics: Metrics) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
      metrics.observeHttp(req.method, route, res.statusCode, duration);
    });
    next();
  };
}
