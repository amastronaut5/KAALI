import { z } from 'zod';
import { CANONICAL_ENUMS } from '../config/constants.js';

export const createReportSchema = z.object({
  category: z.enum(CANONICAL_ENUMS.reportCategory),
  description: z.string().min(3).max(500),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  observedAt: z.string().datetime().optional(),
});

export const reportBboxQuerySchema = z.object({
  bbox: z
    .string()
    .min(1, 'bbox query parameter is required (format: minLon,minLat,maxLon,maxLat)')
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox must be minLon,minLat,maxLon,maxLat'),
});
