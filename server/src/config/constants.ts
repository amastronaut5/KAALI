export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  NO_FEASIBLE_ROUTE: 'NO_FEASIBLE_ROUTE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTELLIGENCE_SERVICE_ERROR: 'INTELLIGENCE_SERVICE_ERROR',
  INTELLIGENCE_UNAVAILABLE: 'INTELLIGENCE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export const CANONICAL_ENUMS = {
  routePriority: ['fastest', 'balanced', 'lower_risk'] as const,
  routeMode: ['walking'] as const,
  rerouteReason: ['route_deviation', 'reported_hazard', 'route_blocked', 'user_requested'] as const,
  navigationFinishReason: ['arrived', 'stopped', 'cancelled'] as const,
  navigationStatus: ['active', 'completed', 'cancelled', 'expired'] as const,
  navigationEndReason: ['arrived', 'stopped', 'cancelled', 'expired'] as const,
  sosStatus: ['active', 'resolved', 'cancelled', 'expired'] as const,
  sosResolution: ['resolved', 'cancelled', 'false_alarm'] as const,
  contactStatus: ['pending', 'accepted', 'declined', 'revoked'] as const,
  detectionResultLabel: ['manipulation_suspected', 'no_manipulation_detected', 'uncertain'] as const,
  notificationDeliveryStatus: ['queued', 'accepted', 'delivered', 'failed', 'unknown'] as const,
  caseStatus: ['draft', 'evidence_saved', 'notice_prepared', 'submitted_by_user', 'response_received', 'closed'] as const,
  reportCategory: ['poor_lighting', 'isolated_area', 'blocked_road', 'harassment_report', 'flooding', 'other'] as const,
  reportSeverity: ['low', 'medium', 'high'] as const,
  reportModerationStatus: ['pending', 'approved', 'rejected', 'retracted'] as const,
} as const;
