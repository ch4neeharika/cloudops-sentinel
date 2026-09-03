import mongoose from 'mongoose';
import { withRetry } from '../observability/retry';
import type { Logger } from '../observability/logger';

export async function connectMongo(uri: string, logger: Logger): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await withRetry(
    async () => {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 4000,
      });
    },
    {
      maxAttempts: 8,
      baseMs: 400,
      maxMs: 4000,
    },
  );
  logger.info({ uri: uri.replace(/\/\/.*@/, '//***@') }, 'connected to mongodb');
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}
