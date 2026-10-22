import { env } from '../config/env.js';
import {
  ContactModel,
  IncidentLocationModel,
  IncidentModel,
  NavigationSessionModel,
  NotificationLogModel,
  type IIncident,
} from '../models/index.js';
import { notificationService } from './notification/notification.service.js';
import {
  computeCanonicalRequestHash,
  generateRandomToken,
  hashToken,
  hashTokenCandidates,
} from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { validatePilotCoordinates } from '../utils/geo.js';

function summarizeNotificationStatus(statuses: string[]): CreateSosResult['notifications']['status'] {
  if (statuses.includes('accepted') || statuses.includes('delivered')) return 'accepted';
  if (statuses.includes('queued')) return 'queued';
  if (statuses.length > 0 && statuses.every((status) => status === 'failed')) return 'failed';
  return 'unknown';
}

export interface CreateSosResult {
  incidentId: string;
  status: string;
  startedAt: string;
  notifications: {
    status: 'queued' | 'accepted' | 'unknown' | 'failed';
    contactsTargeted: number;
  };
  liveShare: {
    url: string;
    expiresAt: string;
  } | null;
  isReplay?: boolean;
}

export class SosService {
  /**
   * Create an SOS incident with strict idempotency and resilient notification dispatch
   */
  async createSos(
    userId: string,
    clientRequestId: string,
    body: {
      trigger: 'manual' | 'automatic' | 'test';
      location: {
        latitude: number;
        longitude: number;
        accuracyMeters: number;
        capturedAt?: string;
      };
      shareLocation?: boolean;
    }
  ): Promise<CreateSosResult> {
    if (!clientRequestId || typeof clientRequestId !== 'string') {
      throw AppError.badRequest('Missing or invalid Idempotency-Key header');
    }

    const canonicalHash = computeCanonicalRequestHash(body);

    // Check for existing incident with same clientRequestId for this user
    const existing = await IncidentModel.findOne({ userId, clientRequestId });
    if (existing) {
      if (existing.requestHash === canonicalHash) {
        const previousAttempts = await NotificationLogModel.find({ incidentId: existing._id }).select('deliveryStatus').lean();
        const previousStatus = summarizeNotificationStatus(previousAttempts.map((attempt) => attempt.deliveryStatus));
        return {
          incidentId: existing._id.toString(),
          status: existing.status,
          startedAt: existing.startedAt.toISOString(),
          notifications: {
            status: previousStatus,
            contactsTargeted: 0,
          },
          liveShare:
            existing.share.tokenHash && existing.share.expiresAt && !existing.share.revokedAt
              ? {
                  url: `https://${env.APP_DOMAIN}/share`,
                  expiresAt: existing.share.expiresAt.toISOString(),
                }
              : null,
          isReplay: true,
        };
      } else {
        // Idempotency conflict: same key with different body
        throw AppError.idempotencyConflict();
      }
    }

    // Validate coordinates within pilot bounding box
    validatePilotCoordinates(body.location.latitude, body.location.longitude);

    let rawShareToken: string | null = null;
    let shareTokenHash: string | null = null;
    let shareExpiresAt: Date | null = null;

    if (body.shareLocation) {
      rawShareToken = generateRandomToken(32);
      shareTokenHash = hashToken(rawShareToken);
      shareExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    }

    const capturedAt = body.location.capturedAt
      ? new Date(body.location.capturedAt)
      : new Date();

    const incident = await IncidentModel.create({
      userId,
      clientRequestId,
      requestHash: canonicalHash,
      status: 'active',
      trigger: body.trigger,
      startedAt: new Date(),
      currentLocation: {
        type: 'Point',
        coordinates: [body.location.longitude, body.location.latitude],
        accuracyMeters: body.location.accuracyMeters,
        capturedAt,
      },
      share: {
        tokenHash: shareTokenHash,
        expiresAt: shareExpiresAt,
        revokedAt: null,
      },
      locationRetentionUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    // Save initial location in IncidentLocationModel trail
    await IncidentLocationModel.create({
      incidentId: incident._id,
      userId,
      location: {
        type: 'Point',
        coordinates: [body.location.longitude, body.location.latitude],
      },
      accuracyMeters: body.location.accuracyMeters,
      capturedAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Notify accepted trusted contacts
    const acceptedContacts = await ContactModel.find({
      userId,
      status: 'accepted',
    });

    const shareUrl = rawShareToken ? `https://${env.APP_DOMAIN}/share#${rawShareToken}` : undefined;

    const notificationResults = await Promise.all(acceptedContacts.flatMap((contact) => contact.channels.map((channel) =>
        notificationService.dispatch({
            incidentId: incident._id.toString(),
            userId,
            contactId: contact._id.toString(),
            contactName: contact.name,
            recipientPhoneOrEmail: contact.phoneE164,
            channel,
            message: `EMERGENCY ALERT: An SOS has been triggered. Track live location: ${shareUrl || 'No link'}`,
            shareUrl,
          })
    )));

    return {
      incidentId: incident._id.toString(),
      status: incident.status,
      startedAt: incident.startedAt.toISOString(),
      notifications: {
        status: summarizeNotificationStatus(notificationResults.map((result) => result.deliveryStatus)),
        contactsTargeted: acceptedContacts.length,
      },
      liveShare:
        shareUrl && shareExpiresAt
          ? {
              url: shareUrl,
              expiresAt: shareExpiresAt.toISOString(),
            }
          : null,
    };
  }

  /**
   * Submit an active SOS location update
   */
  async updateLocation(
    userId: string,
    incidentId: string,
    locationData: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      headingDegrees?: number;
      speedMetersPerSecond?: number;
      capturedAt?: string;
    }
  ): Promise<{ incidentId: string; accepted: boolean; serverReceivedAt: string }> {
    const incident = await IncidentModel.findOne({ _id: incidentId, userId });
    if (!incident) {
      throw AppError.notFound('SOS incident not found or unauthorized');
    }

    if (incident.status !== 'active') {
      throw AppError.conflict(`Cannot update location for an incident with status "${incident.status}"`);
    }

    validatePilotCoordinates(locationData.latitude, locationData.longitude);

    const capturedAt = locationData.capturedAt
      ? new Date(locationData.capturedAt)
      : new Date();

    incident.currentLocation = {
      type: 'Point',
      coordinates: [locationData.longitude, locationData.latitude],
      accuracyMeters: locationData.accuracyMeters,
      capturedAt,
    };
    await incident.save();

    // Append to location history
    const trailData: Record<string, unknown> = {
      incidentId: incident._id,
      userId,
      location: {
        type: 'Point',
        coordinates: [locationData.longitude, locationData.latitude],
      },
      accuracyMeters: locationData.accuracyMeters,
      capturedAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    if (locationData.headingDegrees !== undefined) trailData.headingDegrees = locationData.headingDegrees;
    if (locationData.speedMetersPerSecond !== undefined) trailData.speedMetersPerSecond = locationData.speedMetersPerSecond;

    await IncidentLocationModel.create(trailData);

    return {
      incidentId: incident._id.toString(),
      accepted: true,
      serverReceivedAt: new Date().toISOString(),
    };
  }

  /**
   * Get an incident by ID
   */
  async getIncident(userId: string, incidentId: string): Promise<IIncident> {
    const incident = await IncidentModel.findOne({ _id: incidentId, userId });
    if (!incident) {
      throw AppError.notFound('Incident not found or unauthorized');
    }
    return incident;
  }

  /**
   * Resolve an SOS incident
   */
  async resolveIncident(
    userId: string,
    incidentId: string,
    resolution: 'resolved' | 'cancelled' | 'false_alarm'
  ): Promise<{ incidentId: string; status: string; resolution: string; resolvedAt: string }> {
    const incident = await IncidentModel.findOne({ _id: incidentId, userId });
    if (!incident) {
      throw AppError.notFound('SOS incident not found or unauthorized');
    }

    if (incident.status === 'resolved' || incident.status === 'cancelled') {
      return {
        incidentId: incident._id.toString(),
        status: incident.status,
        resolution: incident.resolution || resolution,
        resolvedAt: incident.resolvedAt?.toISOString() || new Date().toISOString(),
      };
    }

    // Canonical status mapping
    if (resolution === 'resolved') {
      incident.status = 'resolved';
    } else {
      incident.status = 'cancelled';
    }

    incident.resolution = resolution;
    incident.resolvedAt = new Date();

    // Revoke share token
    if (incident.share) {
      incident.share.tokenHash = null;
      incident.share.revokedAt = new Date();
    }

    await incident.save();

    return {
      incidentId: incident._id.toString(),
      status: incident.status,
      resolution: incident.resolution,
      resolvedAt: incident.resolvedAt.toISOString(),
    };
  }

  /**
   * Revoke live-share without resolving the incident
   */
  async revokeShare(userId: string, incidentId: string): Promise<void> {
    const incident = await IncidentModel.findOne({ _id: incidentId, userId });
    if (!incident) {
      throw AppError.notFound('SOS incident not found or unauthorized');
    }

    incident.share.tokenHash = null;
    incident.share.revokedAt = new Date();
    await incident.save();
  }

  /**
   * Retry failed notifications
   */
  async notifyAgain(
    userId: string,
    incidentId: string
  ): Promise<{ incidentId: string; retriedCount: number }> {
    const incident = await IncidentModel.findOne({ _id: incidentId, userId });
    if (!incident || incident.status !== 'active') {
      throw AppError.badRequest('Cannot retry notifications for an inactive or nonexistent incident');
    }

    const failedLogs = await NotificationLogModel.find({
      incidentId: incident._id,
      deliveryStatus: 'failed',
    });

    let retriedCount = 0;
    for (const log of failedLogs) {
      const contact = log.contactId ? await ContactModel.findOne({ _id: log.contactId, userId, status: 'accepted' }) : null;
      if (contact) {
        await notificationService.dispatch({
            incidentId: incident._id.toString(),
            userId,
            contactId: contact._id.toString(),
            contactName: contact.name,
            recipientPhoneOrEmail: contact.phoneE164,
            channel: log.channel,
            message: 'RETRY EMERGENCY ALERT: SOS incident is still active.',
          });
        retriedCount++;
      }
    }

    return {
      incidentId: incident._id.toString(),
      retriedCount,
    };
  }

  /**
   * View live-share data for an incident or navigation session using high-entropy share token
   */
  async getShareView(token: string): Promise<{
    kind: 'incident' | 'navigation';
    id: string;
    status: string;
    location: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number | undefined;
      capturedAt?: Date | undefined;
    } | null;
    startedAt: Date;
    expiresAt?: Date | null | undefined;
  }> {
    if (!token || typeof token !== 'string') {
      throw AppError.unauthenticated('Share token missing');
    }

    const tokenHashes = hashTokenCandidates(token.trim());
    const now = new Date();

    // 1. Check SOS Incident
    const incident = await IncidentModel.findOne({
      'share.tokenHash': { $in: tokenHashes },
      'share.revokedAt': null,
    });

    if (incident) {
      if (incident.share.expiresAt && incident.share.expiresAt.getTime() < now.getTime()) {
        throw AppError.unauthenticated('This share link has expired');
      }

      return {
        kind: 'incident',
        id: incident._id.toString(),
        status: incident.status,
        location: {
          latitude: incident.currentLocation.coordinates[1],
          longitude: incident.currentLocation.coordinates[0],
          accuracyMeters: incident.currentLocation.accuracyMeters,
          capturedAt: incident.currentLocation.capturedAt,
        },
        startedAt: incident.startedAt,
        expiresAt: incident.share.expiresAt,
      };
    }

    // 2. Check Navigation Session
    const session = await NavigationSessionModel.findOne({
      'sharing.tokenHash': { $in: tokenHashes },
      'sharing.revokedAt': null,
    });

    if (session) {
      if (session.sharing.expiresAt && session.sharing.expiresAt.getTime() < now.getTime()) {
        throw AppError.unauthenticated('This share link has expired');
      }

      return {
        kind: 'navigation',
        id: session._id.toString(),
        status: session.status,
        location: session.lastLocation && session.lastLocation.coordinates
          ? {
              latitude: session.lastLocation.coordinates[1]!,
              longitude: session.lastLocation.coordinates[0]!,
              accuracyMeters: session.lastLocation.accuracyMeters,
              capturedAt: session.lastLocation.capturedAt,
            }
          : null,
        startedAt: session.startedAt,
        expiresAt: session.sharing.expiresAt,
      };
    }

    throw AppError.notFound('Invalid or revoked share token');
  }
}

export const sosService = new SosService();
