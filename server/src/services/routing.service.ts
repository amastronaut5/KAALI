import axios from 'axios';
import { z } from 'zod';
import { env } from '../config/env.js';
import { CANONICAL_ENUMS } from '../config/constants.js';
import { ReportModel, RouteRequestModel, type IRouteCandidate, type IRouteRequest } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { validatePilotCoordinates, type LatLng } from '../utils/geo.js';
import { logger } from '../utils/logger.js';

// Internal Python Routing Service Schema
const internalRouteCandidateSchema = z.object({
  routeId: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  riskScore: z.number().min(0).max(100).nullable(),
  riskStatus: z.enum(['measured', 'estimated', 'unknown']).default('unknown'),
  riskConfidence: z.number().min(0).max(1).default(0),
  riskScale: z
    .object({
      min: z.number().default(0),
      max: z.number().default(100),
      higherIsRiskier: z.boolean().default(true),
    })
    .default({ min: 0, max: 100, higherIsRiskier: true }),
  riskLabel: z.string().default('estimated_lower_risk'),
  riskExplanation: z.array(z.string()).default([]),
  solverStatus: z.string().default('FEASIBLE'),
  geometry: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
  warnings: z.array(z.string()).default([]),
});

const internalRouteResponseSchema = z.object({
  status: z.literal('success'),
  optimizerVersion: z.string().default('osrm-candidate-ranking-v1'),
  roadGraphVersion: z.string().default('configured-osrm'),
    riskModelVersion: z.string().default('corridor-report-risk-v1'),
  routes: z.array(internalRouteCandidateSchema).min(1),
});

export class RoutingService {
  /**
   * Request candidate routes and risk ranking from the internal Python service
   */
  async requestRoute(
    userId: string,
    params: {
      origin: LatLng;
      destination: LatLng;
      mode?: 'walking';
      priority?: 'fastest' | 'balanced' | 'lower_risk';
      maxDetourRatio?: number;
      departureTime?: string;
    }
  ): Promise<{
    routeRequestId: string;
    optimizerVersion: string;
    roadGraphVersion: string;
    riskModelVersion: string;
    routes: IRouteCandidate[];
    selectedRouteId: string;
  }> {
    // Validate coordinates within pilot bounding box
    validatePilotCoordinates(params.origin.latitude, params.origin.longitude, 'origin');
    validatePilotCoordinates(params.destination.latitude, params.destination.longitude, 'destination');

    const mode = params.mode || 'walking';
    const priority = params.priority || 'lower_risk';
    const maxDetourRatio = params.maxDetourRatio || 1.25;

    // Call internal Python FastAPI service
    // Only reports explicitly marked by a trusted moderation workflow may affect routing.
    // The current public submission path has no moderator endpoint, so ordinary user_report
    // rows remain pending and are intentionally excluded.
    const trustedReports = await ReportModel.find({
      moderationStatus: 'approved',
      source: 'moderated_user_report',
      observedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      expiresAt: { $gt: new Date() },
    }).select('category severity observedAt corroborationCount location').limit(200).lean();

    const pythonPayload = {
      requestId: `req_${Date.now()}`,
      origin: {
        type: 'Point',
        coordinates: [params.origin.longitude, params.origin.latitude],
      },
      destination: {
        type: 'Point',
        coordinates: [params.destination.longitude, params.destination.latitude],
      },
      mode,
      priority,
      maxDetourRatio,
      departureTime: params.departureTime || new Date().toISOString(),
      riskReports: trustedReports.map((report) => ({
        coordinates: report.location.coordinates,
        category: report.category,
        severity: report.severity,
        observedAt: report.observedAt.toISOString(),
        corroborationCount: report.corroborationCount,
      })),
    };

    let pythonResponseData: unknown;
    try {
      const response = await axios.post(
        `${env.PYTHON_ROUTING_URL}/internal/route/optimize`,
        pythonPayload,
        {
          timeout: env.PYTHON_SERVICE_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      pythonResponseData = response.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 422 || (err.response?.data && (err.response.data as { code?: string }).code === 'NO_FEASIBLE_ROUTE')) {
          throw AppError.noFeasibleRoute(
            (err.response?.data as { message?: string })?.message ||
              'No feasible route satisfies the constraints.'
          );
        }
        if (err.response?.status === 503 || err.response?.status === 504) {
          logger.warn('Configured routing provider unavailable', { status: err.response.status });
          throw AppError.intelligenceUnavailable('The configured routing provider is currently unavailable.');
        }
        if (!err.response) {
          logger.warn('Python routing service unavailable or timed out', { error: err.message });
          throw AppError.intelligenceUnavailable('Routing optimizer service is currently unreachable.');
        }
      }
      logger.error('Unexpected error from Python routing service', err);
      throw AppError.intelligenceError('Invalid response received from routing optimizer.');
    }

    // Validate Python response schema with Zod
    const parsed = internalRouteResponseSchema.safeParse(pythonResponseData);
    if (!parsed.success) {
      logger.error('Python routing service response validation failed', parsed.error);
      throw AppError.intelligenceError('Optimizer response failed contract validation or returned empty geometry.');
    }

    const { optimizerVersion, roadGraphVersion, riskModelVersion, routes } = parsed.data;

    // Select chosen route (candidate matching priority or first candidate)
    const selectedRouteId = routes[0]!.routeId;

    // Persist in RouteRequestModel with TTL (extended by navigation sessions)
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    const preferencesData: Record<string, unknown> = {
      mode,
      priority,
      maxDetourRatio,
    };
    if (params.departureTime) {
      preferencesData.departureTime = new Date(params.departureTime);
    }

    const routeRequest = await RouteRequestModel.create({
      userId,
      origin: {
        type: 'Point',
        coordinates: [params.origin.longitude, params.origin.latitude],
      },
      destination: {
        type: 'Point',
        coordinates: [params.destination.longitude, params.destination.latitude],
      },
      preferences: preferencesData,
      result: {
        status: 'success',
        routes,
        selectedRouteId,
      },
      versions: {
        optimizer: optimizerVersion,
        riskModel: riskModelVersion,
        roadGraph: roadGraphVersion,
      },
      expiresAt,
    });

    return {
      routeRequestId: (routeRequest as unknown as IRouteRequest)._id.toString(),
      optimizerVersion,
      roadGraphVersion,
      riskModelVersion,
      routes,
      selectedRouteId,
    };
  }

  /**
   * Get saved route request by ID with ownership check
   */
  async getRouteRequest(userId: string, routeRequestId: string): Promise<IRouteRequest> {
    const routeRequest = await RouteRequestModel.findOne({
      _id: routeRequestId,
      userId,
    });
    if (!routeRequest) {
      throw AppError.notFound('Route request not found or unauthorized');
    }
    return routeRequest;
  }
}

export const routingService = new RoutingService();
