import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/centralizedErrorHandler';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface OKXConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  sandbox: boolean;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface OKXApiResponse<T = any> {
  code: string;
  msg: string;
  data: T;
  requestId?: string;
  timestamp?: number;
}

export interface OKXCurrency {
  ccy: string;
  name: string;
  logoLink: string;
  mainNet: boolean;
  chain: string;
  canDep: boolean;
  canWd: boolean;
  canInternal: boolean;
  minWd: string;
  maxWd: string;
  wdTickSz: string;
  wdQuota: string;
  usedWdQuota: string;
  fee: string;
  feeCcy: string;
  minFee: string;
  maxFee: string;
}

export interface OKXBalance {
  currency: string;
  available: string;
  frozen: string;
  total: string;
}

export interface OKXWithdrawalRequest {
  currency: string;
  amount: string;
  destination: string;
  chain?: string;
  fee?: string;
  memo?: string;
}

export interface OKXPaymentIntent {
  paymentId: string;
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  expiresAt: number;
  paymentUrl?: string;
  qrCode?: string;
}

// ============================================================================
// OPTIMIZED RATE LIMITER
// ============================================================================

class OptimizedRateLimiter {
  private readonly requestTimes = new Map<string, number[]>();
  private readonly limits = {
    perSecond: 10,
    perMinute: 600,
    perHour: 10000
  };

  async checkRateLimit(endpoint: string = 'default'): Promise<void> {
    const now = Date.now();
    const times = this.requestTimes.get(endpoint) || [];
    
    // Clean old timestamps efficiently
    const validTimes = times.filter(time => now - time < 3600000); // 1 hour
    
    // Check limits
    const recentSecond = validTimes.filter(time => now - time < 1000).length;
    const recentMinute = validTimes.filter(time => now - time < 60000).length;
    const recentHour = validTimes.length;

    if (recentSecond >= this.limits.perSecond) {
      await this.sleep(1000 - (now - Math.max(...validTimes.slice(-this.limits.perSecond))));
    } else if (recentMinute >= this.limits.perMinute) {
      await this.sleep(60000 - (now - Math.max(...validTimes.slice(-this.limits.perMinute))));
    } else if (recentHour >= this.limits.perHour) {
      await this.sleep(3600000 - (now - validTimes[0]));
    }

    // Record request
    validTimes.push(now);
    this.requestTimes.set(endpoint, validTimes);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  getStats(endpoint: string = 'default') {
    const now = Date.now();
    const times = this.requestTimes.get(endpoint) || [];
    return {
      lastSecond: times.filter(time => now - time < 1000).length,
      lastMinute: times.filter(time => now - time < 60000).length,
      lastHour: times.filter(time => now - time < 3600000).length,
      limits: this.limits
    };
  }
}

// ============================================================================
// OPTIMIZED CACHE WITH LRU EVICTION
// ============================================================================

class OptimizedCache<T = any> {
  private readonly cache = new Map<string, { data: T; timestamp: number; ttl: number; accessCount: number }>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(maxSize = 1000, defaultTTL = 300000) { // 5 minutes default
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.startCleanup();
  }

  set(key: string, data: T, ttl = this.defaultTTL): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access count for LRU
    entry.accessCount++;
    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictLRU(): void {
    let lruKey = '';
    let lruScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Score based on age and access frequency
      const age = Date.now() - entry.timestamp;
      const score = age / (entry.accessCount + 1);
      
      if (score < lruScore) {
        lruScore = score;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate()
    };
  }

  private calculateHitRate(): number {
    const totalAccess = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.accessCount, 0);
    return totalAccess > 0 ? (this.cache.size / totalAccess) * 100 : 0;
  }
}

// ============================================================================
// OPTIMIZED CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly timeout: number;

  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        logger.info('Circuit breaker: transitioning to half-open');
      } else {
        throw new AppError('Circuit breaker is open', 503, 'CIRCUIT_BREAKER_OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      logger.info('Circuit breaker: reset to closed');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.warn(`Circuit breaker: opened due to ${this.failures} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// ============================================================================
// OPTIMIZED OKX SERVICE
// ============================================================================

export class OptimizedOKXService {
  private readonly client: AxiosInstance;
  private readonly config: Required<OKXConfig>;
  private readonly rateLimiter = new OptimizedRateLimiter();
  private readonly cache = new OptimizedCache<any>();
  private readonly circuitBreaker = new CircuitBreaker();
  
  // Server time synchronization
  private serverTimeOffset = 0;
  private lastServerTimeSync = 0;
  private readonly SERVER_TIME_SYNC_INTERVAL = 300000; // 5 minutes

  // Metrics
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    rateLimitHits: 0,
    lastRequestTime: 0
  };

  constructor(config: OKXConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    this.client = this.createAxiosClient();
    this.initializeServerTimeSync();
  }

  // ============================================================================
  // CORE HTTP CLIENT SETUP
  // ============================================================================

  private createAxiosClient(): AxiosInstance {
    const client = axios.create({
      baseURL: 'https://www.okx.com/api/v5',
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OKX-Node-Client/1.0.0'
      }
    });

    // Request interceptor for authentication
    client.interceptors.request.use(
      (config) => {
        const requestId = this.generateRequestId();
        const requestPath = this.normalizeRequestPath(config.url || '');
        const body = config.data ? JSON.stringify(config.data) : '';
        
        // Add authentication headers
        const authHeaders = this.generateAuthHeaders(
          config.method?.toUpperCase() || 'GET',
          requestPath,
          body
        );

        // Avoid reassigning headers object (Axios v1 uses AxiosHeaders type)
        if (!config.headers) {
          config.headers = {} as any;
        }
        Object.assign(config.headers as any, authHeaders);
        (config.headers as any)['X-Request-ID'] = requestId;

        (config as any).metadata = { requestId, startTime: Date.now() };

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for metrics and error handling
    client.interceptors.response.use(
      (response) => {
        const { requestId, startTime } = (response.config as any).metadata || {};
        const responseTime = Date.now() - (startTime || Date.now());
        
        this.updateMetrics(true, responseTime);
        
        logger.debug('OKX API success', {
          requestId,
          status: response.status,
          responseTime,
          endpoint: response.config.url
        });

        return response;
      },
      (error) => {
        const { requestId, startTime } = (error.config as any)?.metadata || {};
        const responseTime = Date.now() - (startTime || Date.now());
        
        this.updateMetrics(false, responseTime);
        
        const errorInfo = this.parseOKXError(error);
        
        logger.error('OKX API error', {
          requestId,
          status: error.response?.status,
          responseTime,
          data: error.response?.data,
          code: errorInfo.code,
          isTransient: errorInfo.isTransient
        });

        throw new AppError(
          errorInfo.message,
          error.response?.status || 500,
          errorInfo.code
        );
      }
    );

    return client;
  }

  // ============================================================================
  // AUTHENTICATION & SECURITY
  // ============================================================================

  private generateAuthHeaders(method: string, requestPath: string, body = ''): Record<string, string> {
    const timestamp = this.getSynchronizedTimestamp();
    const message = timestamp + method + requestPath + body;
    const signature = crypto
      .createHmac('sha256', this.config.secretKey)
      .update(message)
      .digest('base64');

    return {
      'OK-ACCESS-KEY': this.config.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.passphrase
    };
  }

  private getSynchronizedTimestamp(): string {
    const now = Date.now();
    const synchronizedTime = this.serverTimeOffset !== 0 
      ? now + this.serverTimeOffset - 2000 // 2 second safety buffer
      : now - 3000; // 3 second buffer for unsynchronized time
    
    return (synchronizedTime / 1000).toFixed(3);
  }

  private async syncServerTime(): Promise<void> {
    try {
      const now = Date.now();
      
      if (now - this.lastServerTimeSync < this.SERVER_TIME_SYNC_INTERVAL) {
        return;
      }

      const response = await axios.get('https://www.okx.com/api/v5/public/time', {
        timeout: 10000
      });

      if (response.data?.data?.[0]?.ts) {
        const serverTime = parseInt(response.data.data[0].ts);
        const localTime = Date.now();
        
        this.serverTimeOffset = serverTime - localTime;
        this.lastServerTimeSync = localTime;
        
        logger.info('OKX server time synchronized', {
          serverTime: new Date(serverTime).toISOString(),
          localTime: new Date(localTime).toISOString(),
          offset: this.serverTimeOffset
        });
      }
    } catch (error) {
      logger.warn('Failed to sync OKX server time', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private initializeServerTimeSync(): void {
    // Initial sync
    this.syncServerTime().catch(() => {
      logger.warn('Initial server time sync failed, will retry later');
    });

    // Periodic sync
    setInterval(() => {
      this.syncServerTime().catch(() => {
        logger.warn('Periodic server time sync failed');
      });
    }, this.SERVER_TIME_SYNC_INTERVAL);
  }

  // ============================================================================
  // CORE REQUEST HANDLING
  // ============================================================================

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    options: {
      useCache?: boolean;
      cacheTTL?: number;
      retries?: number;
    } = {}
  ): Promise<OKXApiResponse<T>> {
    const cacheKey = `${method}:${endpoint}:${JSON.stringify(data || {})}`;
    
    // Check cache for GET requests
    if (options.useCache && method === 'GET') {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Rate limiting
    await this.rateLimiter.checkRateLimit(endpoint);

    const maxRetries = options.retries ?? this.config.maxRetries;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.circuitBreaker.execute(async () => {
          const config: AxiosRequestConfig = {
            method: method.toLowerCase() as any,
            url: endpoint,
            data
          };

          const response: AxiosResponse<OKXApiResponse<T>> = await this.client.request(config);
          
          if (response.data.code !== '0') {
            throw new AppError(`OKX API error: ${response.data.msg}`, 400, 'OKX_API_ERROR');
          }

          return response.data;
        });

        // Cache successful GET requests
        if (options.useCache && method === 'GET') {
          this.cache.set(cacheKey, result, options.cacheTTL);
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Handle timestamp errors with immediate retry
        if (this.isTimestampError(error) && attempt < maxRetries) {
          logger.warn(`Timestamp error, retrying ${attempt + 1}/${maxRetries}`, {
            endpoint,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Force server time resync
          this.lastServerTimeSync = 0;
          await this.syncServerTime();
          await this.sleep(500); // Short delay
          continue;
        }

        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          logger.warn(`Request failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
            endpoint,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  async getSupportedCurrencies(): Promise<OKXCurrency[]> {
    const response = await this.makeRequest<OKXCurrency[]>(
      'GET',
      '/asset/currencies',
      undefined,
      { useCache: true, cacheTTL: 3600000 } // 1 hour cache
    );
    return response.data;
  }

  async getAccountBalance(): Promise<OKXBalance[]> {
    const response = await this.makeRequest<any[]>(
      'GET',
      '/account/balance',
      undefined,
      { useCache: true, cacheTTL: 30000 } // 30 seconds cache
    );

    return response.data.map((item: any) => ({
      currency: item.ccy,
      available: item.availBal,
      frozen: item.frozenBal,
      total: item.bal
    }));
  }

  async createPaymentIntent(amount: string, currency: string): Promise<OKXPaymentIntent> {
    const response = await this.makeRequest<any>(
      'POST',
      '/asset/deposit-address',
      { ccy: currency }
    );

    return {
      paymentId: this.generateRequestId(),
      amount,
      currency,
      status: 'pending',
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
      paymentUrl: response.data.addr,
      qrCode: response.data.addr
    };
  }

  async processWithdrawal(params: OKXWithdrawalRequest): Promise<{ withdrawalId: string; status: string }> {
    const response = await this.makeRequest<any>(
      'POST',
      '/asset/withdrawal',
      {
        ccy: params.currency,
        amt: params.amount,
        dest: '4', // On-chain withdrawal
        toAddr: params.destination,
        chain: params.chain,
        fee: params.fee,
        memo: params.memo
      }
    );

    return {
      withdrawalId: response.data.wdId,
      status: this.mapWithdrawalStatus(response.data.state)
    };
  }

  async getWithdrawalStatus(withdrawalId: string): Promise<{ status: string; txHash?: string }> {
    const response = await this.makeRequest<any[]>(
      'GET',
      `/asset/withdrawal-history?wdId=${withdrawalId}`
    );

    const withdrawal = response.data[0];
    if (!withdrawal) {
      throw new AppError('Withdrawal not found', 404, 'WITHDRAWAL_NOT_FOUND');
    }

    return {
      status: this.mapWithdrawalStatus(withdrawal.state),
      txHash: withdrawal.txId
    };
  }

  // ============================================================================
  // HEALTH CHECK & MONITORING
  // ============================================================================

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      await this.makeRequest('GET', '/public/time');
      
      return {
        status: 'healthy',
        details: {
          circuitBreaker: this.circuitBreaker.getState(),
          cache: this.cache.getStats(),
          rateLimiter: this.rateLimiter.getStats(),
          metrics: this.metrics,
          serverTimeOffset: this.serverTimeOffset,
          lastServerTimeSync: new Date(this.lastServerTimeSync).toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          circuitBreaker: this.circuitBreaker.getState()
        }
      };
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      cache: this.cache.getStats(),
      rateLimiter: this.rateLimiter.getStats(),
      circuitBreaker: this.circuitBreaker.getState()
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('OKX cache cleared');
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
      lastRequestTime: 0
    };
    logger.info('OKX metrics reset');
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private updateMetrics(success: boolean, responseTime: number): void {
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = Date.now();
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time
    const totalResponseTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalResponseTime / this.metrics.totalRequests;
  }

  private parseOKXError(error: any): { message: string; code: string; isTransient: boolean } {
    const data = error.response?.data;
    const status = error.response?.status;
    
    if (data?.code) {
      const isTransient = this.isTransientError(data.code);
      return {
        message: `OKX API: ${data.msg || 'Unknown error'}`,
        code: data.code,
        isTransient
      };
    }

    if (status === 429) {
      return {
        message: 'OKX API: Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        isTransient: true
      };
    }

    return {
      message: error.message || 'OKX API request failed',
      code: 'OKX_REQUEST_ERROR',
      isTransient: false
    };
  }

  private isTransientError(code: string): boolean {
    const transientCodes = ['50102', '50006', '50011', '50013', '50014'];
    return transientCodes.includes(code);
  }

  private isTimestampError(error: any): boolean {
    const data = error.response?.data;
    const timestampCodes = ['50102', '50006', '50011'];
    return data?.code && timestampCodes.includes(data.code);
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(this.config.retryDelay * Math.pow(2, attempt), 10000);
  }

  private mapWithdrawalStatus(okxStatus: string): string {
    const statusMap: Record<string, string> = {
      '-3': 'pending', '-2': 'cancelled', '-1': 'failed',
      '0': 'pending', '1': 'processing', '2': 'completed',
      '3': 'pending', '4': 'processing', '5': 'failed',
      '6': 'completed', '7': 'approved', '10': 'processing'
    };
    return statusMap[okxStatus] || 'unknown';
  }

  private normalizeRequestPath(url: string): string {
    return url.startsWith('/api/v5') ? url : `/api/v5${url}`;
  }

  private generateRequestId(): string {
    return `okx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    this.cache.destroy();
    logger.info('OKX service destroyed');
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let optimizedOKXService: OptimizedOKXService | null = null;

export function getOptimizedOKXService(): OptimizedOKXService {
  if (!optimizedOKXService) {
    const config: OKXConfig = {
      apiKey: process.env.OKX_API_KEY || '',
      secretKey: process.env.OKX_SECRET_KEY || '',
      passphrase: process.env.OKX_PASSPHRASE || '',
      sandbox: process.env.OKX_SANDBOX === 'true',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000
    };

    if (!config.apiKey || !config.secretKey || !config.passphrase) {
      throw new AppError(
        'Missing OKX configuration. Please check OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE environment variables.',
        500,
        'OKX_CONFIG_MISSING'
      );
    }

    optimizedOKXService = new OptimizedOKXService(config);
    logger.info('Optimized OKX service initialized', {
      sandbox: config.sandbox,
      timeout: config.timeout,
      maxRetries: config.maxRetries
    });
  }

  return optimizedOKXService;
}

// Graceful shutdown
process.on('SIGTERM', () => {
  if (optimizedOKXService) {
    optimizedOKXService.destroy();
  }
});

process.on('SIGINT', () => {
  if (optimizedOKXService) {
    optimizedOKXService.destroy();
  }
});