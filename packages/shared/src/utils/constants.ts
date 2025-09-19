export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
} as const;

export const BOT_FEATURES = {
  SERVER_STATUS: 'server_status',
  PLAYER_TRACKING: 'player_tracking',
  ECONOMY_INTEGRATION: 'economy_integration',
  CUSTOM_COMMANDS: 'custom_commands',
  MODERATION: 'moderation',
} as const;

export const API_ENDPOINTS = {
  AUTH: '/api/auth',
  USERS: '/api/users',
  BOTS: '/api/bots',
  SERVERS: '/api/servers',
  SUBSCRIPTIONS: '/api/subscriptions',
} as const;