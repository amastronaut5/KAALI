import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw AppError.unauthenticated();
    }
    const user = await authService.getProfile(req.user.id);
    sendSuccess(res, {
      id: user._id.toString(),
      displayName: user.displayName,
      email: user.email,
      phoneE164: user.phoneE164,
      preferredLanguage: user.preferredLanguage,
      consent: user.consent,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw AppError.unauthenticated();
    }
    const user = await authService.updateProfile(req.user.id, req.body);
    sendSuccess(res, {
      id: user._id.toString(),
      displayName: user.displayName,
      email: user.email,
      phoneE164: user.phoneE164,
      preferredLanguage: user.preferredLanguage,
      consent: user.consent,
    });
  } catch (err) {
    next(err);
  }
}
