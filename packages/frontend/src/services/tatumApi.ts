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

export interface ProcessedCoin {
  symbol: string;
  name: string;
  logoUrl: string;
  networks: ProcessedNetwork[];
}

class TatumApiService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  private setCache(key: string, data: any, ttlMs: number) {
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }
  private getCache<T>(key: string): T | null {
    const e = this.cache.get(key);
    if (!e) return null;
    if (Date.now() - e.timestamp > e.ttl) { this.cache.delete(key); return null; }
    return e.data as T;
  }

  async getProcessedCoinsAndNetworks(): Promise<ProcessedCoin[]> {
    const cacheKey = 'tatum-supported-coins';
    const cached = this.getCache<ProcessedCoin[]>(cacheKey);
    if (cached) return cached;

    const resp = await fetch('/api/backend/tatum/supported');
    if (!resp.ok) throw new Error('Failed to load Tatum supported chains');
    const data = await resp.json();
    const coins: ProcessedCoin[] = data?.data || [];
    // Basic sort: popular first
    const order: Record<string, number> = { BTC: 1, ETH: 2, USDT: 3, USDC: 4, BSC: 5, XRP: 6, ADA: 7, SOL: 8, MATIC: 9, DOGE: 10, LTC: 11 };
    coins.sort((a, b) => (order[a.symbol] || 999) - (order[b.symbol] || 999));

    this.setCache(cacheKey, coins, 30 * 60 * 1000);
    return coins;
  }
}

export const tatumApiService = new TatumApiService();

