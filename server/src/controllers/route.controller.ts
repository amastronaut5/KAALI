import type { Request, Response, NextFunction } from 'express';
import { routingService } from '../services/routing.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export async function createRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const result = await routingService.requestRoute(req.user.id, req.body);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function getRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const routeRequestId = req.params.routeRequestId as string;
    const routeRequest = await routingService.getRouteRequest(req.user.id, routeRequestId);
    sendSuccess(res, {
      routeRequestId: routeRequest._id.toString(),
      origin: routeRequest.origin,
      destination: routeRequest.destination,
      preferences: routeRequest.preferences,
      result: routeRequest.result,
      versions: routeRequest.versions,
      createdAt: routeRequest.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function submitRouteFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const routeRequestId = req.params.routeRequestId as string;
    await routingService.getRouteRequest(req.user.id, routeRequestId);
    sendSuccess(res, {
      routeRequestId,
      recorded: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
