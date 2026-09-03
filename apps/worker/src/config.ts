import { z } from 'zod';

export const workerEnvSchema = z.object({
  LOG_LEVEL: z.string().default('info'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/cloudops'),
  DIAGNOSTICS_URL: z.string().default('http://localhost:8000'),
  DIAGNOSTICS_TIMEOUT_MS: z.coerce.number().default(5000),
  WORKER_ID: z.string().default('worker-1'),
  WORKER_CONCURRENCY: z.coerce.number().default(2),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  WORKER_LEASE_MS: z.coerce.number().default(30000),
  WORKER_HEARTBEAT_MS: z.coerce.number().default(8000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().default(5),
  WORKER_JOB_TIMEOUT_MS: z.coerce.number().default(20000),
  WORKER_BACKOFF_BASE_MS: z.coerce.number().default(500),
  WORKER_BACKOFF_MAX_MS: z.coerce.number().default(15000),
  WORKER_METRICS_PORT: z.coerce.number().default(9091),
  CB_FAILURE_THRESHOLD: z.coerce.number().default(5),
  CB_RESET_TIMEOUT_MS: z.coerce.number().default(15000),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadWorkerConfig(overrides: Record<string, string | undefined> = {}): WorkerConfig {
  return workerEnvSchema.parse({ ...process.env, ...overrides });
}
