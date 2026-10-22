import type { NextFunction, Request, Response } from 'express';
import { type ZodType, ZodError } from 'zod';
import { AppError, type ValidationErrorDetail } from '../utils/errors.js';

export function validateBody(schema: ZodType): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: ValidationErrorDetail[] = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          issue: issue.message,
        }));
        return next(AppError.validation(details));
      }
      return next(err);
    }
  };
}

export function validateQuery(schema: ZodType): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as Record<string, string>;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: ValidationErrorDetail[] = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          issue: issue.message,
        }));
        return next(AppError.validation(details));
      }
      return next(err);
    }
  };
}

export function validateParams(schema: ZodType): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as Record<string, string>;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: ValidationErrorDetail[] = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          issue: issue.message,
        }));
        return next(AppError.validation(details));
      }
      return next(err);
    }
  };
}
