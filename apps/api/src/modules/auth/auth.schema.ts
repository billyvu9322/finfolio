import { z } from 'zod';

// FR-AUTH-01: password >= 8 chars, with uppercase + number.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(120).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  currency: z.enum(['VND', 'USD']),
  timezone: z.string(),
  createdAt: z.date(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userPublicSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type UserPublic = z.infer<typeof userPublicSchema>;
