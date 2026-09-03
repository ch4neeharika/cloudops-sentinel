import pino from 'pino';

export function createLogger(service: string, level = process.env.LOG_LEVEL ?? 'info') {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'password',
        'passwordHash',
        'token',
        'authorization',
        'req.headers.authorization',
        'AWS_SECRET_ACCESS_KEY',
        'JWT_SECRET',
      ],
      remove: true,
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
