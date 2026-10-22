import type { Request, Response, NextFunction } from 'express';
import { navigationService } from '../services/navigation.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export async function startNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const result = await navigationService.startSession(req.user.id, req.body);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function getActiveNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const session = await navigationService.getActiveSession(req.user.id);
    sendSuccess(res, {
      navigationSessionId: session._id.toString(),
      status: session.status,
      routeRequestId: session.routeRequestId.toString(),
      selectedRouteId: session.selectedRouteId,
      startedAt: session.startedAt,
      lastLocationAt: session.lastLocationAt,
      sharing: session.sharing.enabled
        ? {
            enabled: true,
            expiresAt: session.sharing.expiresAt,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getNavigationSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const sessionId = req.params.sessionId as string;
    const session = await navigationService.getSession(req.user.id, sessionId);
    sendSuccess(res, {
      navigationSessionId: session._id.toString(),
      status: session.status,
      endReason: session.endReason,
      routeRequestId: session.routeRequestId.toString(),
      selectedRouteId: session.selectedRouteId,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      lastLocationAt: session.lastLocationAt,
      sharing: session.sharing.enabled
        ? {
            enabled: true,
            expiresAt: session.sharing.expiresAt,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function submitNavigationLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const sessionId = req.params.sessionId as string;
    const result = await navigationService.submitLocation(req.user.id, sessionId, req.body.location);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function rerouteNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const sessionId = req.params.sessionId as string;
    const result = await navigationService.reroute(
      req.user.id,
      sessionId,
      req.body.currentLocation,
      req.body.reason
    );
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function updateNavigationSharing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const sessionId = req.params.sessionId as string;
    const result = await navigationService.updateSharing(req.user.id, sessionId, req.body);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function finishNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const sessionId = req.params.sessionId as string;
    const result = await navigationService.finishSession(req.user.id, sessionId, req.body.reason);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
