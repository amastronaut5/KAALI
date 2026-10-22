import { Router } from 'express';
import { getShareView } from '../controllers/share.controller.js';
import { shareRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(shareRateLimiter);

// GET /api/v1/share (token in X-Share-Token header)
router.get('/', getShareView);

// GET /api/v1/share/:token (alias for backward compatibility)
router.get('/:token', getShareView);

export default router;
