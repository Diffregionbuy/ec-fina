export interface MinecraftServer {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  version: string;
  playerCount: number;
  maxPlayers: number;
  isOnline: boolean;
  lastPing: Date;
  createdAt: Date;
  updatedAt: Date;
}