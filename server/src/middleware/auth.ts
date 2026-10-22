import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface AuthUser {
  id: string;
  phoneE164?: string | undefined;
  displayName?: string | undefined;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function generateAccessToken(payload: { id: string; phoneE164?: string | undefined; displayName?: string | undefined }): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  });
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      phoneE164?: string;
      displayName?: string;
    };
    return {
      id: decoded.id,
      phoneE164: decoded.phoneE164,
      displayName: decoded.displayName,
    };
  } catch (_err) {
    throw AppError.unauthenticated('Invalid or expired authentication token');
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthenticated('Authorization header missing or not in Bearer format'));
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(AppError.unauthenticated('Bearer token is empty'));
  }

  try {
    const user = verifyAccessToken(token);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next();
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Optional auth ignores invalid token
  }
  next();
}
