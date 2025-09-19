import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  discordId: z.string(),
  username: z.string().min(1).max(32),
  email: z.string().email().optional(),
  avatar: z.string().url().optional(),
  subscriptionTier: z.enum(['free', 'premium', 'enterprise']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUserSchema = userSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserSchema = createUserSchema.partial();