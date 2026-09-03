import http from 'http';
import {
  CircuitBreaker,
  DiagnosticsClient,
  JobQueue,
  connectMongo,
  createLogger,
  createMetricsRegistry,
  isMongoReady,
  sleep,
} from '@cloudops/shared';
import { loadWorkerConfig } from './config';
import { JobProcessor } from './processor';

async function main() {
  const config = loadWorkerConfig();
  const logger = createLogger('worker', config.LOG_LEVEL);
  const metrics = createMetricsRegistry('worker');
  await connectMongo(config.MONGODB_URI, logger);

  const queue = new JobQueue({
    leaseMs: config.WORKER_LEASE_MS,
    maxAttempts: config.WORKER_MAX_ATTEMPTS,
    backoffBaseMs: config.WORKER_BACKOFF_BASE_MS,
    backoffMaxMs: config.WORKER_BACKOFF_MAX_MS,
  });
  const diagnostics = new DiagnosticsClient(
    config.DIAGNOSTICS_URL,
    config.DIAGNOSTICS_TIMEOUT_MS,
    new CircuitBreaker(config.CB_FAILURE_THRESHOLD, config.CB_RESET_TIMEOUT_MS),
  );
  const processor = new JobProcessor(config, queue, diagnostics, logger, metrics);

  let running = true;
  const inflight = new Set<Promise<void>>();

  const metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/health/live') {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ status: 'live' }));
      return;
    }
    if (req.url === '/health/ready') {
      const ready = isMongoReady();
      res
        .writeHead(ready ? 200 : 503, { 'content-type': 'application/json' })
        .end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
      return;
    }
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': metrics.register.contentType });
      res.end(await metrics.register.metrics());
      return;
    }
    res.writeHead(404).end();
  });
  metricsServer.listen(config.WORKER_METRICS_PORT, () => {
    logger.info({ port: config.WORKER_METRICS_PORT }, 'worker metrics listening');
  });

  const spawn = () => {
    const work = processor
      .processNext()
      .then(() => undefined)
      .catch((err) => {
        logger.error({ err }, 'unhandled processor error');
      })
      .finally(() => inflight.delete(work));
    inflight.add(work);
  };

  const loop = async () => {
    while (running) {
      try {
        const recovered = await queue.recoverAbandoned();
        if (recovered > 0) {
          logger.warn({ recovered }, 'recovered abandoned jobs');
        }
        metrics.workerQueueDepth.set(await queue.pendingDepth());
        while (running && inflight.size < config.WORKER_CONCURRENCY) {
          spawn();
        }
      } catch (err) {
        logger.error({ err }, 'worker loop error');
      }
      await sleep(config.WORKER_POLL_INTERVAL_MS);
    }
  };

  const loopPromise = loop();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker graceful shutdown');
    running = false;
    await Promise.allSettled([...inflight]);
    metricsServer.close();
    await loopPromise;
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
