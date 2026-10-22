import { z } from 'zod';
import { CANONICAL_ENUMS } from '../config/constants.js';

export const createSosSchema = z.object({
  trigger: z.enum(['manual', 'automatic', 'test']).default('manual'),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative().default(10),
    capturedAt: z.string().datetime().optional(),
  }),
  shareLocation: z.boolean().default(true),
});

export const updateSosLocationSchema = z.object({
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative().default(10),
    headingDegrees: z.number().min(0).max(360).optional(),
    speedMetersPerSecond: z.number().nonnegative().optional(),
    capturedAt: z.string().datetime().optional(),
  }),
});

export const resolveSosSchema = z.object({
  resolution: z.enum(CANONICAL_ENUMS.sosResolution).default('resolved'),
});
