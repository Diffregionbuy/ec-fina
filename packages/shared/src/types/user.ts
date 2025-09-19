export interface User {
  id: string;
  discordId: string;
  username: string;
  email?: string;
  avatar?: string;
  subscriptionTier: 'free' | 'premium' | 'enterprise';
  createdAt: Date;
  updatedAt: Date;
}