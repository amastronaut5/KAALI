import { z } from 'zod';
import { CANONICAL_ENUMS } from '../config/constants.js';

export const startNavigationSchema = z.object({
  routeRequestId: z.string().min(1, 'routeRequestId is required'),
  selectedRouteId: z.string().min(1, 'selectedRouteId is required'),
  shareLocationWithContacts: z.boolean().default(false),
  sharingDurationMinutes: z.number().int().min(5).max(180).optional(),
});

export const updateNavigationLocationSchema = z.object({
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative().default(10),
    headingDegrees: z.number().min(0).max(360).optional(),
    speedMetersPerSecond: z.number().nonnegative().optional(),
    capturedAt: z.string().datetime().optional(),
  }),
});

export const rerouteSchema = z.object({
  currentLocation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative().default(10),
  }),
  reason: z.enum(CANONICAL_ENUMS.rerouteReason).default('route_deviation'),
});

export const updateSharingSchema = z.object({
  enabled: z.boolean(),
  contactIds: z.array(z.string()).optional(),
  durationMinutes: z.number().int().min(5).max(180).optional(),
});

export const finishNavigationSchema = z.object({
  reason: z.enum(CANONICAL_ENUMS.navigationFinishReason).default('arrived'),
});
