import { Router } from 'express';
import {
  finishNavigation,
  getActiveNavigation,
  getNavigationSession,
  rerouteNavigation,
  startNavigation,
  submitNavigationLocation,
  updateNavigationSharing,
} from '../controllers/navigation.controller.js';
import { requireAuth } from '../middleware/auth.js';
import {
  locationRateLimiter,
  rerouteRateLimiter,
} from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import {
  finishNavigationSchema,
  rerouteSchema,
  startNavigationSchema,
  updateNavigationLocationSchema,
  updateSharingSchema,
} from '../validators/navigation.validator.js';

const router = Router();

router.use(requireAuth);

router.post('/sessions', validateBody(startNavigationSchema), startNavigation);
router.get('/sessions/active', getActiveNavigation);
router.get('/sessions/:sessionId', getNavigationSession);
router.post(
  '/sessions/:sessionId/location',
  locationRateLimiter,
  validateBody(updateNavigationLocationSchema),
  submitNavigationLocation
);
router.post(
  '/sessions/:sessionId/reroute',
  rerouteRateLimiter,
  validateBody(rerouteSchema),
  rerouteNavigation
);
router.patch(
  '/sessions/:sessionId/sharing',
  validateBody(updateSharingSchema),
  updateNavigationSharing
);
router.post(
  '/sessions/:sessionId/finish',
  validateBody(finishNavigationSchema),
  finishNavigation
);

export default router;
