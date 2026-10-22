import type { Request, Response, NextFunction } from 'express';
import { sosService } from '../services/sos.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export async function createSos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw AppError.badRequest('Idempotency-Key header is required for creating an SOS incident');
    }

    const result = await sosService.createSos(req.user.id, idempotencyKey, req.body);
    // If idempotent replay, return 200, otherwise 201
    const statusCode = result.isReplay ? 200 : 201;
    sendSuccess(res, result, statusCode);
  } catch (err) {
    next(err);
  }
}

export async function updateSosLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const incidentId = req.params.incidentId as string;
    const result = await sosService.updateLocation(req.user.id, incidentId, req.body.location);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function getSos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const incidentId = req.params.incidentId as string;
    const incident = await sosService.getIncident(req.user.id, incidentId);
    sendSuccess(res, {
      id: incident._id.toString(),
      status: incident.status,
      trigger: incident.trigger,
      startedAt: incident.startedAt,
      resolvedAt: incident.resolvedAt,
      resolution: incident.resolution,
      currentLocation: {
        latitude: incident.currentLocation.coordinates[1],
        longitude: incident.currentLocation.coordinates[0],
        accuracyMeters: incident.currentLocation.accuracyMeters,
        capturedAt: incident.currentLocation.capturedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function resolveSos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const incidentId = req.params.incidentId as string;
    const result = await sosService.resolveIncident(req.user.id, incidentId, req.body.resolution);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function revokeSosShare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const incidentId = req.params.incidentId as string;
    await sosService.revokeShare(req.user.id, incidentId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function notifyAgainSos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const incidentId = req.params.incidentId as string;
    const result = await sosService.notifyAgain(req.user.id, incidentId);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}
