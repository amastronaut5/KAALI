import { Router } from 'express';
import {
  acceptContact,
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from '../controllers/contact.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import {
  acceptContactSchema,
  createContactSchema,
  updateContactSchema,
} from '../validators/contact.validator.js';

const router = Router();

// Accept invitation: unauthenticated, token-authorized with rate limiting
router.post(
  '/:contactId/accept',
  authRateLimiter,
  validateBody(acceptContactSchema),
  acceptContact
);

// Protected routes (require user session)
router.use(requireAuth);

router.get('/', listContacts);
router.post('/', validateBody(createContactSchema), createContact);
router.patch('/:contactId', validateBody(updateContactSchema), updateContact);
router.delete('/:contactId', deleteContact);

export default router;
