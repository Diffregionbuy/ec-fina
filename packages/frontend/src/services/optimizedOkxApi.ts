import { logger } from '../utils/logger';

const API_BASE = ''; // Use relative URLs for Next.js API routes

export interface OKXCurrency {
  ccy: string; // Currency symbol (BTC, ETH, etc.)
  name: string; // Full name
  logoLink: string; // Logo URL
  mainNet: boolean;
  chain: string; // Network/chain identifier
  canDep: boolean; // Can deposit
  canWd: boolean; // Can withdraw
  canInternal: boolean; // Can internal transfer
  minWd: string; // Minimum withdrawal amount
  maxWd: string; // Maximum withdrawal amount
  wdTickSz: string; // Withdrawal precision
  wdQuota: string; // Daily withdrawal quota
  usedWdQuota: string; // Used withdrawal quota
  fee: string; // Withdrawal fee
  feeCcy: string; // Fee currency
  minFee: string; // Minimum fee
  maxFee: string; // Maximum fee
}

export interface ProcessedCoin {
  symbol: string;
  name: string;
  logoUrl: string;
  networks: ProcessedNetwork[];
}

export interface ProcessedNetwork {
  id: string;
  name: string;
  chain: string;
  symbol: string;
  logoUrl: string;
  fee: string;
  minAmount: string;
  maxAmount: string;
  withdrawalTime: string;
  canWithdraw: boolean;
  canDeposit: boolean;
}

export interface OKXBalance {
  currency: string;
  available: string;
  frozen: string;
  total: string;
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

export interface OKXWithdrawalRequest {
  currency: string;
  amount: string;
  destination: string;
  chain?: string;
  fee?: string;
  memo?: string;
}

export interface OKXWithdrawalResponse {
  withdrawalId: string;
  status: string;
}

export interface OKXWithdrawalStatus {
  status: string;
  txHash?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    count?: number;
    cached?: boolean;
    fallback?: boolean;
    error?: string;
    timestamp: string;
  };
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
}

class OptimizedOKXApiService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private requestQueue = new Map<string, Promise<any>>();
  private retryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
  };

  // Cache management
  private setCache(key: string, data: any, ttlMs: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });

    // Auto-cleanup expired entries
    setTimeout(() => {
      const entry = this.cache.get(key);
      if (entry && Date.now() - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }, ttlMs);
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

  private clearCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  // Request deduplication
  private async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    if (this.requestQueue.has(key)) {
      return this.requestQueue.get(key)!;
    }

    const promise = requestFn().finally(() => {
      this.requestQueue.delete(key);
    });

    this.requestQueue.set(key, promise);
    return promise;
  }

  // Enhanced fetch with retry logic and error handling
  private async enhancedFetch<T>(
    url: string,
    options: RequestInit = {},
    useCache = true,
    cacheTTL = 5 * 60 * 1000
  ): Promise<ApiResponse<T>> {
    const cacheKey = `${url}:${JSON.stringify(options)}`;
    
    // Check cache first
    if (useCache && options.method === 'GET') {
      const cached = this.getCache(cacheKey);
      if (cached) {
        logger.debug('OKX API cache hit', { url, cacheKey });
        return cached;
      }
    }

    // Deduplicate identical requests
    return this.deduplicateRequest(cacheKey, async () => {
      let lastError: Error;

      for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
        try {
          const response = await fetch(url, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              ...options.headers
            }
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
          }

          const data: ApiResponse<T> = await response.json();

          // Cache successful GET requests
          if (useCache && options.method === 'GET' && data.success) {
            this.setCache(cacheKey, data, cacheTTL);
          }

          logger.debug('OKX API request successful', {
            url,
            attempt: attempt + 1,
            cached: false
          });

          return data;

        } catch (error) {
          lastError = error as Error;
          
          if (attempt < this.retryConfig.maxRetries - 1) {
            const delay = Math.min(
              this.retryConfig.baseDelay * Math.pow(2, attempt),
              this.retryConfig.maxDelay
            );
            
            logger.warn('OKX API request failed, retrying', {
              url,
              attempt: attempt + 1,
              maxRetries: this.retryConfig.maxRetries,
              delay,
              error: error instanceof Error ? error.message : 'Unknown error'
            });

            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      logger.error('OKX API request failed after all retries', {
        url,
        maxRetries: this.retryConfig.maxRetries,
        error: lastError.message
      });

      throw lastError;
    });
  }

  // Public API methods

  async getSupportedCurrencies(useCache = true): Promise<OKXCurrency[]> {
    try {
      const response = await this.enhancedFetch<OKXCurrency[]>(
        '/api/backend/okx/currencies',
        { method: 'GET' },
        useCache,
        60 * 60 * 1000 // 1 hour cache
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch currencies');
      }

      return response.data || [];
    } catch (error) {
      logger.error('Failed to fetch OKX currencies:', error);
      return this.getFallbackCurrencies();
    }
  }

  async getCurrencyNetworks(currency: string, useCache = true): Promise<OKXCurrency[]> {
    try {
      const response = await this.enhancedFetch<OKXCurrency[]>(
        `/api/backend/okx/networks/${encodeURIComponent(currency)}`,
        { method: 'GET' },
        useCache,
        30 * 60 * 1000 // 30 minutes cache
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch networks');
      }

      return response.data || [];
    } catch (error) {
      logger.error(`Failed to fetch networks for ${currency}:`, error);
      return [];
    }
  }

  async getBalance(currency?: string): Promise<OKXBalance[]> {
    try {
      const url = currency 
        ? `/api/backend/okx/balance?currency=${encodeURIComponent(currency)}`
        : '/api/backend/okx/balance';

      const response = await this.enhancedFetch<OKXBalance[]>(
        url,
        { method: 'GET' },
        true,
        30 * 1000 // 30 seconds cache
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch balance');
      }

      return response.data || [];
    } catch (error) {
      logger.error('Failed to fetch OKX balance:', error);
      throw error;
    }
  }

  async createPaymentIntent(params: {
    amount: string;
    currency: string;
    orderId?: string;
    callbackUrl?: string;
  }): Promise<OKXPaymentIntent> {
    try {
      const response = await this.enhancedFetch<OKXPaymentIntent>(
        '/api/backend/okx/payment-intent',
        {
          method: 'POST',
          body: JSON.stringify(params)
        },
        false // Don't cache POST requests
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create payment intent');
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to create OKX payment intent:', error);
      throw error;
    }
  }

  async processWithdrawal(params: OKXWithdrawalRequest): Promise<OKXWithdrawalResponse> {
    try {
      const response = await this.enhancedFetch<OKXWithdrawalResponse>(
        '/api/backend/okx/withdrawal',
        {
          method: 'POST',
          body: JSON.stringify(params)
        },
        false // Don't cache POST requests
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to process withdrawal');
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to process OKX withdrawal:', error);
      throw error;
    }
  }

  async getWithdrawalStatus(withdrawalId: string): Promise<OKXWithdrawalStatus> {
    try {
      const response = await this.enhancedFetch<OKXWithdrawalStatus>(
        `/api/backend/okx/withdrawal/${encodeURIComponent(withdrawalId)}`,
        { method: 'GET' },
        true,
        60 * 1000 // 1 minute cache
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get withdrawal status');
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to get withdrawal status:', error);
      throw error;
    }
  }

  // Process raw OKX data into organized coin/network structure
  async getProcessedCoinsAndNetworks(): Promise<ProcessedCoin[]> {
    const cacheKey = 'processed-coins-networks';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const currencies = await this.getSupportedCurrencies();
      const coinMap = new Map<string, ProcessedCoin>();

      currencies.forEach((currency) => {
        // Skip if withdrawal is not supported
        if (!currency.canWd) return;

        const symbol = currency.ccy.toUpperCase();
        
        // Get or create coin entry
        if (!coinMap.has(symbol)) {
          coinMap.set(symbol, {
            symbol,
            name: currency.name || symbol,
            logoUrl: currency.logoLink || this.getDefaultCoinIcon(symbol),
            networks: [],
          });
        }

        const coin = coinMap.get(symbol)!;
        
        // Add network to coin
        const withdrawalTime = this.calculateWithdrawalTime(currency);
        
        coin.networks.push({
          id: `${symbol.toLowerCase()}-${currency.chain.toLowerCase()}`,
          name: this.getNetworkDisplayName(currency.chain),
          chain: currency.chain,
          symbol: currency.feeCcy || symbol,
          logoUrl: this.getNetworkIcon(currency.chain),
          fee: `${currency.fee} ${currency.feeCcy || symbol}`,
          minAmount: `${currency.minWd} ${symbol}`,
          maxAmount: `${currency.maxWd} ${symbol}`,
          withdrawalTime: withdrawalTime,
          canWithdraw: currency.canWd,
          canDeposit: currency.canDep,
        });
      });

      // Convert map to array and sort by popularity
      const processedCoins = Array.from(coinMap.values())
        .filter(coin => coin.networks.length > 0)
        .sort((a, b) => this.getCoinPriority(a.symbol) - this.getCoinPriority(b.symbol));

      // Cache for 30 minutes
      this.setCache(cacheKey, processedCoins, 30 * 60 * 1000);
      
      return processedCoins;
    } catch (error) {
      logger.error('Failed to process coins and networks:', error);
      return this.getFallbackProcessedCoins();
    }
  }

  // Health check
  async getServiceHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    cache: { size: number; maxSize: number };
    requests: { queued: number };
  }> {
    try {
      const response = await this.enhancedFetch<any>(
        '/api/backend/okx/health',
        { method: 'GET' },
        false
      );

      return {
        status: response.success ? 'healthy' : 'degraded',
        cache: {
          size: this.cache.size,
          maxSize: 1000
        },
        requests: {
          queued: this.requestQueue.size
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        cache: {
          size: this.cache.size,
          maxSize: 1000
        },
        requests: {
          queued: this.requestQueue.size
        }
      };
    }
  }

  // Clear cache
  async clearServiceCache(pattern?: string): Promise<void> {
    try {
      await this.enhancedFetch<any>(
        '/api/backend/okx/cache/clear',
        {
          method: 'POST',
          body: JSON.stringify({ pattern })
        },
        false
      );

      // Also clear local cache
      this.clearCache(pattern);
    } catch (error) {
      logger.error('Failed to clear service cache:', error);
      // Still clear local cache
      this.clearCache(pattern);
    }
  }

  // Helper methods

  private getCoinPriority(symbol: string): number {
    const priorities: Record<string, number> = {
      'BTC': 1,
      'ETH': 2,
      'USDT': 3,
      'USDC': 4,
      'BNB': 5,
      'XRP': 6,
      'ADA': 7,
      'SOL': 8,
      'DOT': 9,
      'MATIC': 10,
      'LTC': 11,
      'LINK': 12,
      'UNI': 13,
      'ATOM': 14,
      'XLM': 15,
    };
    return priorities[symbol] || 999;
  }

  private getNetworkDisplayName(chain: string): string {
    const networkNames: Record<string, string> = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'BSC': 'BNB Smart Chain',
      'MATIC': 'Polygon',
      'AVAX': 'Avalanche',
      'FTM': 'Fantom',
      'ARBITRUM': 'Arbitrum One',
      'OPTIMISM': 'Optimism',
      'TRX': 'TRON',
      'SOL': 'Solana',
      'DOT': 'Polkadot',
      'ADA': 'Cardano',
      'XRP': 'XRP Ledger',
      'LTC': 'Litecoin',
      'BCH': 'Bitcoin Cash',
      'ETC': 'Ethereum Classic',
      'ATOM': 'Cosmos',
      'NEAR': 'NEAR Protocol',
      'ALGO': 'Algorand',
      'XLM': 'Stellar',
    };
    return networkNames[chain.toUpperCase()] || chain;
  }

  private getDefaultCoinIcon(symbol: string): string {
    const coinIds: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDT': 'tether',
      'USDC': 'usd-coin',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'SOL': 'solana',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'LTC': 'litecoin',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'ATOM': 'cosmos',
      'XLM': 'stellar',
    };
    
    const coinId = coinIds[symbol] || symbol.toLowerCase();
    return `https://assets.coingecko.com/coins/images/1/large/${coinId}.png`;
  }

  private getNetworkIcon(chain: string): string {
    const networkIcons: Record<string, string> = {
      'BTC': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      'ETH': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
      'BSC': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
      'MATIC': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
      'AVAX': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
      'FTM': 'https://assets.coingecko.com/coins/images/4001/large/Fantom.png',
      'ARBITRUM': 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
      'OPTIMISM': 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
      'TRX': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
      'SOL': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
      'DOT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
      'ADA': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
      'XRP': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
      'LTC': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
      'ATOM': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
      'NEAR': 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
      'ALGO': 'https://assets.coingecko.com/coins/images/4380/large/download.png',
      'XLM': 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
    };
    
    return networkIcons[chain.toUpperCase()] || 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png';
  }

  private calculateWithdrawalTime(currency: OKXCurrency): string {
    const networkTimes: Record<string, string> = {
      'BTC': '15-30 min',
      'ETH': '3-8 min',
      'BSC': '1-3 min',
      'MATIC': '1-2 min',
      'AVAX': '1-3 min',
      'FTM': '1-2 min',
      'ARBITRUM': '2-5 min',
      'OPTIMISM': '2-6 min',
      'TRX': '1-3 min',
      'SOL': '1-2 min',
      'DOT': '2-5 min',
      'ADA': '3-8 min',
      'XRP': '1-3 min',
      'LTC': '5-15 min',
      'ATOM': '2-5 min',
      'NEAR': '1-3 min',
      'ALGO': '1-3 min',
      'XLM': '1-3 min',
    };
    
    return networkTimes[currency.chain.toUpperCase()] || '3-10 min';
  }

  private getFallbackCurrencies(): OKXCurrency[] {
    return [
      {
        ccy: 'BTC',
        name: 'Bitcoin',
        logoLink: this.getDefaultCoinIcon('BTC'),
        mainNet: true,
        chain: 'BTC',
        canDep: true,
        canWd: true,
        canInternal: true,
        minWd: '0.001',
        maxWd: '100',
        wdTickSz: '0.00000001',
        wdQuota: '100',
        usedWdQuota: '0',
        fee: '0.0005',
        feeCcy: 'BTC',
        minFee: '0.0005',
        maxFee: '0.0005',
      },
      {
        ccy: 'ETH',
        name: 'Ethereum',
        logoLink: this.getDefaultCoinIcon('ETH'),
        mainNet: true,
        chain: 'ETH',
        canDep: true,
        canWd: true,
        canInternal: true,
        minWd: '0.01',
        maxWd: '1000',
        wdTickSz: '0.00000001',
        wdQuota: '1000',
        usedWdQuota: '0',
        fee: '0.005',
        feeCcy: 'ETH',
        minFee: '0.005',
        maxFee: '0.005',
      },
      {
        ccy: 'USDT',
        name: 'Tether USD',
        logoLink: this.getDefaultCoinIcon('USDT'),
        mainNet: true,
        chain: 'ETH',
        canDep: true,
        canWd: true,
        canInternal: true,
        minWd: '10',
        maxWd: '50000',
        wdTickSz: '0.01',
        wdQuota: '50000',
        usedWdQuota: '0',
        fee: '1',
        feeCcy: 'USDT',
        minFee: '1',
        maxFee: '1',
      }
    ];
  }

  private getFallbackProcessedCoins(): ProcessedCoin[] {
    const fallbackCurrencies = this.getFallbackCurrencies();
    const coinMap = new Map<string, ProcessedCoin>();

    fallbackCurrencies.forEach((currency) => {
      const symbol = currency.ccy.toUpperCase();
      
      if (!coinMap.has(symbol)) {
        coinMap.set(symbol, {
          symbol,
          name: currency.name || symbol,
          logoUrl: currency.logoLink || this.getDefaultCoinIcon(symbol),
          networks: [],
        });
      }

      const coin = coinMap.get(symbol)!;
      
      coin.networks.push({
        id: `${symbol.toLowerCase()}-${currency.chain.toLowerCase()}`,
        name: this.getNetworkDisplayName(currency.chain),
        chain: currency.chain,
        symbol: currency.feeCcy || symbol,
        logoUrl: this.getNetworkIcon(currency.chain),
        fee: `${currency.fee} ${currency.feeCcy || symbol}`,
        minAmount: `${currency.minWd} ${symbol}`,
        maxAmount: `${currency.maxWd} ${symbol}`,
        withdrawalTime: this.calculateWithdrawalTime(currency),
        canWithdraw: currency.canWd,
        canDeposit: currency.canDep,
      });
    });

    return Array.from(coinMap.values());
  }
}

export const optimizedOkxApiService = new OptimizedOKXApiService();

// Export for backward compatibility
export const okxApiService = optimizedOkxApiService;