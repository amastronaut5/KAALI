import { Types } from 'mongoose';
import { env } from '../config/env.js';
import {
  ContactModel,
  NavigationSessionModel,
  RouteRequestModel,
  type INavigationSession,
  type IRouteCandidate,
} from '../models/index.js';
import { routingService } from './routing.service.js';
import { generateRandomToken, hashToken } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { validatePilotCoordinates, type LatLng } from '../utils/geo.js';

export class NavigationService {
  /**
   * Start a new active navigation session
   * Enforces one active session per user!
   */
  async startSession(
    userId: string,
    params: {
      routeRequestId: string;
      selectedRouteId: string;
      shareLocationWithContacts?: boolean;
      sharingDurationMinutes?: number;
    }
  ): Promise<{
    navigationSessionId: string;
    status: string;
    startedAt: string;
    locationUpdateIntervalHintSeconds: number;
    sharing: { url: string; expiresAt: string } | null;
  }> {
    // 1. Verify that route request exists and belongs to user
    const routeRequest = await RouteRequestModel.findOne({
      _id: params.routeRequestId,
      userId,
    });
    if (!routeRequest) {
      throw AppError.notFound('Route request not found or unauthorized');
    }

    // 2. Validate selectedRouteId exists in routes
    const routeCandidate = routeRequest.result.routes.find(
      (r) => r.routeId === params.selectedRouteId
    );
    if (!routeCandidate) {
      throw AppError.badRequest(`Route ID "${params.selectedRouteId}" does not exist in the route request`);
    }

    // 3. Enforce strictly one active navigation session per user
    const existingActive = await NavigationSessionModel.findOne({
      userId,
      status: 'active',
    });
    if (existingActive) {
      throw AppError.conflict('An active navigation session already exists for this user. Finish it before starting a new one.');
    }

    // 4. Extend route request retention while session is active
    routeRequest.expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
    await routeRequest.save();

    // 5. Configure live-sharing if requested
    let shareToken: string | null = null;
    let shareTokenHash: string | null = null;
    let shareExpiresAt: Date | null = null;
    let acceptedContactIds: Types.ObjectId[] = [];

    if (params.shareLocationWithContacts) {
      const contacts = await ContactModel.find({ userId, status: 'accepted' });
      acceptedContactIds = contacts.map((c) => c._id);

      shareToken = generateRandomToken(32);
      shareTokenHash = hashToken(shareToken);
      const durationMinutes = Math.min(params.sharingDurationMinutes || 60, 180);
      shareExpiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    }

    const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour initial activity window

    const session = await NavigationSessionModel.create({
      userId,
      routeRequestId: routeRequest._id,
      selectedRouteId: params.selectedRouteId,
      previousRouteRequestIds: [],
      rerouteCount: 0,
      status: 'active',
      endReason: null,
      origin: routeRequest.origin,
      destination: routeRequest.destination,
      sharing: {
        enabled: Boolean(params.shareLocationWithContacts),
        contactIds: acceptedContactIds,
        tokenHash: shareTokenHash,
        expiresAt: shareExpiresAt,
        revokedAt: null,
      },
      lastLocation: null,
      startedAt: new Date(),
      lastLocationAt: null,
      finishedAt: null,
      expiresAt: sessionExpiresAt,
    });

    const shareUrl = shareToken ? `https://${env.APP_DOMAIN}/share#${shareToken}` : null;

    return {
      navigationSessionId: session._id.toString(),
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      locationUpdateIntervalHintSeconds: 5,
      sharing:
        shareUrl && shareExpiresAt
          ? {
              url: shareUrl,
              expiresAt: shareExpiresAt.toISOString(),
            }
          : null,
    };
  }

  /**
   * Get active session for user
   */
  async getActiveSession(userId: string): Promise<INavigationSession> {
    const session = await NavigationSessionModel.findOne({
      userId,
      status: 'active',
    });
    if (!session) {
      throw AppError.notFound('No active navigation session found');
    }
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(userId: string, sessionId: string): Promise<INavigationSession> {
    const session = await NavigationSessionModel.findOne({
      _id: sessionId,
      userId,
    });
    if (!session) {
      throw AppError.notFound('Navigation session not found or unauthorized');
    }
    return session;
  }

  /**
   * Submit GPS location update during active navigation session
   */
  async submitLocation(
    userId: string,
    sessionId: string,
    locationData: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      headingDegrees?: number;
      speedMetersPerSecond?: number;
      capturedAt?: string;
    }
  ): Promise<{ navigationSessionId: string; accepted: boolean; serverReceivedAt: string }> {
    const session = await NavigationSessionModel.findOne({
      _id: sessionId,
      userId,
    });
    if (!session) {
      throw AppError.notFound('Navigation session not found or unauthorized');
    }

    if (session.status !== 'active') {
      throw AppError.conflict(`Cannot submit location to session with status "${session.status}"`);
    }

    validatePilotCoordinates(locationData.latitude, locationData.longitude);

    const capturedAt = locationData.capturedAt ? new Date(locationData.capturedAt) : new Date();

    // While sharing is enabled, overwrite a single lastLocation
    if (session.sharing.enabled) {
      session.lastLocation = {
        type: 'Point',
        coordinates: [locationData.longitude, locationData.latitude],
        accuracyMeters: locationData.accuracyMeters,
        headingDegrees: locationData.headingDegrees,
        speedMetersPerSecond: locationData.speedMetersPerSecond,
        capturedAt,
      };
    }

    session.lastLocationAt = new Date();
    // Activity-based expiry: extend 30 minutes from now
    session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await session.save();

    // Also extend the active route request TTL
    await RouteRequestModel.updateOne(
      { _id: session.routeRequestId },
      { $set: { expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } }
    );

    return {
      navigationSessionId: session._id.toString(),
      accepted: true,
      serverReceivedAt: new Date().toISOString(),
    };
  }

  /**
   * Recalculate route for user deviation
   * Enforces destination from DB session, NOT from client!
   */
  async reroute(
    userId: string,
    sessionId: string,
    currentLocation: LatLng,
    reason: 'route_deviation' | 'reported_hazard' | 'route_blocked' | 'user_requested'
  ): Promise<{
    routeRequestId: string;
    selectedRouteId: string;
    routes: IRouteCandidate[];
    reason: string;
  }> {
    const session = await NavigationSessionModel.findOne({
      _id: sessionId,
      userId,
    });
    if (!session) {
      throw AppError.notFound('Navigation session not found or unauthorized');
    }

    if (session.status !== 'active') {
      throw AppError.conflict('Cannot reroute an inactive navigation session');
    }

    // Destination strictly comes from session.destination in DB
    const destinationLatLng: LatLng = {
      longitude: session.destination.coordinates[0]!,
      latitude: session.destination.coordinates[1]!,
    };

    // Call routing optimizer
    const newRoute = await routingService.requestRoute(userId, {
      origin: currentLocation,
      destination: destinationLatLng,
      mode: 'walking',
      priority: 'lower_risk',
    });

    // Bounded history of previous routes (last 10)
    session.previousRouteRequestIds.push(session.routeRequestId);
    if (session.previousRouteRequestIds.length > 10) {
      session.previousRouteRequestIds.shift();
    }

    session.routeRequestId = new Types.ObjectId(newRoute.routeRequestId);
    session.selectedRouteId = newRoute.selectedRouteId;
    session.rerouteCount += 1;
    session.expiresAt = new Date(Date.now() + 45 * 60 * 1000); // extend expiry
    await session.save();

    return {
      routeRequestId: newRoute.routeRequestId,
      selectedRouteId: newRoute.selectedRouteId,
      routes: newRoute.routes,
      reason,
    };
  }

  /**
   * Enable, change, or revoke trusted-contact sharing during a trip
   */
  async updateSharing(
    userId: string,
    sessionId: string,
    params: {
      enabled: boolean;
      contactIds?: string[];
      durationMinutes?: number;
    }
  ): Promise<{ enabled: boolean; url?: string; expiresAt?: string }> {
    const session = await NavigationSessionModel.findOne({
      _id: sessionId,
      userId,
    });
    if (!session) {
      throw AppError.notFound('Navigation session not found or unauthorized');
    }

    if (session.status !== 'active') {
      throw AppError.conflict('Cannot update sharing for an inactive session');
    }

    if (!params.enabled) {
      session.sharing.enabled = false;
      session.sharing.tokenHash = null;
      session.sharing.revokedAt = new Date();
      session.lastLocation = null;
      await session.save();
      return { enabled: false };
    }

    // Enable sharing
    const contacts = await ContactModel.find({
      userId,
      status: 'accepted',
      ...(params.contactIds && params.contactIds.length > 0
        ? { _id: { $in: params.contactIds } }
        : {}),
    });

    const shareToken = generateRandomToken(32);
    const tokenHash = hashToken(shareToken);
    const durationMinutes = Math.min(params.durationMinutes || 60, 180);
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    session.sharing = {
      enabled: true,
      contactIds: contacts.map((c) => c._id),
      tokenHash,
      expiresAt,
      revokedAt: null,
    };
    await session.save();

    const url = `https://${env.APP_DOMAIN}/share#${shareToken}`;

    return {
      enabled: true,
      url,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * End navigation session
   */
  async finishSession(
    userId: string,
    sessionId: string,
    reason: 'arrived' | 'stopped' | 'cancelled'
  ): Promise<{
    navigationSessionId: string;
    status: string;
    endReason: string;
    finishedAt: string;
  }> {
    const session = await NavigationSessionModel.findOne({
      _id: sessionId,
      userId,
    });
    if (!session) {
      throw AppError.notFound('Navigation session not found or unauthorized');
    }

    if (session.status !== 'active') {
      return {
        navigationSessionId: session._id.toString(),
        status: session.status,
        endReason: session.endReason || reason,
        finishedAt: session.finishedAt?.toISOString() || new Date().toISOString(),
      };
    }

    // Status mapping
    if (reason === 'arrived' || reason === 'stopped') {
      session.status = 'completed';
    } else {
      session.status = 'cancelled';
    }

    session.endReason = reason;
    session.finishedAt = new Date();

    // Revoke sharing and clear lastLocation
    session.lastLocation = null;
    session.sharing.tokenHash = null;
    session.sharing.revokedAt = new Date();

    await session.save();

    return {
      navigationSessionId: session._id.toString(),
      status: session.status,
      endReason: session.endReason,
      finishedAt: session.finishedAt.toISOString(),
    };
  }
}

export const navigationService = new NavigationService();
