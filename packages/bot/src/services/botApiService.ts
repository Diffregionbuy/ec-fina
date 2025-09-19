import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { apiLogger, logApiCall } from '../utils/logger';
import {
  ApiResponse,
  AuthResponse,
  ServerTemplate,
  Product,
  Category,
  PaymentOrder,
  MinecraftAccount,
  PaymentRequest,
  PaymentResponse
} from '../types';

export class BotApiService {
  private static instance: BotApiService;
  private axiosInstance: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly baseURL: string;
  private readonly botToken: string;

  private constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
    this.botToken = process.env.DISCORD_BOT_SERVICE_TOKEN || '';

    if (!this.botToken) {
      // Keep strict behavior as before
      throw new Error('DISCORD_BOT_SERVICE_TOKEN is required');
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ECBot-Discord/1.0.0'
      }
    });

    // Request interceptor: ensure auth
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        await this.ensureAuthenticated();
        if (this.authToken) {
          (config.headers as any).Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => {
        apiLogger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor: handle 401 once
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config;
        if (error.response?.status === 401) {
          this.authToken = null;
          this.tokenExpiresAt = 0;

          if (original && !(original as any)._retry) {
            (original as any)._retry = true;
            await this.ensureAuthenticated();
            if (this.authToken) {
              original.headers = original.headers || {};
              (original.headers as any).Authorization = `Bearer ${this.authToken}`;
              return this.axiosInstance.request(original);
            }
          }
        }

        const url = error.config?.url as string | undefined;
        const status = error.response?.status as number | undefined;
        const isExpected404 =
          status === 404 &&
          typeof url === 'string' &&
          (url.includes('/api/bot-service/templates/') ||
            url.includes('/api/bot-service/products/') ||
            url.includes('/api/bot-service/categories/'));
        if (!isExpected404) {
          apiLogger.error('API request failed:', {
            url,
            method: error.config?.method,
            status,
            message: error.response?.data?.message || error.message
          });
        }

        return Promise.reject(error);
      }
    );
  }

  // Singleton
  public static getInstance(): BotApiService {
    if (!BotApiService.instance) {
      BotApiService.instance = new BotApiService();
    }
    return BotApiService.instance;
  }

  // Ensure token valid
  private async ensureAuthenticated(): Promise<void> {
    if (!this.authToken || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  // Auth with backend (resilient with retry/backoff + timeout)
  public async authenticate(maxAttempts: number = 5): Promise<void> {
    let lastErr: any = null;
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
      const startTime = Date.now();
      try {
        const response: AxiosResponse<ApiResponse<AuthResponse>> = await axios.post(
          `${this.baseURL}/api/bot-service/auth`,
          {
            service: 'discord_bot',
            permissions: [
              'read_templates',
              'read_products',
              'read_categories',
              'create_payments',
              'webhook_access',
              'read_bot_config',
              'read_orders',
              'update_order_status'
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Bot-Token': this.botToken
            },
            timeout: 4000
          }
        );

        if (response.data.success && response.data.data) {
          this.authToken = response.data.data.token;
          this.tokenExpiresAt = Date.now() + response.data.data.expiresIn * 1000 - 60000; // 1 min buffer
          logApiCall('/api/bot-service/auth', 'POST', true, Date.now() - startTime);
          apiLogger.info('Successfully authenticated with backend API');
          return;
        }
        throw new Error(response.data.error || 'Authentication failed');
      } catch (error: any) {
        lastErr = error;
        logApiCall('/api/bot-service/auth', 'POST', false, Date.now() - startTime, error);
        // Retry on network/transient errors
        if (attempt < maxAttempts) {
          const delay = Math.min(5000, 500 * Math.pow(2, attempt - 1));
          try { await new Promise(res => setTimeout(res, delay)); } catch {}
          continue;
        }
      }
    }
    throw new Error(`Authentication failed after retries: ${lastErr?.message || 'unknown error'}`);
  }

  // Health check (absolute)
  public async checkHealth(): Promise<{ success: boolean; responseTime?: number }> {
    const start = Date.now();
    try {
      const res = await this.axiosInstance.get(`${this.baseURL}/api/bot-service/health`);
      return { success: res.status === 200, responseTime: Date.now() - start };
    } catch {
      return { success: false, responseTime: Date.now() - start };
    }
  }

  // Fee estimate (short timeout to keep Discord acks under ~3s)
  public async getFeeEstimate(
    params: { coin: string; network: string; txType?: string; amount?: number },
    timeoutMs = 2000
  ): Promise<{ feeNative: number; feeUnit: string; source: string; ttl: number } | null> {
    try {
      // Debug outgoing fee request
      try { console.log('[botApi] fee_estimate.request', { baseURL: this.baseURL, params, timeoutMs }); } catch {}
      const res: AxiosResponse<any> = await this.axiosInstance.get('/api/fees/estimate', {
        params: {
          coin: String(params.coin || '').toUpperCase(),
          network: String(params.network || '').toLowerCase(),
          ...(params.txType ? { txType: String(params.txType) } : {}),
          ...(params.amount !== undefined ? { amount: String(params.amount) } : {})
        },
        timeout: Math.max(200, Math.min(6000, timeoutMs))
      });
      const data = res.data?.data;
      // Debug response summary
      try {
        console.log('[botApi] fee_estimate.response', {
          status: res.status,
          url: `${this.baseURL}/api/fees/estimate`,
          success: res.data?.success,
          source: data?.source,
          feeNative: data?.feeNative,
          feeUnit: data?.feeUnit,
          chain: data?.chain
        });
      } catch {}
      if (data && typeof data.feeNative === 'number' && typeof data.feeUnit === 'string') {
        return {
          feeNative: data.feeNative,
          feeUnit: data.feeUnit,
          source: data.source || 'okx',
          ttl: data.ttl ?? 0
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Fetch templates (absolute)
  public async fetchTemplates(serverId: string): Promise<ServerTemplate[]> {
    const res: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
      `${this.baseURL}/api/bot-service/templates/${serverId}`
    );
    if (!res.data.success || !res.data.data) throw new Error((res.data as any).error || 'Failed to fetch templates');
    const tmplMap = (res.data.data as any).templates || {};
    return Array.isArray(tmplMap) ? tmplMap : Object.values(tmplMap);
  }

  // Products (absolute)
  public async getProducts(serverId: string): Promise<Product[]> {
    const res: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
      `${this.baseURL}/api/bot-service/products/${serverId}`
    );
    if (!res.data.success || !res.data.data) throw new Error((res.data as any).error || 'Failed to fetch products');
    return (res.data.data as any)?.products || [];
  }

  // Categories (absolute)
  public async getCategories(serverId: string): Promise<Category[]> {
    const res: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
      `${this.baseURL}/api/bot-service/categories/${serverId}`
    );
    if (!res.data.success || !res.data.data) throw new Error((res.data as any).error || 'Failed to fetch categories');
    return (res.data.data as any)?.categories || [];
  }

  // Minecraft link status
  public async getMinecraftLinkStatus(
    serverId: string,
    userId: string
  ): Promise<ApiResponse<{ linked: boolean; minecraft_username?: string; linked_at?: string }>> {
    const res: AxiosResponse<ApiResponse<{ linked: boolean; minecraft_username?: string; linked_at?: string }>> =
      await this.axiosInstance.get(`${this.baseURL}/api/bot-service/minecraft/${serverId}/${userId}`);
    return res.data;
  }

  // Server templates (proxied)
  public async getServerTemplates(serverId: string): Promise<ServerTemplate[]> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
        `/api/bot-service/templates/${serverId}`
      );
      logApiCall(`/api/bot-service/templates/${serverId}`, 'GET', true, Date.now() - startTime);
      const data = (response.data as any)?.data || {};
      if (data && data.isConfigured === false) {
        const err: any = new Error('BOT_NOT_CONFIGURED');
        err.code = 'BOT_NOT_CONFIGURED';
        err.userMessage = 'Go to http://localhost:3000/ to set the bot';
        throw err;
      }
      const tmplMap = data?.templates || {};
      return Array.isArray(tmplMap) ? tmplMap : Object.values(tmplMap);
    } catch (error: any) {
      logApiCall(`/api/bot-service/templates/${serverId}`, 'GET', false, Date.now() - startTime, error);
      if (error?.response?.status === 404) return [];
      throw error;
    }
  }

  // Templates with settings
  public async getServerTemplatesWithSettings(
    serverId: string
  ): Promise<{ templates: ServerTemplate[]; settings?: any; product_display_settings?: any; isConfigured?: boolean }> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
        `/api/bot-service/templates/${serverId}`
      );
      logApiCall(`/api/bot-service/templates/${serverId}`, 'GET', true, Date.now() - startTime);
      const data = (response.data as any)?.data || {};
      if (data && data.isConfigured === false) {
        const err: any = new Error('BOT_NOT_CONFIGURED');
        err.code = 'BOT_NOT_CONFIGURED';
        err.userMessage = 'Go to http://localhost:3000/ to set the bot';
        throw err;
      }
      const tmplMap = data?.templates || {};
      const templates = Array.isArray(tmplMap) ? tmplMap : Object.values(tmplMap);
      return {
        templates,
        settings: data?.settings || {},
        product_display_settings: data?.product_display_settings || null,
        isConfigured: data?.isConfigured
      };
    } catch (error: any) {
      logApiCall(`/api/bot-service/templates/${serverId}`, 'GET', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Server products (proxied)
  public async getServerProducts(serverId: string): Promise<Product[]> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
        `/api/bot-service/products/${serverId}`
      );
      logApiCall(`/api/bot-service/products/${serverId}`, 'GET', true, Date.now() - startTime);
      return (response.data.data as any)?.products || [];
    } catch (error: any) {
      logApiCall(`/api/bot-service/products/${serverId}`, 'GET', false, Date.now() - startTime, error);
      if (error?.response?.status === 404) return [];
      throw error;
    }
  }

  // Server categories (proxied)
  public async getServerCategories(serverId: string): Promise<Category[]> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get(
        `/api/bot-service/categories/${serverId}`
      );
      logApiCall(`/api/bot-service/categories/${serverId}`, 'GET', true, Date.now() - startTime);
      return (response.data.data as any)?.categories || [];
    } catch (error: any) {
      logApiCall(`/api/bot-service/categories/${serverId}`, 'GET', false, Date.now() - startTime, error);
      if (error?.response?.status === 404) return [];
      throw error;
    }
  }

  // Create payment order
  public async createPaymentOrder(paymentRequest: PaymentRequest): Promise<PaymentResponse> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<PaymentResponse>> = await this.axiosInstance.post(
        '/api/bot-service/orders',
        paymentRequest
      );
      logApiCall('/api/bot-service/orders', 'POST', true, Date.now() - startTime);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Failed to create payment order');
      }
      return response.data.data;
    } catch (error: any) {
      logApiCall('/api/bot-service/orders', 'POST', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Payment order status
  public async getPaymentOrderStatus(orderId: string): Promise<PaymentOrder> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<PaymentOrder>> = await this.axiosInstance.get(
        `/api/bot-service/orders/${orderId}`
      );
      logApiCall(`/api/bot-service/orders/${orderId}`, 'GET', true, Date.now() - startTime);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Order not found');
      }
      return response.data.data;
    } catch (error: any) {
      logApiCall(`/api/bot-service/orders/${orderId}`, 'GET', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Manual payment status check
  public async checkPaymentStatus(orderId: string): Promise<{
    status: string;
    expectedAmount: number;
    receivedAmount: number;
    address?: string;
    transactionHash?: string;
    currency?: string;
  }> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.post(
        `/api/bot-service/payments/${orderId}/check`
      );
      logApiCall(`/api/bot-service/payments/${orderId}/check`, 'POST', true, Date.now() - startTime);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Payment check failed');
      }
      return response.data.data;
    } catch (error: any) {
      logApiCall(`/api/bot-service/payments/${orderId}/check`, 'POST', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Generate Minecraft link code
  public async generateMinecraftLinkCode(serverId: string, discordUserId: string): Promise<string> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<{ linkCode: string }>> = await this.axiosInstance.post(
        '/api/bot-service/minecraft/link-code',
        { serverId, discordUserId }
      );
      logApiCall('/api/bot-service/minecraft/link-code', 'POST', true, Date.now() - startTime);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Failed to generate link code');
      }
      return response.data.data.linkCode;
    } catch (error: any) {
      logApiCall('/api/bot-service/minecraft/link-code', 'POST', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Get Minecraft account
  public async getMinecraftAccount(serverId: string, discordUserId: string): Promise<MinecraftAccount | null> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<MinecraftAccount>> = await this.axiosInstance.get(
        `/api/bot-service/minecraft/${serverId}/${discordUserId}`
      );
      logApiCall(`/api/bot-service/minecraft/${serverId}/${discordUserId}`, 'GET', true, Date.now() - startTime);
      return response.data.data || null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      logApiCall(`/api/bot-service/minecraft/${serverId}/${discordUserId}`, 'GET', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Health (proxied)
  public async healthCheck(): Promise<any> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<ApiResponse<any>> = await this.axiosInstance.get('/api/bot-service/health');
      logApiCall('/api/bot-service/health', 'GET', true, Date.now() - startTime);
      return response.data.data;
    } catch (error: any) {
      logApiCall('/api/bot-service/health', 'GET', false, Date.now() - startTime, error);
      throw error;
    }
  }

  // Auth status
  public isAuthenticated(): boolean {
    return this.authToken !== null && Date.now() < this.tokenExpiresAt;
  }

  // Clear auth
  public clearAuth(): void {
    this.authToken = null;
    this.tokenExpiresAt = 0;
  }
}

export default BotApiService;