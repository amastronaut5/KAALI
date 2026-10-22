import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ERROR_CODES } from '../config/constants.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // If response headers already sent, pass to next
  if (res.headersSent) {
    return;
  }

  // Known Application Errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`Server error: ${err.message}`, err, { requestId: req.id, path: req.path, method: req.method });
    } else {
      logger.debug(`Client error: ${err.message}`, {
        requestId: req.id,
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
      });
    }

    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // Multer Upload Errors
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, ERROR_CODES.FILE_TOO_LARGE, 'Upload exceeds maximum permitted size (10MB)', 413);
      return;
    }
    sendError(res, ERROR_CODES.VALIDATION_ERROR, `Upload error: ${err.message}`, 400);
    return;
  }

  // JSON Body Parse Errors
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Malformed JSON payload in request body', 400);
    return;
  }

  // Mongoose CastError / ValidationError
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const errorName = (err as { name: string }).name;
    if (errorName === 'CastError') {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Invalid resource identifier format', 400);
      return;
    }
    if (errorName === 'ValidationError') {
      sendError(res, ERROR_CODES.VALIDATION_ERROR, 'Database schema validation failed', 400);
      return;
    }
  }

  // Unexpected Server Errors
  logger.error('Unhandled internal server error', err, {
    requestId: req.id,
    path: req.path,
    method: req.method,
  });

  sendError(
    res,
    ERROR_CODES.INTERNAL_ERROR,
    'An unexpected internal server error occurred',
    500
  );
}
