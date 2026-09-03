import { connectMongo } from '@cloudops/shared';
import { loadConfig } from './config';
import { createApp } from './app';

async function main() {
  const config = loadConfig();
  const { app, logger } = createApp(config);
  await connectMongo(config.MONGODB_URI, logger);

  const server = app.listen(config.API_PORT, () => {
    logger.info({ port: config.API_PORT }, 'api listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'graceful shutdown');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
