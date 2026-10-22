import { z } from 'zod';
import { CANONICAL_ENUMS } from '../config/constants.js';

export const createRouteSchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  mode: z.enum(CANONICAL_ENUMS.routeMode).default('walking'),
  priority: z.enum(CANONICAL_ENUMS.routePriority).default('lower_risk'),
  maxDetourRatio: z.number().min(1.0).max(2.5).default(1.25),
  departureTime: z.string().datetime().optional(),
});

export const routeFeedbackSchema = z.object({
  rating: z.string().min(1).max(50),
  comment: z.string().max(500).optional(),
});
