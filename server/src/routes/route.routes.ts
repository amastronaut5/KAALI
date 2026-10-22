import { Router } from 'express';
import {
  createRoute,
  getRoute,
  submitRouteFeedback,
} from '../controllers/route.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createRouteSchema,
  routeFeedbackSchema,
} from '../validators/route.validator.js';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(createRouteSchema), createRoute);
router.get('/:routeRequestId', getRoute);
router.post(
  '/:routeRequestId/feedback',
  validateBody(routeFeedbackSchema),
  submitRouteFeedback
);

export default router;
