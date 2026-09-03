import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import pinoHttp from 'pino-http';
import {
  CircuitBreaker,
  DiagnosticsClient,
  createLogger,
  createMetricsRegistry,
  isMongoReady,
} from '@cloudops/shared';
import type { ApiConfig } from './config';
import { correlationMiddleware } from './middleware/correlation';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { metricsMiddleware } from './middleware/metrics';
import { apiRouter } from './routes/api';
import { authRouter } from './routes/auth';
import { loadOpenApiSpec } from './swagger';

export function createApp(config: ApiConfig) {
  const logger = createLogger('api', config.LOG_LEVEL);
  const metrics = createMetricsRegistry('api');
  const breaker = new CircuitBreaker(config.CB_FAILURE_THRESHOLD, config.CB_RESET_TIMEOUT_MS);
  const diagnostics = new DiagnosticsClient(
    config.DIAGNOSTICS_URL,
    config.DIAGNOSTICS_TIMEOUT_MS,
    breaker,
  );

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({
        correlationId: 'correlationId' in req ? req.correlationId : undefined,
      }),
    }),
  );
  app.use(metricsMiddleware(metrics));
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'live' });
  });

  app.get('/health/ready', async (_req, res) => {
    const mongo = isMongoReady();
    const diag = await diagnostics.ready();
    const ready = mongo;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        mongodb: mongo ? 'ok' : 'down',
        diagnostics: diag ? 'ok' : 'degraded',
        circuitBreaker: breaker.getState(),
      },
    });
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
  });

  const spec = loadOpenApiSpec();
  app.get('/docs.json', (_req, res) => res.json(spec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.use('/api/v1/auth', authRouter(config));
  app.use('/api/v1', authMiddleware(config), apiRouter(config));
  app.use(errorHandler(logger));

  return { app, logger, metrics, diagnostics };
}
