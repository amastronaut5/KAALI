import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;
let listenersRegistered = false;
let connectionAttempt: Promise<typeof mongoose> | null = null;

function errorMetadata(error: unknown): { name: string; code?: string | number } {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' };
  const record = error as { name?: unknown; code?: unknown };
  return {
    name: typeof record.name === 'string' ? record.name : 'MongoConnectionError',
    ...(typeof record.code === 'string' || typeof record.code === 'number' ? { code: record.code } : {}),
  };
}

export async function connectDatabase(connect: typeof mongoose.connect = (...args) => mongoose.connect(...args)): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectionAttempt) return connectionAttempt;

  if (!listenersRegistered) {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('MongoDB connection established successfully');
    });
    mongoose.connection.on('error', (error) => {
      const metadata = errorMetadata(error);
      logger.error('MongoDB connection error', new Error(metadata.name), { errorCode: metadata.code });
    });
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });
    listenersRegistered = true;
  }

  connectionAttempt = connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    autoIndex: true,
  }).then((connection) => {
    isConnected = true;
    return connection;
  }).catch((error: unknown) => {
    isConnected = false;
    const metadata = errorMetadata(error);
    logger.error('MongoDB connection could not be established; verify MONGODB_URI, network access, and Atlas IP allowlisting.', new Error(metadata.name), { errorCode: metadata.code });
    throw new Error('MongoDB is unreachable. Verify MONGODB_URI, network access, credentials, and Atlas IP allowlisting.');
  }).finally(() => {
    connectionAttempt = null;
  });

  return connectionAttempt;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB connection closed');
  }
}

export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
