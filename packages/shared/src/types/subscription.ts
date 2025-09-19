export interface Subscription {
  id: string;
  userId: string;
  tier: 'free' | 'premium' | 'enterprise';
  status: 'active' | 'cancelled' | 'expired';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}