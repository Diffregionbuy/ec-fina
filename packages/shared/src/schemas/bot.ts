import { z } from 'zod';

export const botFeatureSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  enabled: z.boolean(),
  config: z.record(z.any()),
});

export const botInstanceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  token: z.string(),
  serverId: z.string(),
  isActive: z.boolean(),
  features: z.array(botFeatureSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createBotInstanceSchema = botInstanceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateBotInstanceSchema = createBotInstanceSchema.partial();