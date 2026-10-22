import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { sha256 } from '../utils/crypto.js';

interface RateLimitEntry {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}): (req: Request, res: Response, next: NextFunction) => void {
  const store = new Map<string, RateLimitEntry>();
  const { windowMs, maxRequests, keyGenerator, message } = options;

  // Periodic cleanup of stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 300000).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : (req.ip || req.socket.remoteAddress || 'unknown-ip');

    const now = Date.now();
    let entry = store.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Filter out timestamps outside window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000).toString());
      return next(
        AppError.rateLimited(
          message || 'Rate limit exceeded. Please wait before making more requests.'
        )
      );
    }

    entry.timestamps.push(now);
    next();
  };
}

// Preset Rate Limiters
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many authentication attempts. Please try again in a minute.',
});

export const otpDestinationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 3,
  keyGenerator: (req) => `${String(req.body?.channel || '')}:${sha256(String(req.body?.destination || '').trim().toLowerCase())}`,
  message: 'Too many codes have been requested for this destination. Please wait before trying again.',
});

export const sosRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many SOS requests. Please wait a moment.',
});

export const locationRateLimiter = createRateLimiter({
  windowMs: 10 * 1000, // 10 seconds
  maxRequests: 15,
  message: 'Location update rate too frequent.',
});

export const rerouteRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 6,
  message: 'Rerouting requested too frequently. Please wait before requesting another route.',
});

export const reportRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many report submissions. Please wait before submitting another report.',
});

export const detectionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many image analysis requests.',
});

export const shareRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  message: 'Too many requests to public share view.',
});
