const API_BASE = '/api/backend';

export interface StripePaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'us_bank_account';
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  us_bank_account?: {
    account_type: string;
    bank_name: string;
    last4: string;
    routing_number: string;
  };
  created: number;
  customer: string;
}

export interface StripeWithdrawal {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
  arrival_date: number;
  method: StripePaymentMethod;
  fee: number;
  created: number;
}

export interface CreateWithdrawalRequest {
  amount: number;
  currency: string;
  payment_method_id: string;
  description?: string;
}

class StripeApiService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  // Cache management
  private setCache(key: string, data: any, ttlMs: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  private getCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  // Get user's payment methods
  async getPaymentMethods(): Promise<StripePaymentMethod[]> {
    const cacheKey = 'stripe-payment-methods';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${API_BASE}/stripe/payment-methods`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch payment methods: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch payment methods');
      }

      const paymentMethods = data.data || [];
      
      // Cache for 5 minutes
      this.setCache(cacheKey, paymentMethods, 5 * 60 * 1000);
      
      return paymentMethods;
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      return [];
    }
  }

  // Create a new payment method setup intent
  async createSetupIntent(): Promise<{ client_secret: string }> {
    try {
      const response = await fetch(`${API_BASE}/stripe/setup-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to create setup intent: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to create setup intent');
      }

      return data.data;
    } catch (error) {
      console.error('Failed to create setup intent:', error);
      throw error;
    }
  }

  // Create a withdrawal
  async createWithdrawal(request: CreateWithdrawalRequest): Promise<StripeWithdrawal> {
    try {
      const response = await fetch(`${API_BASE}/stripe/withdrawals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to create withdrawal: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to create withdrawal');
      }

      // Clear payment methods cache to refresh data
      this.cache.delete('stripe-payment-methods');
      
      return data.data;
    } catch (error) {
      console.error('Failed to create withdrawal:', error);
      throw error;
    }
  }

  // Get withdrawal history
  async getWithdrawals(limit: number = 10): Promise<StripeWithdrawal[]> {
    const cacheKey = `stripe-withdrawals-${limit}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${API_BASE}/stripe/withdrawals?limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch withdrawals: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch withdrawals');
      }

      const withdrawals = data.data || [];
      
      // Cache for 2 minutes
      this.setCache(cacheKey, withdrawals, 2 * 60 * 1000);
      
      return withdrawals;
    } catch (error) {
      console.error('Failed to fetch withdrawals:', error);
      return [];
    }
  }

  // Delete a payment method
  async deletePaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/stripe/payment-methods/${paymentMethodId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete payment method: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to delete payment method');
      }

      // Clear cache to refresh data
      this.cache.delete('stripe-payment-methods');
    } catch (error) {
      console.error('Failed to delete payment method:', error);
      throw error;
    }
  }

  // Get withdrawal fees
  getWithdrawalFee(amount: number, paymentMethod: StripePaymentMethod): { fee: number; total: number } {
    let feeRate = 0;
    let fixedFee = 0;

    switch (paymentMethod.type) {
      case 'card':
        feeRate = 0.025; // 2.5% for cards
        break;
      case 'us_bank_account':
      case 'bank_account':
        fixedFee = 2.50; // $2.50 for bank transfers
        break;
      default:
        feeRate = 0.015; // 1.5% default
    }

    const fee = Math.max(amount * feeRate, fixedFee);
    const total = amount - fee;

    return { fee, total };
  }

  // Format payment method for display
  formatPaymentMethod(method: StripePaymentMethod): string {
    switch (method.type) {
      case 'card':
        return `${method.card?.brand?.toUpperCase()} •••• ${method.card?.last4}`;
      case 'us_bank_account':
      case 'bank_account':
        return `${method.us_bank_account?.bank_name} •••• ${method.us_bank_account?.last4}`;
      default:
        return 'Payment Method';
    }
  }

  // Get processing time for payment method
  getProcessingTime(method: StripePaymentMethod): string {
    switch (method.type) {
      case 'card':
        return 'Instant';
      case 'us_bank_account':
      case 'bank_account':
        return '1-3 business days';
      default:
        return '1-2 business days';
    }
  }
}

export const stripeApiService = new StripeApiService();