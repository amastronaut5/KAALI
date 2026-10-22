import type { Response } from 'express';
import type { ErrorCode } from '../config/constants.js';
import type { ValidationErrorDetail } from './errors.js';

export interface SuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
  };
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ValidationErrorDetail[] | undefined;
    requestId: string;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const requestId = (res.req as { id?: string | undefined }).id || 'unknown';
  const envelope: SuccessEnvelope<T> = {
    data,
    meta: {
      requestId,
    },
  };
  res.status(statusCode).json(envelope);
}

export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  statusCode = 400,
  details?: ValidationErrorDetail[] | undefined
): void {
  const requestId = (res.req as { id?: string | undefined }).id || 'unknown';
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      requestId,
    },
  };
  res.status(statusCode).json(envelope);
}
