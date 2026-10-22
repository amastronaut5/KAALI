import { z } from 'zod';

export const requestOtpSchema = z.object({
  channel: z.enum(['phone', 'email']).default('phone'),
  destination: z
    .string()
    .min(5, 'Destination is too short')
    .max(100, 'Destination is too long')
    .transform((val) => val.trim()),
});

export const verifyOtpSchema = z.object({
  challengeId: z.string().min(1, 'Challenge ID is required'),
  code: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
  consent: z
    .object({
      locationSharing: z.boolean().optional(),
      evidenceStorage: z.boolean().optional(),
    })
    .optional(),
});
