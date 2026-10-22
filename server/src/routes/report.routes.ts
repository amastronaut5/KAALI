import { Router } from 'express';
import {
  confirmReport,
  createReport,
  getReports,
  retractReport,
} from '../controllers/report.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { reportRateLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  createReportSchema,
  reportBboxQuerySchema,
} from '../validators/report.validator.js';

const router = Router();

// Public query endpoint for map viewing
router.get('/', validateQuery(reportBboxQuerySchema), getReports);

// Protected endpoints
router.post(
  '/',
  requireAuth,
  reportRateLimiter,
  validateBody(createReportSchema),
  createReport
);
router.post('/:reportId/confirm', requireAuth, confirmReport);
router.post('/:reportId/retract', requireAuth, retractReport);

export default router;
