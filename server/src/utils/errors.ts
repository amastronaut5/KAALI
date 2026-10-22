import { ERROR_CODES, type ErrorCode } from '../config/constants.js';

export interface ValidationErrorDetail {
  field?: string | undefined;
  issue: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: ValidationErrorDetail[] | undefined;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: ValidationErrorDetail[] | undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: ValidationErrorDetail[]): AppError {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static validation(details: ValidationErrorDetail[], message = 'The request contains invalid fields.'): AppError {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message = 'Missing or invalid authentication'): AppError {
    return new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'Not authorized to perform this action'): AppError {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found or inaccessible'): AppError {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, ERROR_CODES.CONFLICT, message);
  }

  static idempotencyConflict(message = 'Idempotency conflict: key replayed with a different request body'): AppError {
    return new AppError(409, ERROR_CODES.IDEMPOTENCY_CONFLICT, message);
  }

  static noFeasibleRoute(message = 'No feasible route satisfies the constraints'): AppError {
    return new AppError(422, ERROR_CODES.NO_FEASIBLE_ROUTE, message);
  }

  static fileTooLarge(message = 'Upload exceeds size limit'): AppError {
    return new AppError(413, ERROR_CODES.FILE_TOO_LARGE, message);
  }

  static unsupportedFile(message = 'Unsupported or malformed image'): AppError {
    return new AppError(422, ERROR_CODES.UNSUPPORTED_FILE, message);
  }

  static rateLimited(message = 'Rate limit exceeded. Please try again later.'): AppError {
    return new AppError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static intelligenceError(message = 'Intelligence service returned an invalid response'): AppError {
    return new AppError(502, ERROR_CODES.INTELLIGENCE_SERVICE_ERROR, message);
  }

  static intelligenceUnavailable(message = 'Intelligence service is currently unavailable'): AppError {
    return new AppError(503, ERROR_CODES.INTELLIGENCE_UNAVAILABLE, message);
  }

  static internal(message = 'An unexpected server error occurred'): AppError {
    return new AppError(500, ERROR_CODES.INTERNAL_ERROR, message);
  }
}
