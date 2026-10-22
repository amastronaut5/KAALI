import { Router } from 'express';
import { logout, requestOtp, verifyOtp } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter, otpDestinationRateLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import { requestOtpSchema, verifyOtpSchema } from '../validators/auth.validator.js';

const router = Router();

router.post('/otp', authRateLimiter, otpDestinationRateLimiter, validateBody(requestOtpSchema), requestOtp);
router.post('/verify', authRateLimiter, validateBody(verifyOtpSchema), verifyOtp);
router.post('/logout', requireAuth, logout);

export default router;
