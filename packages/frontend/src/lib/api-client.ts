import { getSession, signOut } from 'next-auth/react';

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

interface SubscriptionData {
  subscription: any;
  currentPlan: any;
  isActive: boolean;
  isTrial: boolean;
}

interface SubscriptionPlansData {
  plans: any[];
}

interface FeatureUsageData {
  usage: any[];
}

// Custom error classes
export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class AuthenticationError extends ApiClientError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiClientError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends ApiClientError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends ApiClientError {
  constructor(message: string = 'Network request failed') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

// Enhanced in-memory cache with request deduplication
class ApiCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private pendingRequests = new Map<string, Promise<any>>();

  set(key: string, data: any, ttlMs: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string) {
    this.cache.delete(key);
    this.pendingRequests.delete(key);
  }

  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  // Generate cache key from endpoint and params
  generateKey(endpoint: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    return `${endpoint}${paramString}`;
  }

  // Request deduplication
  setPendingRequest(key: string, promise: Promise<any>): void {
    this.pendingRequests.set(key, promise);
    // Clean up after request completes
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });
  }

  getPendingRequest(key: string): Promise<any> | null {
    return this.pendingRequests.get(key) || null;
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

class ApiClient {
  private baseUrl: string;
  private cache: ApiCache;
  private refreshPromise: Promise<void> | null = null;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Use the proxied backend API route
    this.baseUrl = '/api/backend';
    this.cache = new ApiCache();
    
    // Set up periodic cache cleanup
    this.cleanupInterval = setInterval(() => {
      this.cache.cleanup();
    }, 5 * 60 * 1000); // Clean every 5 minutes
  }

  // Cleanup method for proper resource management
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Since we're using the API proxy (/api/backend), authentication is handled server-side
    // The proxy will automatically add the correct authentication headers to backend requests
    // We just need to ensure the user has a valid session
    const session = await getSession();

    if (!session?.user) {
      throw new AuthenticationError('No valid session available');
    }

    return {
      'Content-Type': 'application/json',
    };
  }

  private async refreshToken(): Promise<void> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        // When using the API proxy, token refresh is handled automatically by NextAuth
        // We just need to check if the session is still valid
        const session = await getSession();

        if (!session?.user) {
          throw new AuthenticationError('Session expired');
        }

        // Clear cache since user context might have changed
        this.cache.clear();
      } catch (error) {
        // If session is invalid, sign out the user
        await signOut({ redirect: false });
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useCache: boolean = false,
    cacheTtl: number = 5 * 60 * 1000
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = this.cache.generateKey(endpoint, options.body ? JSON.parse(options.body as string) : undefined);

    // Check cache for GET requests
    if (useCache && (!options.method || options.method === 'GET')) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Check for pending request to avoid duplicates
      const pendingRequest = this.cache.getPendingRequest(cacheKey);
      if (pendingRequest) {
        return await pendingRequest;
      }
    }

    const requestPromise = this.executeRequest<T>(url, options, cacheKey, useCache, cacheTtl);
    
    // Store pending request for deduplication
    if (useCache && (!options.method || options.method === 'GET')) {
      this.cache.setPendingRequest(cacheKey, requestPromise);
    }

    return requestPromise;
  }

  private async executeRequest<T>(
    url: string,
    options: RequestInit,
    cacheKey: string,
    useCache: boolean,
    cacheTtl: number
  ): Promise<T> {
    let attempt = 0;
    const maxRetries = 2;

    while (attempt <= maxRetries) {
      try {
        const headers = await this.getAuthHeaders();

        const response = await fetch(url, {
          ...options,
          headers: {
            ...headers,
            ...options.headers,
          },
        });

        if (response.status === 401 && attempt < maxRetries) {
          // Token might be expired, try to refresh
          await this.refreshToken();
          attempt++;
          continue;
        }

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        // Check if response has content before parsing JSON
        const contentType = response.headers.get('content-type');
        const hasJsonContent = contentType && contentType.includes('application/json');
        
        let data;
        if (hasJsonContent) {
          const text = await response.text();
          if (text.trim()) {
            try {
              data = JSON.parse(text);
            } catch (error) {
              throw new ApiClientError(
                'Invalid JSON response from server',
                'INVALID_JSON_RESPONSE'
              );
            }
          } else {
            // Empty response, return success indicator
            data = { success: true };
          }
        } else {
          // Non-JSON response
          data = { success: true };
        }

        // Cache successful GET requests
        if (useCache && (!options.method || options.method === 'GET')) {
          this.cache.set(cacheKey, data, cacheTtl);
        }

        return data;
      } catch (error) {
        if (error instanceof ApiClientError) {
          throw error;
        }

        if (attempt === maxRetries) {
          if (error instanceof TypeError && error.message && error.message.includes('fetch')) {
            throw new NetworkError('Unable to connect to server. Please check your internet connection.');
          }
          throw new ApiClientError(
            error instanceof Error ? error.message : 'Unknown error occurred',
            'UNKNOWN_ERROR'
          );
        }

        attempt++;
        // Add exponential backoff for retries
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new ApiClientError('Max retries exceeded', 'MAX_RETRIES_EXCEEDED');
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: any;

    try {
      const text = await response.text();
      if (text.trim()) {
        errorData = JSON.parse(text);
      } else {
        errorData = { message: `HTTP ${response.status} - No error details provided` };
      }
    } catch {
      errorData = { message: 'Unknown error occurred' };
    }

    const message = errorData.error?.message || errorData.message || `HTTP ${response.status}`;
    const code = errorData.error?.code || 'HTTP_ERROR';
    const details = errorData.error?.details || errorData.details;

    switch (response.status) {
      case 400:
        throw new ValidationError(message, details);
      case 401:
        throw new AuthenticationError(message);
      case 403:
        throw new AuthorizationError(message);
      case 404:
        throw new ApiClientError(message, 'NOT_FOUND', 404);
      case 429:
        throw new ApiClientError(message, 'RATE_LIMITED', 429);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ApiClientError(
          'Server error occurred. Please try again later.',
          'SERVER_ERROR',
          response.status
        );
      default:
        throw new ApiClientError(message, code, response.status, details);
    }
  }

  // Cache management methods
  public clearCache(): void {
    this.cache.clear();
  }

  public deleteCacheKey(endpoint: string, params?: Record<string, any>): void {
    const key = this.cache.generateKey(endpoint, params);
    this.cache.delete(key);
  }

  // User endpoints
  async getUserProfile() {
    return this.request('/users/profile', {}, true, 10 * 60 * 1000); // Cache for 10 minutes
  }

  async updateUserProfile(data: any) {
    const result = await this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    // Invalidate profile cache
    this.deleteCacheKey('/users/profile');

    return result;
  }

  async getUserServers() {
    return this.request('/users/servers', {}, true, 5 * 60 * 1000); // Cache for 5 minutes
  }

  async getUserServersWithRetry() {
    // Enhanced version with built-in retry logic for Discord API calls
    let lastError: any;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.request('/users/servers', {}, true, 5 * 60 * 1000);
        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (error instanceof ApiClientError) {
          const isRetryable = error.status === 503 || error.status === 502 ||
            error.status === 504 || error.code === 'NETWORK_ERROR';

          if (!isRetryable || attempt === maxRetries - 1) {
            throw error;
          }

          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async setupServer(serverId: string, botConfig: any = {}) {
    const result = await this.request(`/users/servers/${serverId}/setup`, {
      method: 'POST',
      body: JSON.stringify({ botConfig }),
    });

    // Invalidate related cache entries
    this.deleteCacheKey('/users/servers');
    this.deleteCacheKey(`/servers/${serverId}`);

    return result;
  }

  // Server endpoints
  async getServer(serverId: string) {
    return this.request(`/servers/${serverId}`, {}, true, 5 * 60 * 1000);
  }

  async updateServer(serverId: string, data: any) {
    const result = await this.request(`/servers/${serverId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    // Invalidate related cache entries
    this.deleteCacheKey(`/servers/${serverId}`);
    this.deleteCacheKey('/users/servers');

    return result;
  }

  async getServerStats(serverId: string) {
    return this.request(`/servers/${serverId}/stats`, {}, true, 2 * 60 * 1000); // Cache for 2 minutes
  }

  async getServerChannels(serverId: string) {
    return this.request(`/servers/${serverId}/channels`, {}, true, 5 * 60 * 1000); // Cache for 5 minutes
  }

  async testDiscordConnection(serverId: string) {
    return this.request(`/servers/${serverId}/discord-test`, {}, false); // Don't cache test results
  }

  async getBotStatus(serverId: string) {
    return this.request(`/servers/${serverId}/bot-status`, {}, true, 10 * 1000); // Cache for 10 seconds
  }

  // Bot configuration endpoints
  async getBotConfig(serverId: string) {
    return this.request(`/servers/${serverId}/bot-config`, {}, true, 5 * 60 * 1000);
  }

  async updateBotConfig(serverId: string, config: any) {
    const result = await this.request(`/servers/${serverId}/bot-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });

    // Invalidate bot config cache
    this.deleteCacheKey(`/servers/${serverId}/bot-config`);

    return result;
  }

  // Product endpoints
  async getProducts(serverId: string) {
    const response = await this.request(`/products?server_id=${serverId}`, {}, true, 3 * 60 * 1000);
    // Extract products array from API response format: { success: true, data: { products: [...] } }
    return (response as any)?.data?.products || response;
  }

  async createProduct(data: any) {
    const result = await this.request('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Invalidate products cache
    this.deleteCacheKey(`/products?server_id=${data.server_id}`);

    return result;
  }

  async updateProduct(productId: string, data: any) {
    const result = await this.request(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    // Invalidate products cache
    this.deleteCacheKey(`/products?server_id=${data.server_id}`);

    return result;
  }

  async deleteProduct(productId: string, serverId?: string) {
    const result = await this.request(`/products/${productId}`, {
      method: 'DELETE',
    });

    // Invalidate products cache if serverId provided
    if (serverId) {
      this.deleteCacheKey(`/products?server_id=${serverId}`);
    }

    return result;
  }

  async bulkDeleteProducts(productIds: string[], serverId: string) {
    const result = await this.request('/products/bulk', {
      method: 'DELETE',
      body: JSON.stringify({
        product_ids: productIds,
        server_id: serverId,
      }),
    });

    // Invalidate products cache
    this.deleteCacheKey(`/products?server_id=${serverId}`);

    return result;
  }

  // Category endpoints
  async getCategories(serverId: string) {
    const response = await this.request(`/categories?server_id=${serverId}`, {}, true, 5 * 60 * 1000);
    // Extract categories array from API response format: { success: true, data: { categories: [...] } }
    return (response as any)?.data?.categories || response;
  }

  async createCategory(data: any) {
    const result = await this.request('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Invalidate categories cache
    this.deleteCacheKey(`/categories?server_id=${data.server_id}`);

    return result;
  }

  async deleteCategory(categoryId: string, serverId?: string) {
    const result = await this.request(`/categories/${categoryId}`, {
      method: 'DELETE',
    });

    // Always invalidate caches when deleting a category
    if (serverId) {
      this.deleteCacheKey(`/categories?server_id=${serverId}`);
      this.deleteCacheKey(`/products?server_id=${serverId}`); // Products might reference categories
    }
    
    // Clear entire cache as a safety measure to ensure consistency
    // This is more aggressive but safer than iterating over keys
    try {
      this.cache.clear();
      console.log('Cache cleared after category deletion');
    } catch (error) {
      console.warn('Cache clearing error:', error);
    }

    return result;
  }

  // Wallet endpoints
  async getWalletBalance() {
    return this.request('/wallet/balance', {}, true, 30 * 1000); // Cache for 30 seconds
  }

  async getWalletAddresses() {
    return this.request('/wallet/addresses', {}, true, 60 * 1000); // Cache for 1 minute - account-based, not server-based
  }

  async getTransactions() {
    return this.request('/wallet/transactions', {}, true, 60 * 1000); // Cache for 1 minute
  }

  async setupWallet(data: { wallet_address: string; ccy: string; chain: string; tag?: string }) {
    const result = await this.request('/wallet/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Invalidate wallet-related cache
    this.deleteCacheKey('/wallet/balance');

    return result;
  }

  async requestWithdrawal(amount: number, address: string) {
    const result = await this.request('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, address }),
    });

    // Invalidate wallet-related cache
    this.deleteCacheKey('/wallet/balance');
    this.deleteCacheKey('/wallet/transactions');

    return result;
  }

  async updateWalletConfig(config: { okx_wallet_address?: string | null }) {
    const result = await this.request('/wallet/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });

    // Invalidate wallet balance cache
    this.deleteCacheKey('/wallet/balance');

    return result;
  }

  // User wallet custody mode
  async getWalletMode(): Promise<{ success: boolean; data: { mode: 'non_custody' | 'custody' } }> {
    return this.request('/users/wallet-mode', {}, true, 5 * 60 * 1000);
  }

  async setWalletMode(mode: 'non_custody' | 'custody'): Promise<{ success: boolean; data: { mode: string } }> {
    // Invalidate cached mode on change
    const result = await this.request('/users/wallet-mode', {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    });
    this.deleteCacheKey('/users/wallet-mode');
    return result;
  }

  // Subscription endpoints
  async getSubscriptionPlans(): Promise<ApiResponse<SubscriptionPlansData>> {
    return this.request<ApiResponse<SubscriptionPlansData>>('/subscriptions/plans', {}, true, 10 * 60 * 1000);
  }

  async getCurrentSubscription(serverId: string): Promise<ApiResponse<SubscriptionData>> {
    return this.request<ApiResponse<SubscriptionData>>(`/subscriptions/current?server_id=${serverId}`, {}, true, 60 * 1000);
  }

  async subscribe(serverId: string, planId: string, paymentMethod: string): Promise<ApiResponse<any>> {
    const result = await this.request<ApiResponse<any>>('/subscriptions/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
        plan_id: planId,
        payment_method: paymentMethod,
      }),
    });

    // Invalidate subscription-related cache
    this.deleteCacheKey(`/subscriptions/current?server_id=${serverId}`);
    this.deleteCacheKey(`/subscriptions/usage?server_id=${serverId}`);

    return result;
  }

  async cancelSubscription(serverId: string, cancelAtPeriodEnd: boolean = true): Promise<ApiResponse<any>> {
    const result = await this.request<ApiResponse<any>>('/subscriptions/cancel', {
      method: 'PUT',
      body: JSON.stringify({
        server_id: serverId,
        cancel_at_period_end: cancelAtPeriodEnd,
      }),
    });

    // Invalidate subscription cache
    this.deleteCacheKey(`/subscriptions/current?server_id=${serverId}`);

    return result;
  }

  async reactivateSubscription(serverId: string): Promise<ApiResponse<any>> {
    const result = await this.request<ApiResponse<any>>('/subscriptions/reactivate', {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
      }),
    });

    // Invalidate subscription cache
    this.deleteCacheKey(`/subscriptions/current?server_id=${serverId}`);

    return result;
  }

  async getFeatureUsage(serverId: string): Promise<ApiResponse<FeatureUsageData>> {
    return this.request<ApiResponse<FeatureUsageData>>(`/subscriptions/usage?server_id=${serverId}`, {}, true, 60 * 1000);
  }

  async checkFeatureAccess(serverId: string, featureKey: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/subscriptions/features/${featureKey}/check?server_id=${serverId}`, {}, true, 5 * 60 * 1000);
  }
}

export const apiClient = new ApiClient();
