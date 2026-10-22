import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { isDbConnected } from './config/db.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './utils/errors.js';
import { sendSuccess } from './utils/response.js';
import apiV1Router from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Basic security and parsing
  app.disable('x-powered-by');

  // CORS configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, postman) or if origin is in allowedOrigins
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Share-Token', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
    })
  );

  // Request ID middleware
  app.use(requestIdMiddleware);

  // Request body parsing with strict size limits
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Health and Readiness probes (not versioned)
  app.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', (_req: Request, res: Response, next) => {
    const dbOk = isDbConnected();
    if (!dbOk) {
      return next(AppError.intelligenceUnavailable('Database connection is not ready'));
    }
    sendSuccess(res, {
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API v1 router
  app.use('/api/v1', apiV1Router);

  // 404 handler for unmatched routes
  app.use((_req: Request, _res: Response, next) => {
    next(AppError.notFound('Endpoint not found'));
  });

  // Central Error Handler
  app.use(errorHandler);

  return app;
}
