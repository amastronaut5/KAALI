import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();
const httpServer = createServer(app);

async function start(): Promise<void> {
  await connectDatabase();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once('error', onError);
    httpServer.listen(env.PORT, () => {
      httpServer.off('error', onError);
      logger.info(`Kaali API listening on port ${env.PORT}`);
      resolve();
    });
  });
}

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (httpServer.listening) {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeIdleConnections();
    });
  }
  await disconnectDatabase();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stop().catch(() => {
      logger.error('Kaali API shutdown encountered an error');
      process.exitCode = 1;
    });
  });
}
void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup failure';
  logger.error('Kaali API failed to start', new Error(message));
  void disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
