import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/cloudops'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().default(10),
  DIAGNOSTICS_URL: z.string().default('http://localhost:8000'),
  DIAGNOSTICS_TIMEOUT_MS: z.coerce.number().default(5000),
  CLOUD_PROVIDER: z.enum(['mock', 'aws']).default('mock'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_READ_ONLY: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  ENABLE_AWS_MUTATIONS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  AWS_MAX_ATTEMPTS: z.coerce.number().default(3),
  AWS_REQUEST_TIMEOUT_MS: z.coerce.number().default(4000),
  AWS_ENDPOINT_URL: z.string().optional().default(''),
  CB_FAILURE_THRESHOLD: z.coerce.number().default(5),
  CB_RESET_TIMEOUT_MS: z.coerce.number().default(15000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  APPROVAL_TTL_MS: z.coerce.number().default(900000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().default(5),
  WORKER_JOB_TIMEOUT_MS: z.coerce.number().default(20000),
  DEFAULT_WORKSPACE_ID: z.string().default('ws_demo_acme'),
});

export type ApiConfig = z.infer<typeof envSchema>;

export function loadConfig(overrides: Record<string, string | undefined> = {}): ApiConfig {
  return envSchema.parse({ ...process.env, ...overrides });
}
