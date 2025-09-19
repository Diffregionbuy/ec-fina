export interface BotInstance {
  id: string;
  userId: string;
  name: string;
  token: string;
  serverId: string;
  isActive: boolean;
  features: BotFeature[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BotFeature {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}