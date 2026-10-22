import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export async function requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channel, destination } = req.body as { channel: 'phone' | 'email'; destination: string };
    const result = await authService.requestOtp(channel, destination);
    sendSuccess(res, result, 202);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { challengeId, code } = req.body as { challengeId: string; code: string };
    const result = await authService.verifyOtp(challengeId, code);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      await authService.logout(req.user.id);
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
