import { z } from 'zod';

export const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  phoneE164: z.string().min(8, 'Phone number is too short').max(20),
  email: z.string().email().optional(),
  relationship: z.string().max(50).optional(),
  channels: z.array(z.enum(['sms', 'whatsapp', 'email'])).default(['sms']),
  priority: z.number().int().min(1).max(10).default(1),
});

export const acceptContactSchema = z.object({
  invitationToken: z.string().min(1, 'Invitation token is required'),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phoneE164: z.string().min(8).max(20).optional(),
  email: z.string().email().optional(),
  relationship: z.string().max(50).optional(),
  channels: z.array(z.enum(['sms', 'whatsapp', 'email'])).optional(),
  priority: z.number().int().min(1).max(10).optional(),
});
