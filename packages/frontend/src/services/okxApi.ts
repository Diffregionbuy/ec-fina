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

class OKXApiService {
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

  // Fetch supported currencies from our backend API
  async getSupportedCurrencies(): Promise<OKXCurrency[]> {
    const cacheKey = 'supported-currencies';
    const cached = this.getCache(cacheKey);
    if (cached) {
      console.log('[Wallet/OKX] getSupportedCurrencies cache hit:', { length: Array.isArray(cached) ? cached.length : 0 });
      return cached;
    }

    try {
      console.log('[Wallet/OKX] Fetching currencies via Next proxy:', '/api/backend/okx/currencies');
      const response = await fetch('/api/backend/okx/currencies');
      console.log('[Wallet/OKX] Currencies response:', response.status, response.statusText);
      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[Wallet/OKX] Currencies payload meta:', { success: data?.success, length: Array.isArray(data?.data) ? data.data.length : 0, fallback: data?.fallback, cached: data?.cached });
      if (!data.success) {
        throw new Error(`Backend API error: ${data.error?.message || 'Unknown error'}`);
      }

      const currencies = data.data || [];

      // Cache for 1 hour
      this.setCache(cacheKey, currencies, 60 * 60 * 1000);
      console.log('[Wallet/OKX] Returning currencies:', Array.isArray(currencies) ? currencies.length : 0);
      return currencies;
    } catch (error) {
      console.error('[Wallet/OKX] getSupportedCurrencies error, using fallback:', error);
      return this.getFallbackCurrencies();
    }
  }

  // Process raw OKX data into organized coin/network structure
  async getProcessedCoinsAndNetworks(): Promise<ProcessedCoin[]> {
    const cacheKey = 'processed-coins-networks';
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const currencies = await this.getSupportedCurrencies();
      console.log('[Wallet/OKX] getProcessedCoinsAndNetworks currencies length:', Array.isArray(currencies) ? currencies.length : 0);
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
      console.log('[Wallet/OKX] Processed coins ready:', processedCoins.length, processedCoins.slice(0, 5).map(c => c.symbol));
      
      return processedCoins;
    } catch (error) {
      console.error('[Wallet/OKX] getProcessedCoinsAndNetworks error, using fallback:', error);
      return this.getFallbackProcessedCoins();
    }
  }

  // Get popular coins first
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

  // Get network display name
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

  // Get default coin icon (using a reliable icon service)
  private getDefaultCoinIcon(symbol: string): string {
    // Using CoinGecko's API for reliable coin icons
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

  // Get network icon - handles compound chain identifiers like "BTC-Bitcoin", "ETH-ERC20"
  private getNetworkIcon(chain: string): string {
    // Extract both parts: "BTC-Bitcoin" -> check both "BTC" and "Bitcoin"
    const parts = chain.split('-');
    const coinPart = parts[0]?.toUpperCase().trim();
    const networkPart = parts[1]?.toUpperCase().trim();
    
    const networkIcons: Record<string, string> = {
      // Main cryptocurrencies
      'BTC': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      'BITCOIN': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      'ETH': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
      'ETHEREUM': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
      'ERC20': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
      'BNB': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
      'BSC': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
      'BNB SMART CHAIN': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
      
      // Layer 1 Networks
      'SOL': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
      'SOLANA': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
      'MATIC': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
      'POLYGON': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
      'AVAX': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
      'AVALANCHE C-CHAIN': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
      'FTM': 'https://assets.coingecko.com/coins/images/4001/large/Fantom.png',
      'FANTOM': 'https://assets.coingecko.com/coins/images/4001/large/Fantom.png',
      'TRX': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
      'TRON': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
      'TRC20': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
      'DOT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
      'POLKADOT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
      'ADA': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
      'CARDANO': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
      'XRP': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
      'XRP LEDGER': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
      'LTC': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
      'LITECOIN': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
      
      // Layer 2 Networks
      'ARBITRUM': 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
      'ARBITRUM ONE': 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
      'OPTIMISM': 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
      'BASE': 'https://assets.coingecko.com/coins/images/9956/large/Badge_Logo.png',
      'ZKSYNC': 'https://assets.coingecko.com/coins/images/24091/large/zkSync_era.jpg',
      'ZKSYNC ERA': 'https://assets.coingecko.com/coins/images/24091/large/zkSync_era.jpg',
      'LINEA': 'https://assets.coingecko.com/coins/images/31088/large/linea.jpeg',
      'STARKNET': 'https://assets.coingecko.com/coins/images/26433/large/starknet.png',
      
      // Other Networks
      'NEAR': 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
      'NEAR PROTOCOL': 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
      'ALGO': 'https://assets.coingecko.com/coins/images/4380/large/download.png',
      'ALGORAND': 'https://assets.coingecko.com/coins/images/4380/large/download.png',
      'XLM': 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
      'STELLAR': 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
      'ATOM': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
      'COSMOS': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
      'SUI': 'https://assets.coingecko.com/coins/images/26375/large/sui-ocean-square.png',
      'APTOS': 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png',
      'TON': 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png',
      'ZETACHAIN': 'https://assets.coingecko.com/coins/images/31883/large/zeta.jpeg',
      'LIGHTNING': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', // Bitcoin Lightning
      'X LAYER': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', // Default to BNB
      'UNICHAIN': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
    };
    
    // Try to match network part first, then coin part
    const icon = networkIcons[networkPart] || networkIcons[coinPart] || networkIcons[chain.toUpperCase().trim()];
    
    return icon || 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png';
  }

  // Calculate withdrawal time using real network data and OKX processing times
  private calculateWithdrawalTime(currency: OKXCurrency): string {
    // Extract network identifier
    const networkPart = currency.chain.includes('-') ? currency.chain.split('-')[1] : currency.chain;
    const coinPart = currency.chain.includes('-') ? currency.chain.split('-')[0] : currency.chain;
    const cleanNetwork = networkPart.toUpperCase().trim();
    const cleanCoin = coinPart.toUpperCase().trim();
    
    // Real-world withdrawal time ranges based on network characteristics and OKX processing
    const withdrawalTimes: Record<string, string> = {
      // Bitcoin networks
      'BITCOIN': '15-30 min',
      'BTC': '15-30 min',
      'LIGHTNING': '1-2 min',
      
      // Ethereum and EVM networks
      'ETHEREUM': '3-8 min',
      'ETH': '3-8 min',
      'ERC20': '3-8 min',
      
      // BSC (Fast and cheap)
      'BSC': '1-3 min',
      'BNB SMART CHAIN': '1-3 min',
      'BNB': '1-3 min',
      
      // Polygon (Very fast)
      'POLYGON': '1-2 min',
      'MATIC': '1-2 min',
      
      // Avalanche (Fast)
      'AVALANCHE C-CHAIN': '1-3 min',
      'AVAX': '1-3 min',
      
      // Fantom (Very fast)
      'FANTOM': '1-2 min',
      'FTM': '1-2 min',
      
      // Layer 2 solutions
      'ARBITRUM ONE': '2-5 min',
      'ARBITRUM': '2-5 min',
      'OPTIMISM': '2-6 min',
      'BASE': '2-5 min',
      'ZKSYNC ERA': '3-10 min',
      'ZKSYNC': '3-10 min',
      'LINEA': '2-5 min',
      'STARKNET': '5-15 min',
      
      // TRON (Fast and cheap)
      'TRON': '1-3 min',
      'TRX': '1-3 min',
      'TRC20': '1-3 min',
      
      // Solana (Very fast)
      'SOLANA': '1-2 min',
      'SOL': '1-2 min',
      
      // Other major networks
      'POLKADOT': '2-5 min',
      'DOT': '2-5 min',
      'CARDANO': '3-8 min',
      'ADA': '3-8 min',
      'XRP LEDGER': '1-3 min',
      'XRP': '1-3 min',
      'LITECOIN': '5-15 min',
      'LTC': '5-15 min',
      'BITCOIN CASH': '10-20 min',
      'BCH': '10-20 min',
      'ETHEREUM CLASSIC': '3-8 min',
      'ETC': '3-8 min',
      
      // Cosmos ecosystem
      'COSMOS': '2-5 min',
      'ATOM': '2-5 min',
      
      // Other networks
      'NEAR PROTOCOL': '1-3 min',
      'NEAR': '1-3 min',
      'ALGORAND': '1-3 min',
      'ALGO': '1-3 min',
      'STELLAR': '1-3 min',
      'XLM': '1-3 min',
      'SUI': '1-3 min',
      'APTOS': '1-3 min',
      'TON': '1-3 min',
      'ZETACHAIN': '2-5 min',
      'ZILLIQA': '3-8 min',
      'X LAYER': '2-5 min',
      'UNICHAIN': '2-5 min',
    };
    
    // Try to get withdrawal time by network, then by coin
    let withdrawalTime = withdrawalTimes[cleanNetwork] || withdrawalTimes[cleanCoin];
    
    // If still not found, categorize by network type
    // If still not found, categorize by network type
    if (!withdrawalTime) {
      if (cleanNetwork.includes('ERC') || cleanNetwork.includes('ETHEREUM')) {
        withdrawalTime = '3-8 min';
      } else if (cleanNetwork.includes('BSC') || cleanNetwork.includes('BNB')) {
        withdrawalTime = '1-3 min';
      } else if (cleanNetwork.includes('TRC') || cleanNetwork.includes('TRON')) {
        withdrawalTime = '1-3 min';
      } else if (cleanNetwork.includes('POLYGON') || cleanNetwork.includes('MATIC')) {
        withdrawalTime = '1-2 min';
      } else if (cleanNetwork.includes('ARBITRUM') || cleanNetwork.includes('OPTIMISM')) {
        withdrawalTime = '2-5 min';
      } else if (cleanNetwork.includes('AVALANCHE') || cleanNetwork.includes('AVAX')) {
        withdrawalTime = '1-3 min';
      } else {
        // Default fallback
        withdrawalTime = '3-10 min';
      }
    }
    
    return withdrawalTime;
  }

  // Fallback data if API fails
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
      // Add more fallback currencies as needed
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

export const okxApiService = new OKXApiService();