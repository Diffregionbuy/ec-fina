import { z } from 'zod';

export const minecraftServerSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  version: z.string(),
  playerCount: z.number().int().min(0),
  maxPlayers: z.number().int().min(0),
  isOnline: z.boolean(),
  lastPing: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createMinecraftServerSchema = minecraftServerSchema.omit({
  id: true,
  playerCount: true,
  isOnline: true,
  lastPing: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMinecraftServerSchema = createMinecraftServerSchema.partial();