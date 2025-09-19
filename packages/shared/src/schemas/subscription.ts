import { z } from 'zod';

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tier: z.enum(['free', 'premium', 'enterprise']),
  status: z.enum(['active', 'cancelled', 'expired']),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSubscriptionSchema = subscriptionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSubscriptionSchema = createSubscriptionSchema.partial();