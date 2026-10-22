import type { Request, Response, NextFunction } from 'express';
import { sosService } from '../services/sos.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export async function getShareView(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Check X-Share-Token header first, then route param or query
    const headerToken = req.headers['x-share-token'];
    const paramToken = req.params.token;
    const queryToken = req.query.token as string | undefined;

    const token =
      typeof headerToken === 'string' && headerToken.trim()
        ? headerToken.trim()
        : typeof paramToken === 'string' && paramToken.trim()
        ? paramToken.trim()
        : queryToken?.trim();

    if (!token) {
      throw AppError.unauthenticated('Share token is required via X-Share-Token header');
    }

    // Set safety header
    res.setHeader('Referrer-Policy', 'no-referrer');

    const result = await sosService.getShareView(token);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
