import { Router } from 'express';
import {
  createSos,
  getSos,
  notifyAgainSos,
  resolveSos,
  revokeSosShare,
  updateSosLocation,
} from '../controllers/sos.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { locationRateLimiter, sosRateLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import {
  createSosSchema,
  resolveSosSchema,
  updateSosLocationSchema,
} from '../validators/sos.validator.js';

const router = Router();

router.use(requireAuth);

router.post('/', sosRateLimiter, validateBody(createSosSchema), createSos);
router.post(
  '/:incidentId/location',
  locationRateLimiter,
  validateBody(updateSosLocationSchema),
  updateSosLocation
);
router.get('/:incidentId', getSos);
router.post('/:incidentId/resolve', validateBody(resolveSosSchema), resolveSos);
router.post('/:incidentId/share/revoke', revokeSosShare);
router.post('/:incidentId/notify-again', sosRateLimiter, notifyAgainSos);

export default router;
