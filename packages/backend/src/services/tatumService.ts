import { logger } from '../utils/logger';
import { supabase } from '../config/database';
import * as crypto from 'crypto';

// Tatum API types
interface TatumWalletResponse {
  address: string;
  privateKey: string;
  currency: string;
}

interface TatumWebhookResponse {
  id: string;
  type: string;
  url: string;
  currency: string;
  address?: string;
}

interface PaymentOrder {
  id: string;
  server_id: string;
  user_id: string;
  expected_amount: number;
  status: string;
  crypto_info: any;
  expires_at: string;
}

interface TatumApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: any;
}

interface CurrencyConfig {
  ticker: string;
  mainnet: string;
  testnet: string;
  endpoint: string;
}

interface PriceConversionResult {
  amount: number;
  rate: number;
  source: string;
  at: string;
}

export class TatumService {
  private apiKey: string;
  private baseUrl: string;
  private notifBaseUrl: string;
  private encryptionKey: string;
  private isTestnet: boolean;
  private currencyConfigs: Map<string, CurrencyConfig>;

  constructor() {
    this.apiKey = process.env.TATUM_API_KEY || '';
    this.baseUrl = process.env.TATUM_API_BASE || 'https://api.tatum.io/v3';
    this.notifBaseUrl = process.env.TATUM_NOTIF_BASE || 'https://api.tatum.io/v4';
    this.encryptionKey = process.env.TATUM_WEBHOOK_SECRET || 'fallback-encryption-key';
    this.isTestnet = process.env.NODE_ENV !== 'production';
    this.currencyConfigs = this.initializeCurrencyConfigs();

    if (!this.apiKey) {
      logger.warn('TATUM_API_KEY not configured - using mock mode');
    }

    logger.info('TatumService initialized', {
      isTestnet: this.isTestnet,
      apiKeyConfigured: !!this.apiKey,
      paymentPolicy: 'Exact payment required - no tolerance for underpayment'
    });
  }

  /**
   * Initialize currency configurations
   */
  private initializeCurrencyConfigs(): Map<string, CurrencyConfig> {
    const configs = new Map<string, CurrencyConfig>();

    const currencies = [
      { keys: ['ALGO', 'ALGORAND'], ticker: 'ALGO', mainnet: 'algorand-mainnet', testnet: 'algorand-testnet', endpoint: 'algorand' },
      { keys: ['ETH', 'ETHEREUM'], ticker: 'ETH', mainnet: 'ethereum-mainnet', testnet: 'ethereum-sepolia', endpoint: 'ethereum' },
      { keys: ['BTC', 'BITCOIN'], ticker: 'BTC', mainnet: 'bitcoin-mainnet', testnet: 'bitcoin-testnet', endpoint: 'bitcoin' },
      { keys: ['MATIC', 'POLYGON'], ticker: 'MATIC', mainnet: 'polygon-mainnet', testnet: 'polygon-amoy', endpoint: 'polygon' },
      { keys: ['BNB', 'BSC', 'BINANCE'], ticker: 'BSC', mainnet: 'bsc-mainnet', testnet: 'bsc-testnet', endpoint: 'bsc' },
      { keys: ['SOL', 'SOLANA'], ticker: 'SOL', mainnet: 'solana-mainnet', testnet: 'solana-devnet', endpoint: 'solana' },
      { keys: ['TRX', 'TRON'], ticker: 'TRON', mainnet: 'tron-mainnet', testnet: 'tron-shasta', endpoint: 'tron' },
      { keys: ['XRP'], ticker: 'XRP', mainnet: 'xrp-mainnet', testnet: 'xrp-testnet', endpoint: 'xrp' },
      { keys: ['ADA', 'CARDANO'], ticker: 'ADA', mainnet: 'cardano-mainnet', testnet: 'cardano-preprod', endpoint: 'cardano' },
      { keys: ['DOGE'], ticker: 'DOGE', mainnet: 'dogecoin-mainnet', testnet: 'dogecoin-testnet', endpoint: 'dogecoin' },
      { keys: ['LTC'], ticker: 'LTC', mainnet: 'litecoin-mainnet', testnet: 'litecoin-testnet', endpoint: 'litecoin' },
      { keys: ['AVAX', 'AVALANCHE'], ticker: 'AVAX', mainnet: 'avalanche-c', testnet: 'avalanche-fuji', endpoint: 'avalanche' },
      { keys: ['FTM', 'FANTOM'], ticker: 'FTM', mainnet: 'fantom-mainnet', testnet: 'fantom-testnet', endpoint: 'fantom' },
      { keys: ['FLR', 'FLARE'], ticker: 'FLR', mainnet: 'flare-mainnet', testnet: 'flare-coston', endpoint: 'flare' },
      { keys: ['KAI', 'KAIA', 'KLAY', 'KLAYTN'], ticker: 'KLAY', mainnet: 'kaia-mainnet', testnet: 'kaia-baobab', endpoint: 'klaytn' },
      { keys: ['XLM', 'STELLAR'], ticker: 'XLM', mainnet: 'stellar-mainnet', testnet: 'stellar-testnet', endpoint: 'stellar' },
      { keys: ['CELO'], ticker: 'CELO', mainnet: 'celo-mainnet', testnet: 'celo-alfajores', endpoint: 'celo' },
      // Layer 2 and additional EVM chains
      { keys: ['ARBITRUM'], ticker: 'ETH', mainnet: 'arbitrum-one', testnet: 'arbitrum-sepolia', endpoint: 'ethereum' },
      { keys: ['BASE'], ticker: 'ETH', mainnet: 'base-mainnet', testnet: 'base-sepolia', endpoint: 'ethereum' },
      { keys: ['OPTIMISM'], ticker: 'ETH', mainnet: 'optimism-mainnet', testnet: 'optimism-sepolia', endpoint: 'ethereum' },
      // Stablecoins (multi-chain support)
      { keys: ['USDT'], ticker: 'USDT', mainnet: 'ethereum-mainnet', testnet: 'ethereum-sepolia', endpoint: 'ethereum' },
      { keys: ['USDC'], ticker: 'USDC', mainnet: 'ethereum-mainnet', testnet: 'ethereum-sepolia', endpoint: 'ethereum' },
      { keys: ['PYUSD'], ticker: 'PYUSD', mainnet: 'ethereum-mainnet', testnet: 'ethereum-sepolia', endpoint: 'ethereum' }
    ];

    currencies.forEach(({ keys, ticker, mainnet, testnet, endpoint }) => {
      const config: CurrencyConfig = { ticker, mainnet, testnet, endpoint };
      keys.forEach(key => configs.set(key.toUpperCase(), config));
    });

    return configs;
  }

  /**
   * Get currency configuration
   */
  private getCurrencyConfig(currency: string): CurrencyConfig {
    const config = this.currencyConfigs.get(currency.toUpperCase());
    return config || this.currencyConfigs.get('ETH')!; // Default to ETH
  }

  /**
   * Make API request with consistent error handling
   */
  private async makeApiRequest<T>(
    url: string,
    options: RequestInit = {},
    fallbackValue?: T
  ): Promise<TatumApiResponse<T>> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          ...options.headers
        }
      });

      // Read raw text once, then attempt JSON parse
      const raw = await response.text().catch(() => '');
      let data: any = null;
      let error: any = null;
      if (response.ok) {
        try { data = raw ? JSON.parse(raw) : null; } catch { data = raw as any; }
      } else {
        try { error = raw ? JSON.parse(raw) : { message: `HTTP ${response.status}` }; }
        catch { error = { message: `HTTP ${response.status}`, rawBody: raw }; }
      }

      const result = {
        ok: response.ok,
        status: response.status,
        data,
        error
      } as TatumApiResponse<T>;

      if (!response.ok) {
        // Enhanced logging for common Tatum API issues
        const logLevel = response.status === 404 ? 'info' : 'warn';
        logger[logLevel]('Tatum API non-OK response', {
          url: url.replace(this.baseUrl, ''), // Remove base URL for cleaner logs
          status: response.status,
          error: (result as any)?.error,
          isWalletEndpoint: url.includes('/wallet'),
          hasApiKey: !!this.apiKey
        });
      }

      return result;
    } catch (error) {
      logger.error('API request failed:', {
        url: url.replace(this.baseUrl, ''),
        error: error instanceof Error ? error.message : error,
        hasApiKey: !!this.apiKey
      });
      return {
        ok: false,
        status: 0,
        error,
        data: fallbackValue
      };
    }
  }

  /**
   * Check if should use mock mode
   * Note: For address generation, we always use "mock" mode since Tatum chain endpoints don't exist
   */
  private shouldUseMockMode(additionalCheck?: boolean): boolean {
    const forceMock = String(process.env.TATUM_USE_MOCK || '').toLowerCase() === 'true';
    const forceReal = String(process.env.TATUM_USE_REAL || '').toLowerCase() === 'true';
    if (forceMock) return true;
    if (forceReal) return false;
    // Default behavior: mock when no key, or in dev unless explicitly forced real
    return !this.apiKey || (process.env.NODE_ENV === 'development' && !forceReal) || additionalCheck === true;
  }

  /**
   * Generate HD wallet or address with proper Tatum API endpoints
   */
  private async generateWalletOrAddress(
    currency: string = 'ETH',
    type: 'wallet' | 'address' = 'wallet',
    index?: number,
    userIdForCustomer?: string
  ): Promise<TatumWalletResponse> {
<<<<<<< Updated upstream
    // Always generate mock addresses since Tatum chain endpoints don't exist
    logger.info(`Generating ${type} address directly (Tatum chain endpoints unavailable)`, {
      currency,
      index,
      type
    });

    return this.generateMockWallet(currency);
=======
    const shouldMock = this.shouldUseMockMode();
    const derivedIndex = typeof index === 'number' ? index : 0;
    const chain = this.getChainName(currency);
    const config = this.getCurrencyConfig(currency);

    if (shouldMock) {
      const mockAddress = this.generateMockAddress(currency);
      const mockPrivateKey = crypto.randomBytes(32).toString('hex');

      logger.warn('Tatum mock mode enabled - returning generated development wallet', {
        currency,
        index: derivedIndex,
        type,
        chain,
      });

      return {
        address: mockAddress,
        privateKey: mockPrivateKey,
        currency,
      };
    }

    try {
      // Step 1: Generate a mnemonic phrase first (12 words)
      const mnemonic = this.generateMnemonic();

      // Step 2: Get xpub from Tatum using the mnemonic (GET request with query params)
      const walletEndpoint = this.getWalletGenerationEndpoint(currency);
      const chainName = this.getChainName(currency);

      // Build query parameters for GET request
      const params = new URLSearchParams({
        mnemonic: mnemonic,
        ...(this.isTestnet && { testnetType: chainName })
      });

      const walletResponse = await this.makeApiRequest<{
        mnemonic: string;
        xpub: string;
      }>(
        `${this.baseUrl}${walletEndpoint}?${params.toString()}`,
        { method: 'GET' }
      );

      if (!walletResponse.ok || !walletResponse.data) {
        // If the API endpoint doesn't exist (404) or fails, use fallback immediately
        if (walletResponse.status === 404) {
          logger.warn(`Tatum wallet endpoint not available for ${currency}, using fallback generation`, {
            currency,
            endpoint: walletEndpoint,
            status: walletResponse.status,
            error: walletResponse.error
          });
          const fallbackAddress = this.generateMockAddress(currency);
          return {
            address: fallbackAddress,
            privateKey: '',
            currency,
          };
        }
        throw new Error(`Failed to create HD wallet via Tatum: ${walletResponse.status} - ${JSON.stringify(walletResponse.error)}`);
      }

      const walletData = walletResponse.data;
      const xpub = walletData.xpub;
      let address: string | undefined;
      let privateKey: string | undefined;

      logger.info('Tatum wallet generation response', {
        currency,
        endpoint: walletEndpoint,
        hasMnemonic: !!mnemonic,
        hasXpub: !!xpub,
        chainName,
        isTestnet: this.isTestnet
      });

      // Step 2: If we have xpub but no address, derive address from xpub
      if (!address && xpub) {
        const addressEndpoint = this.getAddressDerivationEndpoint(currency, xpub, derivedIndex);
        const addressResponse = await this.makeApiRequest<any>(
          `${this.baseUrl}${addressEndpoint}`,
          { method: 'GET' }
        );

        if (addressResponse.ok && addressResponse.data) {
          // Handle different response formats
          address = typeof addressResponse.data === 'string'
            ? addressResponse.data
            : addressResponse.data.address;
        }
      }

      // Step 3: If we need private key and have mnemonic, derive private key
      if (!privateKey && mnemonic && type === 'wallet') {
        const privKeyEndpoint = this.getPrivateKeyDerivationEndpoint(currency);
        const privResponse = await this.makeApiRequest<any>(
          `${this.baseUrl}${privKeyEndpoint}`,
          {
            method: 'POST',
            body: JSON.stringify({
              mnemonic,
              index: derivedIndex,
              ...(currency === 'BTC' && { testnet: this.isTestnet })
            })
          }
        );

        if (privResponse.ok && privResponse.data) {
          privateKey = typeof privResponse.data === 'string'
            ? privResponse.data
            : privResponse.data.key || privResponse.data.privateKey;
        }
      }

      // Step 4: Fallback address generation if still no address
      if (!address) {
        address = await this.generateFallbackAddress(currency, derivedIndex);
      }

      if (!address) {
        throw new Error('Failed to generate or derive wallet address');
      }

      logger.info('Generated Tatum HD wallet', {
        currency,
        chain,
        type,
        index: derivedIndex,
        hasPrivateKey: !!privateKey,
        hasXpub: !!xpub,
        userIdForCustomer
      });

      return {
        address,
        privateKey: privateKey || '',
        currency,
      };
    } catch (error) {
      logger.error('Failed to generate HD wallet via Tatum', {
        currency,
        chain,
        index: derivedIndex,
        type,
        error: error instanceof Error ? error.message : error
      });

      // Fallback to mock address generation
      logger.warn('Using fallback address generation', { currency, chain, index: derivedIndex, method: 'fallback_generation' });
      const fallbackAddress = this.generateMockAddress(currency);
      return {
        address: fallbackAddress,
        privateKey: '',
        currency,
      };
    }
>>>>>>> Stashed changes
  }

  /**
   * Get the correct wallet generation endpoint for each currency
   * Based on official Tatum v3 API documentation
   */
  private getWalletGenerationEndpoint(currency: string): string {
    const endpoints: Record<string, string> = {
      // Bitcoin and forks - POST /v3/{chain}/wallet
      'BTC': '/bitcoin/wallet',
      'LTC': '/litecoin/wallet',
      'DOGE': '/dogecoin/wallet',

      // Ethereum and EVM chains - POST /v3/{chain}/wallet  
      'ETH': '/ethereum/wallet',
      'MATIC': '/polygon/wallet',
      'BNB': '/bsc/wallet',
      'AVAX': '/avalanche/wallet',
      'FTM': '/fantom/wallet',
      'FLR': '/flare/wallet',
      'CELO': '/celo/wallet',

      // Other chains - POST /v3/{chain}/wallet
      'ADA': '/cardano/wallet',
      'SOL': '/solana/wallet',
      'TRX': '/tron/wallet',
      'XRP': '/xrp/wallet',
      'XLM': '/stellar/wallet',
      'ALGO': '/algorand/wallet',
      'KAI': '/klaytn/wallet',

      // Stablecoins (use base chain)
      'USDT': '/ethereum/wallet',
      'USDC': '/ethereum/wallet',
      'PYUSD': '/ethereum/wallet',
    };

    return endpoints[currency.toUpperCase()] || '/ethereum/wallet';
  }

  /**
   * Get the correct address derivation endpoint
   */
  private getAddressDerivationEndpoint(currency: string, xpub: string, index: number): string {
    const endpoints: Record<string, string> = {
      'BTC': `/bitcoin/address/${xpub}/${index}`,
      'LTC': `/litecoin/address/${xpub}/${index}`,
      'DOGE': `/dogecoin/address/${xpub}/${index}`,
      'ETH': `/ethereum/address/${xpub}/${index}`,
      'MATIC': `/polygon/address/${xpub}/${index}`,
      'BNB': `/bsc/address/${xpub}/${index}`,
      'AVAX': `/avalanche/address/${xpub}/${index}`,
      'FTM': `/fantom/address/${xpub}/${index}`,
      'FLR': `/flare/address/${xpub}/${index}`,
      'CELO': `/celo/address/${xpub}/${index}`,
      'ADA': `/cardano/address/${xpub}/${index}`,
      'SOL': `/solana/address/${xpub}/${index}`,
      'TRX': `/tron/address/${xpub}/${index}`,
      'XRP': `/xrp/address/${xpub}/${index}`,
      'XLM': `/stellar/address/${xpub}/${index}`,
      'ALGO': `/algorand/address/${xpub}/${index}`,
      'KAI': `/klaytn/address/${xpub}/${index}`,
    };

    const base = endpoints[currency.toUpperCase()] || `/ethereum/address/${xpub}/${index}`;
    return base;
  }

  /**
   * Get the correct private key derivation endpoint
   */
  private getPrivateKeyDerivationEndpoint(currency: string): string {
    const endpoints: Record<string, string> = {
      'BTC': '/bitcoin/wallet/priv',
      'LTC': '/litecoin/wallet/priv',
      'DOGE': '/dogecoin/wallet/priv',
      'ETH': '/ethereum/wallet/priv',
      'MATIC': '/polygon/wallet/priv',
      'BNB': '/bsc/wallet/priv',
      'AVAX': '/avalanche/wallet/priv',
      'FTM': '/fantom/wallet/priv',
      'FLR': '/flare/wallet/priv',
      'CELO': '/celo/wallet/priv',
      'ADA': '/cardano/wallet/priv',
      'SOL': '/solana/wallet/priv',
      'TRX': '/tron/wallet/priv',
      'XRP': '/xrp/wallet/priv',
      'XLM': '/stellar/wallet/priv',
      'ALGO': '/algorand/wallet/priv',
      'KAI': '/klaytn/wallet/priv',
    };

    return endpoints[currency.toUpperCase()] || '/ethereum/wallet/priv';
  }

  /**
   * Generate mock address based on currency type
   */
  private generateMockAddress(currency: string): string {
    const upperCurrency = currency.toUpperCase();

    // Bitcoin-like addresses
    if (['BTC', 'LTC', 'DOGE'].includes(upperCurrency)) {
      return this.isTestnet ? `tb1q${crypto.randomBytes(16).toString('hex')}` : `bc1q${crypto.randomBytes(16).toString('hex')}`;
    }

    // Ethereum-like addresses (EVM chains)
    if (['ETH', 'MATIC', 'BNB', 'AVAX', 'FTM', 'FLR', 'CELO', 'USDT', 'USDC', 'PYUSD'].includes(upperCurrency)) {
      return `0x${crypto.randomBytes(20).toString('hex')}`;
    }

    // Solana addresses
    if (upperCurrency === 'SOL') {
      return crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '').slice(0, 44);
    }

    // Tron addresses
    if (['TRX', 'TRON'].includes(upperCurrency)) {
      return `T${crypto.randomBytes(20).toString('hex')}`;
    }

    // XRP addresses
    if (upperCurrency === 'XRP') {
      return `r${crypto.randomBytes(20).toString('hex')}`;
    }

    // Cardano addresses
    if (upperCurrency === 'ADA') {
      return `addr1${crypto.randomBytes(28).toString('hex')}`;
    }

    // Stellar addresses
    if (upperCurrency === 'XLM') {
      return `G${crypto.randomBytes(28).toString('base64').replace(/[+/=]/g, '').slice(0, 55)}`;
    }

    // Algorand addresses
    if (upperCurrency === 'ALGO') {
      return crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '').slice(0, 58);
    }

    // Default to Ethereum-like
    return `0x${crypto.randomBytes(20).toString('hex')}`;
  }

  /**
   * Generate a BIP39 mnemonic phrase (12 words)
   */
  private generateMnemonic(): string {
    // BIP39 wordlist (simplified - using common English words)
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
      'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
      'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
      'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'against', 'age',
      'agent', 'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol',
      'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also',
      'alter', 'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient',
      'anger', 'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna',
      'antique', 'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch',
      'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange',
      'arrest', 'arrive', 'arrow', 'art', 'article', 'artist', 'artwork', 'ask', 'aspect', 'assault',
      'asset', 'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract',
      'auction', 'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid',
      'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon',
      'badge', 'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely',
      'bargain', 'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because',
      'become', 'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench',
      'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind',
      'biology', 'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak',
      'bless', 'blind', 'blood', 'blossom', 'blow', 'blue', 'blur', 'blush', 'board', 'boat',
      'body', 'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow',
      'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass', 'brave',
      'bread', 'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring', 'brisk', 'broccoli', 'broken',
      'bronze', 'broom', 'brother', 'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build',
      'bulb', 'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business',
      'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus', 'cage', 'cake',
      'call', 'calm', 'camera', 'camp', 'can', 'canal', 'cancel', 'candy', 'cannon', 'canoe',
      'canvas', 'canyon', 'capable', 'capital', 'captain', 'car', 'carbon', 'card', 'care', 'career',
      'careful', 'careless', 'cargo', 'carpet', 'carry', 'cart', 'case', 'cash', 'casino', 'cast',
      'casual', 'cat', 'catalog', 'catch', 'category', 'cattle', 'caught', 'cause', 'caution', 'cave',
      'ceiling', 'celery', 'cement', 'census', 'century', 'cereal', 'certain', 'chair', 'chalk', 'champion',
      'change', 'chaos', 'chapter', 'charge', 'chase', 'chat', 'cheap', 'check', 'cheese', 'chef',
      'cherry', 'chest', 'chicken', 'chief', 'child', 'chimney', 'choice', 'choose', 'chronic', 'chuckle',
      'chunk', 'churn', 'cigar', 'cinnamon', 'circle', 'citizen', 'city', 'civil', 'claim', 'clamp',
      'clarify', 'clash', 'class', 'clause', 'clean', 'clerk', 'clever', 'click', 'client', 'cliff',
      'climb', 'clinic', 'clip', 'clock', 'clog', 'close', 'cloth', 'cloud', 'clown', 'club',
      'clump', 'cluster', 'clutch', 'coach', 'coast', 'coconut', 'code', 'coffee', 'coil', 'coin',
      'collect', 'color', 'column', 'combine', 'come', 'comfort', 'comic', 'common', 'company', 'concert',
      'conduct', 'confirm', 'congress', 'connect', 'consider', 'control', 'convince', 'cook', 'cool', 'copper',
      'copy', 'coral', 'core', 'corn', 'correct', 'cost', 'cotton', 'couch', 'country', 'couple',
      'course', 'cousin', 'cover', 'coyote', 'crack', 'cradle', 'craft', 'cram', 'crane', 'crash',
      'crater', 'crawl', 'crazy', 'cream', 'credit', 'creek', 'crew', 'cricket', 'crime', 'crisp',
      'critic', 'crop', 'cross', 'crouch', 'crowd', 'crucial', 'cruel', 'cruise', 'crumble', 'crunch',
      'crush', 'cry', 'crystal', 'cube', 'culture', 'cup', 'cupboard', 'curious', 'current', 'curtain',
      'curve', 'cushion', 'custom', 'cute', 'cycle', 'dad', 'damage', 'damp', 'dance', 'danger',
      'daring', 'dash', 'daughter', 'dawn', 'day', 'deal', 'debate', 'debris', 'decade', 'december',
      'decide', 'decline', 'decorate', 'decrease', 'deer', 'defense', 'define', 'defy', 'degree', 'delay',
      'deliver', 'demand', 'demise', 'denial', 'dentist', 'deny', 'depart', 'depend', 'deposit', 'depth',
      'deputy', 'derive', 'describe', 'desert', 'design', 'desk', 'despair', 'destroy', 'detail', 'detect',
      'develop', 'device', 'devote', 'diagram', 'dial', 'diamond', 'diary', 'dice', 'diesel', 'diet',
      'differ', 'digital', 'dignity', 'dilemma', 'dinner', 'dinosaur', 'direct', 'dirt', 'disagree', 'discover',
      'disease', 'dish', 'dismiss', 'disorder', 'display', 'distance', 'divert', 'divide', 'divorce', 'dizzy',
      'doctor', 'document', 'dog', 'doll', 'dolphin', 'domain', 'donate', 'donkey', 'donor', 'door',
      'dose', 'double', 'dove', 'draft', 'dragon', 'drama', 'drape', 'draw', 'dream', 'dress',
      'drift', 'drill', 'drink', 'drip', 'drive', 'drop', 'drum', 'dry', 'duck', 'dumb',
      'dune', 'during', 'dust', 'dutch', 'duty', 'dwarf', 'dynamic', 'eager', 'eagle', 'early',
      'earn', 'earth', 'easily', 'east', 'easy', 'echo', 'ecology', 'economy', 'edge', 'edit',
      'educate', 'effort', 'egg', 'eight', 'either', 'elbow', 'elder', 'electric', 'elegant', 'element',
      'elephant', 'elevator', 'elite', 'else', 'embark', 'embody', 'embrace', 'emerge', 'emotion', 'employ',
      'empower', 'empty', 'enable', 'enact', 'end', 'endless', 'endorse', 'enemy', 'energy', 'enforce',
      'engage', 'engine', 'enhance', 'enjoy', 'enlist', 'enough', 'enrich', 'enroll', 'ensure', 'enter',
      'entire', 'entry', 'envelope', 'episode', 'equal', 'equip', 'era', 'erase', 'erode', 'erosion',
      'error', 'erupt', 'escape', 'essay', 'essence', 'estate', 'eternal', 'ethics', 'evidence', 'evil',
      'evoke', 'evolve', 'exact', 'example', 'excess', 'exchange', 'excite', 'exclude', 'excuse', 'execute',
      'exercise', 'exhaust', 'exhibit', 'exile', 'exist', 'exit', 'exotic', 'expand', 'expect', 'expire',
      'explain', 'expose', 'express', 'extend', 'extra', 'eye', 'eyebrow', 'fabric', 'face', 'faculty',
      'fade', 'faint', 'faith', 'fall', 'false', 'fame', 'family', 'famous', 'fan', 'fancy',
      'fantasy', 'farm', 'fashion', 'fat', 'fatal', 'father', 'fatigue', 'fault', 'favorite', 'feature',
      'february', 'federal', 'fee', 'feed', 'feel', 'female', 'fence', 'festival', 'fetch', 'fever',
      'few', 'fiber', 'fiction', 'field', 'figure', 'file', 'fill', 'film', 'filter', 'final',
      'find', 'fine', 'finger', 'finish', 'fire', 'firm', 'first', 'fiscal', 'fish', 'fit',
      'fitness', 'fix', 'flag', 'flame', 'flat', 'flavor', 'flee', 'flight', 'flip', 'float',
      'flock', 'floor', 'flower', 'fluid', 'flush', 'fly', 'foam', 'focus', 'fog', 'foil',
      'fold', 'follow', 'food', 'foot', 'force', 'forest', 'forget', 'fork', 'fortune', 'forum',
      'forward', 'fossil', 'foster', 'found', 'fox', 'frame', 'frequent', 'fresh', 'friend', 'fringe',
      'frog', 'front', 'frost', 'frown', 'frozen', 'fruit', 'fuel', 'fun', 'funny', 'furnace',
      'fury', 'future', 'gadget', 'gain', 'galaxy', 'gallery', 'game', 'gap', 'garage', 'garbage',
      'garden', 'garlic', 'garment', 'gas', 'gasp', 'gate', 'gather', 'gauge', 'gaze', 'general',
      'genius', 'genre', 'gentle', 'genuine', 'gesture', 'ghost', 'giant', 'gift', 'giggle', 'ginger',
      'giraffe', 'girl', 'give', 'glad', 'glance', 'glare', 'glass', 'glide', 'glimpse', 'globe',
      'gloom', 'glory', 'glove', 'glow', 'glue', 'goat', 'goddess', 'gold', 'good', 'goose',
      'gorilla', 'gospel', 'gossip', 'govern', 'gown', 'grab', 'grace', 'grain', 'grant', 'grape',
      'grass', 'gravity', 'great', 'green', 'grid', 'grief', 'grit', 'grocery', 'group', 'grow',
      'grunt', 'guard', 'guess', 'guide', 'guilt', 'guitar', 'gun', 'gym', 'habit', 'hair',
      'half', 'hammer', 'hamster', 'hand', 'happy', 'harbor', 'hard', 'harsh', 'harvest', 'hat',
      'have', 'hawk', 'hazard', 'head', 'health', 'heart', 'heavy', 'hedgehog', 'height', 'held',
      'help', 'hen', 'hero', 'hidden', 'high', 'hill', 'hint', 'hip', 'hire', 'history',
      'hobby', 'hockey', 'hold', 'hole', 'holiday', 'hollow', 'home', 'honey', 'hood', 'hope',
      'horn', 'horror', 'horse', 'hospital', 'host', 'hotel', 'hour', 'hover', 'hub', 'huge',
      'human', 'humble', 'humor', 'hundred', 'hungry', 'hunt', 'hurdle', 'hurry', 'hurt', 'husband',
      'hybrid', 'ice', 'icon', 'idea', 'identify', 'idle', 'ignore', 'ill', 'illegal', 'illness',
      'image', 'imitate', 'immense', 'immune', 'impact', 'impose', 'improve', 'impulse', 'inch', 'include',
      'income', 'increase', 'index', 'indicate', 'indoor', 'industry', 'infant', 'inflict', 'inform', 'inhale',
      'inherit', 'initial', 'inject', 'injury', 'inmate', 'inner', 'innocent', 'input', 'inquiry', 'insane',
      'insect', 'inside', 'inspire', 'install', 'intact', 'interest', 'into', 'invest', 'invite', 'involve',
      'iron', 'island', 'isolate', 'issue', 'item', 'ivory', 'jacket', 'jaguar', 'jar', 'jazz',
      'jealous', 'jeans', 'jelly', 'jewel', 'job', 'join', 'joke', 'journey', 'joy', 'judge',
      'juice', 'jump', 'jungle', 'junior', 'junk', 'just', 'kangaroo', 'keen', 'keep', 'ketchup',
      'key', 'kick', 'kid', 'kidney', 'kind', 'kingdom', 'kiss', 'kit', 'kitchen', 'kite',
      'kitten', 'kiwi', 'knee', 'knife', 'knock', 'know', 'lab', 'label', 'labor', 'ladder',
      'lady', 'lake', 'lamp', 'language', 'laptop', 'large', 'later', 'latin', 'laugh', 'laundry',
      'lava', 'law', 'lawn', 'lawsuit', 'layer', 'lazy', 'leader', 'leaf', 'learn', 'leave',
      'lecture', 'left', 'leg', 'legal', 'legend', 'leisure', 'lemon', 'lend', 'length', 'lens',
      'leopard', 'lesson', 'letter', 'level', 'liar', 'liberty', 'library', 'license', 'life', 'lift',
      'light', 'like', 'limb', 'limit', 'link', 'lion', 'liquid', 'list', 'little', 'live',
      'lizard', 'load', 'loan', 'lobster', 'local', 'lock', 'logic', 'lonely', 'long', 'loop',
      'lottery', 'loud', 'lounge', 'love', 'loyal', 'lucky', 'luggage', 'lumber', 'lunar', 'lunch',
      'luxury', 'lying', 'machine', 'mad', 'magic', 'magnet', 'maid', 'mail', 'main', 'major',
      'make', 'mammal', 'man', 'manage', 'mandate', 'mango', 'mansion', 'manual', 'maple', 'marble',
      'march', 'margin', 'marine', 'market', 'marriage', 'mask', 'mass', 'master', 'match', 'material',
      'math', 'matrix', 'matter', 'maximum', 'maze', 'meadow', 'mean', 'measure', 'meat', 'mechanic',
      'medal', 'media', 'melody', 'melt', 'member', 'memory', 'mention', 'menu', 'mercy', 'merge',
      'merit', 'merry', 'mesh', 'message', 'metal', 'method', 'middle', 'midnight', 'milk', 'million',
      'mimic', 'mind', 'minimum', 'minor', 'minute', 'miracle', 'mirror', 'misery', 'miss', 'mistake',
      'mix', 'mixed', 'mixture', 'mobile', 'model', 'modify', 'mom', 'moment', 'monitor', 'monkey',
      'monster', 'month', 'moon', 'moral', 'more', 'morning', 'mosquito', 'mother', 'motion', 'motor',
      'mountain', 'mouse', 'move', 'movie', 'much', 'muffin', 'mule', 'multiply', 'muscle', 'museum',
      'mushroom', 'music', 'must', 'mutual', 'myself', 'mystery', 'myth', 'naive', 'name', 'napkin',
      'narrow', 'nasty', 'nation', 'nature', 'near', 'neck', 'need', 'negative', 'neglect', 'neither',
      'nephew', 'nerve', 'nest', 'net', 'network', 'neutral', 'never', 'news', 'next', 'nice',
      'night', 'noble', 'noise', 'nominee', 'noodle', 'normal', 'north', 'nose', 'notable', 'note',
      'nothing', 'notice', 'novel', 'now', 'nuclear', 'number', 'nurse', 'nut', 'oak', 'obey',
      'object', 'oblige', 'obscure', 'observe', 'obtain', 'obvious', 'occur', 'ocean', 'october', 'odor',
      'off', 'offer', 'office', 'often', 'oil', 'okay', 'old', 'olive', 'olympic', 'omit',
      'once', 'one', 'onion', 'online', 'only', 'open', 'opera', 'opinion', 'oppose', 'option',
      'orange', 'orbit', 'orchard', 'order', 'ordinary', 'organ', 'orient', 'original', 'orphan', 'ostrich',
      'other', 'outdoor', 'outer', 'output', 'outside', 'oval', 'oven', 'over', 'own', 'owner',
      'oxygen', 'oyster', 'ozone', 'pact', 'paddle', 'page', 'pair', 'palace', 'palm', 'panda',
      'panel', 'panic', 'panther', 'paper', 'parade', 'parent', 'park', 'parrot', 'part', 'party',
      'pass', 'patch', 'path', 'patient', 'patrol', 'pattern', 'pause', 'pave', 'payment', 'peace',
      'peanut', 'pear', 'peasant', 'pelican', 'pen', 'penalty', 'pencil', 'people', 'pepper', 'perfect',
      'permit', 'person', 'pet', 'phone', 'photo', 'phrase', 'physical', 'piano', 'picnic', 'picture',
      'piece', 'pig', 'pigeon', 'pill', 'pilot', 'pink', 'pioneer', 'pipe', 'pistol', 'pitch',
      'pizza', 'place', 'planet', 'plastic', 'plate', 'play', 'please', 'pledge', 'pluck', 'plug',
      'plunge', 'poem', 'poet', 'point', 'polar', 'pole', 'police', 'pond', 'pony', 'pool',
      'popular', 'portion', 'position', 'possible', 'post', 'potato', 'pottery', 'poverty', 'powder', 'power',
      'practice', 'praise', 'predict', 'prefer', 'prepare', 'present', 'pretty', 'prevent', 'price', 'pride',
      'primary', 'print', 'priority', 'prison', 'private', 'prize', 'problem', 'process', 'produce', 'profit',
      'program', 'project', 'promote', 'proof', 'property', 'prosper', 'protect', 'proud', 'provide', 'public',
      'pudding', 'pull', 'pulp', 'pulse', 'pumpkin', 'punch', 'pupil', 'puppy', 'purchase', 'purity',
      'purpose', 'purse', 'push', 'put', 'puzzle', 'pyramid', 'quality', 'quantum', 'quarter', 'question',
      'quick', 'quiet', 'quilt', 'quit', 'quiz', 'quote', 'rabbit', 'raccoon', 'race', 'rack',
      'radar', 'radio', 'rail', 'rain', 'raise', 'rally', 'ramp', 'ranch', 'random', 'range',
      'rapid', 'rare', 'rate', 'rather', 'raven', 'raw', 'razor', 'ready', 'real', 'reason',
      'rebel', 'rebuild', 'recall', 'receive', 'recipe', 'record', 'recycle', 'reduce', 'reflect', 'reform',
      'refuse', 'region', 'regret', 'regular', 'reject', 'relax', 'release', 'relief', 'rely', 'remain',
      'remember', 'remind', 'remove', 'render', 'renew', 'rent', 'reopen', 'repair', 'repeat', 'replace',
      'report', 'require', 'rescue', 'resemble', 'resist', 'resource', 'response', 'result', 'retire', 'retreat',
      'return', 'reunion', 'reveal', 'review', 'reward', 'rhythm', 'rib', 'ribbon', 'rice', 'rich',
      'ride', 'ridge', 'rifle', 'right', 'rigid', 'ring', 'riot', 'ripple', 'rise', 'risk',
      'ritual', 'rival', 'river', 'road', 'roast', 'rob', 'robot', 'robust', 'rocket', 'romance',
      'roof', 'rookie', 'room', 'rose', 'rotate', 'rough', 'round', 'route', 'royal', 'rubber',
      'rude', 'rug', 'rule', 'run', 'runway', 'rural', 'sad', 'saddle', 'sadness', 'safe',
      'sail', 'salad', 'salmon', 'salon', 'salt', 'salute', 'same', 'sample', 'sand', 'satisfy',
      'satoshi', 'sauce', 'sausage', 'save', 'say', 'scale', 'scan', 'scare', 'scatter', 'scene',
      'scheme', 'school', 'science', 'scissors', 'scorpion', 'scout', 'scrap', 'screen', 'script', 'scrub',
      'sea', 'search', 'season', 'seat', 'second', 'secret', 'section', 'security', 'seed', 'seek',
      'segment', 'select', 'sell', 'seminar', 'senior', 'sense', 'sentence', 'series', 'service', 'session',
      'settle', 'setup', 'seven', 'shadow', 'shaft', 'shallow', 'share', 'shed', 'shell', 'sheriff',
      'shield', 'shift', 'shine', 'ship', 'shirt', 'shock', 'shoe', 'shoot', 'shop', 'short',
      'shoulder', 'shove', 'shrimp', 'shrug', 'shuffle', 'shy', 'sibling', 'sick', 'side', 'siege',
      'sight', 'sign', 'silent', 'silk', 'silly', 'silver', 'similar', 'simple', 'since', 'sing',
      'siren', 'sister', 'situate', 'six', 'size', 'skate', 'sketch', 'ski', 'skill', 'skin',
      'skirt', 'skull', 'slab', 'slam', 'sleep', 'slender', 'slice', 'slide', 'slight', 'slim',
      'slogan', 'slot', 'slow', 'slush', 'small', 'smart', 'smile', 'smoke', 'smooth', 'snack',
      'snake', 'snap', 'sniff', 'snow', 'soap', 'soccer', 'social', 'sock', 'soda', 'soft',
      'solar', 'sold', 'soldier', 'solid', 'solution', 'solve', 'someone', 'song', 'soon', 'sorry',
      'sort', 'soul', 'sound', 'soup', 'source', 'south', 'space', 'spare', 'spatial', 'spawn',
      'speak', 'special', 'speed', 'spell', 'spend', 'sphere', 'spice', 'spider', 'spike', 'spin',
      'spirit', 'split', 'spoil', 'sponsor', 'spoon', 'sport', 'spot', 'spray', 'spread', 'spring',
      'spy', 'square', 'squeeze', 'squirrel', 'stable', 'stadium', 'staff', 'stage', 'stairs', 'stamp',
      'stand', 'start', 'state', 'stay', 'steak', 'steel', 'stem', 'step', 'stereo', 'stick',
      'still', 'sting', 'stock', 'stomach', 'stone', 'stool', 'story', 'stove', 'strategy', 'street',
      'strike', 'strong', 'struggle', 'student', 'stuff', 'stumble', 'style', 'subject', 'submit', 'subway',
      'success', 'such', 'sudden', 'suffer', 'sugar', 'suggest', 'suit', 'summer', 'sun', 'sunny',
      'sunset', 'super', 'supply', 'supreme', 'sure', 'surface', 'surge', 'surprise', 'surround', 'survey',
      'suspect', 'sustain', 'swallow', 'swamp', 'swap', 'swear', 'sweet', 'swift', 'swim', 'swing',
      'switch', 'sword', 'symbol', 'symptom', 'syrup', 'system', 'table', 'tackle', 'tag', 'tail',
      'talent', 'talk', 'tank', 'tape', 'target', 'task', 'taste', 'tattoo', 'taxi', 'teach',
      'team', 'tell', 'ten', 'tenant', 'tennis', 'tent', 'term', 'test', 'text', 'thank',
      'that', 'theme', 'then', 'theory', 'there', 'they', 'thing', 'this', 'thought', 'three',
      'thrive', 'throw', 'thumb', 'thunder', 'ticket', 'tide', 'tiger', 'tilt', 'timber', 'time',
      'tiny', 'tip', 'tired', 'tissue', 'title', 'toast', 'tobacco', 'today', 'toddler', 'toe',
      'together', 'toilet', 'token', 'tomato', 'tomorrow', 'tone', 'tongue', 'tonight', 'tool', 'tooth',
      'top', 'topic', 'topple', 'torch', 'tornado', 'tortoise', 'toss', 'total', 'tourist', 'toward',
      'tower', 'town', 'toy', 'track', 'trade', 'traffic', 'tragic', 'train', 'transfer', 'trap',
      'trash', 'travel', 'tray', 'treat', 'tree', 'trend', 'trial', 'tribe', 'trick', 'trigger',
      'trim', 'trip', 'trophy', 'trouble', 'truck', 'true', 'truly', 'trumpet', 'trust', 'truth',
      'try', 'tube', 'tuition', 'tumble', 'tuna', 'tunnel', 'turkey', 'turn', 'turtle', 'twelve',
      'twenty', 'twice', 'twin', 'twist', 'two', 'type', 'typical', 'ugly', 'umbrella', 'unable',
      'unaware', 'uncle', 'uncover', 'under', 'undo', 'unfair', 'unfold', 'unhappy', 'uniform', 'unique',
      'unit', 'universe', 'unknown', 'unlock', 'until', 'unusual', 'unveil', 'update', 'upgrade', 'uphold',
      'upon', 'upper', 'upset', 'urban', 'urge', 'usage', 'use', 'used', 'useful', 'useless',
      'usual', 'utility', 'vacant', 'vacuum', 'vague', 'valid', 'valley', 'valve', 'van', 'vanish',
      'vapor', 'various', 'vast', 'vault', 'vehicle', 'velvet', 'vendor', 'venture', 'venue', 'verb',
      'verify', 'version', 'very', 'vessel', 'veteran', 'viable', 'vibe', 'vicious', 'victory', 'video',
      'view', 'village', 'vintage', 'violin', 'virtual', 'virus', 'visa', 'visit', 'visual', 'vital',
      'vivid', 'vocal', 'voice', 'void', 'volcano', 'volume', 'vote', 'voyage', 'wage', 'wagon',
      'wait', 'walk', 'wall', 'walnut', 'want', 'warfare', 'warm', 'warrior', 'wash', 'wasp',
      'waste', 'water', 'wave', 'way', 'wealth', 'weapon', 'wear', 'weasel', 'weather', 'web',
      'wedding', 'weekend', 'weird', 'welcome', 'west', 'wet', 'what', 'wheat', 'wheel', 'when',
      'where', 'whip', 'whisper', 'wide', 'width', 'wife', 'wild', 'will', 'win', 'window',
      'wine', 'wing', 'wink', 'winner', 'winter', 'wire', 'wisdom', 'wise', 'wish', 'witness',
      'wolf', 'woman', 'wonder', 'wood', 'wool', 'word', 'work', 'world', 'worry', 'worth',
      'wrap', 'wreck', 'wrestle', 'wrist', 'write', 'wrong', 'yard', 'year', 'yellow', 'you',
      'young', 'youth', 'zebra', 'zero', 'zone', 'zoo'
    ];

    // Generate 12 random words
    const mnemonic = [];
    for (let i = 0; i < 12; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      mnemonic.push(words[randomIndex]);
    }

    return mnemonic.join(' ');
  }

  /**
   * Generate fallback address when API fails
   */
  private async generateFallbackAddress(currency: string, index: number): Promise<string> {
    logger.warn('Generating fallback address due to API failure', { currency, index });
    return this.generateMockAddress(currency);
  }

  /**
   * Generate a unique wallet address for payment
   */
  async generateWallet(currency: string = 'ETH', userIdForCustomer?: string): Promise<TatumWalletResponse> {
    return this.generateWalletOrAddress(currency, 'wallet', undefined, userIdForCustomer);
  }

  /**
   * Generate address from wallet (for Tatum API)
   */
  async generateAddress(currency: string = 'ETH', index: number = 0): Promise<TatumWalletResponse> {
    return this.generateWalletOrAddress(currency, 'address', index);
  }

  /**
   * Generate HD wallet address with proper support for all networks
   */
  async generateHDWalletAddress(
    currency: string,
    chain: string,
    orderId: string,
    userIdForCustomer?: string
  ): Promise<{ address: string; privateKey?: string; accountId?: string }> {
    try {
      // Ensure we have a Virtual Account for this user/currency
      const accountId = await this.ensureOwnerVAPrivate(userIdForCustomer || 'anonymous', currency, chain);

      logger.info('[generateHDWalletAddress] Retrieved VA account details', {
        accountId,
        currency,
        active: true,
        frozen: false
      });

      // Generate HD wallet for this currency/chain
      const walletResult = await this.generateWalletOrAddress(currency, 'wallet', 0, userIdForCustomer);

      if (!walletResult.address) {
        throw new Error('Failed to generate wallet address');
      }

      logger.info('[generateHDWalletAddress] Generated HD wallet address', {
        currency,
        chain,
        orderId,
        address: walletResult.address,
        hasPrivateKey: !!walletResult.privateKey,
        accountId
      });

      return {
        address: walletResult.address,
        privateKey: walletResult.privateKey,
        accountId
      };
    } catch (error) {
      logger.error('[generateHDWalletAddress] Failed to generate deposit address', {
        currency,
        chain,
        orderId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Ensure Virtual Account exists for user/currency combination (private helper)
   */
  private async ensureOwnerVAPrivate(userId: string, currency: string, chain: string): Promise<string> {
    try {
      // Check if VA already exists for this user/currency
      const { data: existingVA } = await supabase
        .from('wallets')
        .select('tatum_va_id')
        .eq('user_id', userId)
        .eq('ccy', currency)
        .eq('chain', chain)
        .not('tatum_va_id', 'is', null)
        .maybeSingle();

      if (existingVA?.tatum_va_id) {
        logger.info('[ensureOwnerVAPrivate] Found existing VA', {
          userId,
          ccy: currency,
          chain,
          accountId: existingVA.tatum_va_id
        });
        return existingVA.tatum_va_id;
      }

      // Create new VA
      const shortId = String(userId).replace(/-/g, '').slice(0, 8);
      const label = `u_${shortId}_${currency}_${Date.now().toString(36)}`;
      const va = await this.createVirtualAccount(currency, label, userId);

      logger.info('[ensureOwnerVAPrivate] Created new VA', {
        userId,
        ccy: currency,
        chain,
        accountId: va.id
      });

      return va.id;
    } catch (error) {
      logger.error('[ensureOwnerVAPrivate] Failed to ensure VA', {
        userId,
        currency,
        chain,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get correct chain name for Tatum API
   */
  private getChainName(currency: string): string {
    const config = this.getCurrencyConfig(currency);
    return this.isTestnet ? config.testnet : config.mainnet;
  }

  /**
   * Get subscription chain ticker (uppercase)
   */
  private getSubscriptionChainTicker(currency: string): string {
    const config = this.getCurrencyConfig(currency);
    return config.ticker;
  }

  /**
   * Get API endpoint for currency
   */
  private getApiEndpoint(currency: string): string {
    const config = this.getCurrencyConfig(currency);
    return `/${config.endpoint}`;
  }

  /**
   * Create a Tatum Virtual Account (ledger account) to link funds for a withdrawal address.
   * In mock/test mode, return a generated id.
   */
  async createVirtualAccount(currency: string, label?: string, userIdForCustomer?: string): Promise<{ id: string }> {
    // In test/dev or when API key missing, return mock id
    if (this.shouldUseMockMode()) {
      const id = `mock_va_${crypto.randomBytes(8).toString('hex')}`;
      logger.info('Created mock Tatum Virtual Account', { id, currency, label });
      return { id };
    }

    try {
      const body: any = {
        currency: currency.toUpperCase(),
        accountingCurrency: (process.env.TATUM_ACCOUNTING_CURRENCY || 'USD').toUpperCase(),
        compliant: true,
        xpub: undefined,
      };
      if (label) body.accountCode = this.normalizeAccountCode(label);
      // Customer linkage via account create (no separate /ledger/customer call)
      let ensuredCustomerId = '';
      if (userIdForCustomer) {
        const externalId = `u_${String(userIdForCustomer).replace(/-/g, '').slice(0, 16)}`;
        let email: string | undefined;
        try {
          const { data } = await supabase
            .from('users')
            .select('tatum_customer_id, email')
            .eq('id', userIdForCustomer)
            .maybeSingle();
          ensuredCustomerId = (data as any)?.tatum_customer_id || '';
          email = (data as any)?.email || undefined;
        } catch { }
        if (ensuredCustomerId) {
          body.customerId = ensuredCustomerId;
        } else {
          body.customer = {
            externalId,
            accountingCurrency: body.accountingCurrency,
            ...(email ? { email } : {})
          };
        }
      }
      // Tatum ledger account create endpoint
      const resp = await this.makeApiRequest<{ id: string; customerId?: string }>(
        `${this.baseUrl}/ledger/account`,
        { method: 'POST', body: JSON.stringify(body) }
      );
      if (!resp.ok || !resp.data?.id) {
        throw new Error(`Failed to create VA: ${resp.status}`);
      }
      logger.info('Created Tatum Virtual Account', { id: resp.data.id, currency, label, customerId: (resp.data as any)?.customerId });
      // Persist/verify customerId
      try {
        const returnedCustomerId = (resp.data as any)?.customerId as string | undefined;
        if (userIdForCustomer) {
          if (returnedCustomerId && returnedCustomerId !== ensuredCustomerId) {
            await supabase
              .from('users')
              .update({ tatum_customer_id: String(returnedCustomerId), updated_at: new Date().toISOString() })
              .eq('id', userIdForCustomer);
            logger.info('Persisted Tatum customerId from account create', { userId: userIdForCustomer, customerId: returnedCustomerId });
          }
          // If response missing customerId, verify via GET regardless of whether we sent one
          if (!returnedCustomerId) {
            const getResp = await this.makeApiRequest<any>(
              `${this.baseUrl}/ledger/account/${resp.data.id}`,
              { method: 'GET' }
            );
            const fetchedCustomerId = (getResp.data as any)?.customerId as string | undefined;
            if (getResp.ok && fetchedCustomerId && fetchedCustomerId !== ensuredCustomerId) {
              await supabase
                .from('users')
                .update({ tatum_customer_id: String(fetchedCustomerId), updated_at: new Date().toISOString() })
                .eq('id', userIdForCustomer);
              logger.info('Persisted Tatum customerId from account fetch', { userId: userIdForCustomer, customerId: fetchedCustomerId });
            } else if (!fetchedCustomerId) {
              logger.warn('CustomerId not present in account after create', { accountId: resp.data.id, status: getResp.status });
            }
          }
        }
      } catch { }
      return { id: resp.data.id };
    } catch (error) {
      logger.error('Tatum VA creation failed, falling back to mock', { error: (error as any)?.message });
      const id = `fallback_va_${crypto.randomBytes(8).toString('hex')}`;
      return { id };
    }
  }

  /**
   * Normalize accountCode to satisfy Tatum constraints (<= 50 chars, safe charset)
   */
  private normalizeAccountCode(input: string): string {
    try {
      const safe = String(input).replace(/[^a-zA-Z0-9_-]/g, '');
      if (safe.length <= 50) return safe;
      const head = safe.slice(0, 40);
      const hash = crypto.createHash('sha1').update(input).digest('hex').slice(0, 10);
      return `${head}_${hash}`.slice(0, 50);
    } catch {
      return String(input).slice(0, 50);
    }
  }

  /**
   * Ensure a Tatum ledger customer exists for a user; create if missing and store on users table.
   */
  private async ensureTatumCustomer(userId: string): Promise<string> {
    // Check users table for existing customer id
    try {
      const { data: userRow, error } = await supabase
        .from('users')
        .select('tatum_customer_id, username, email')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      const existing = (userRow as any)?.tatum_customer_id as string | null;
      if (existing) return existing;

      if (this.shouldUseMockMode()) {
        const mockId = `mock_cust_${crypto.randomBytes(8).toString('hex')}`;
        await supabase.from('users').update({ tatum_customer_id: mockId, updated_at: new Date().toISOString() }).eq('id', userId);
        return mockId;
      }

      // Create real customer (try standard ledger endpoint, then alternate path)
      const externalId = `u_${String(userId).replace(/-/g, '').slice(0, 16)}`;
      const payload: any = { externalId, accountingCurrency: 'USD' };
      if ((userRow as any)?.email) payload.email = (userRow as any).email;

      // Official endpoint
      const endpoints = [`${this.baseUrl}/ledger/customer`];
      let custId = '';
      let lastStatus = 0;
      let lastError: any = null;
      for (const url of endpoints) {
        const resp = await this.makeApiRequest<{ id: string }>(url, { method: 'POST', body: JSON.stringify(payload) });
        lastStatus = resp.status;
        lastError = resp.error;
        if (resp.ok && resp.data?.id) { custId = resp.data.id; break; }
      }
      if (!custId) {
        const details = `${lastStatus} ${lastError ? JSON.stringify(lastError) : ''}`;
        if (lastStatus === 404) {
          logger.warn('Tatum customer endpoint not available (404). Continuing without customer.', { userId, endpoint: `${this.baseUrl}/ledger/customer`, details });
          return '';
        }
        throw new Error(`Failed to create Tatum customer: ${details}`);
      }
      await supabase.from('users').update({ tatum_customer_id: custId, updated_at: new Date().toISOString() }).eq('id', userId);
      logger.info('Created Tatum Customer', { userId, custId, externalId });
      return custId;
    } catch (e) {
      logger.error('ensureTatumCustomer failed', { userId, error: (e as any)?.message });
      // Do not block VA creation; return empty to continue without customerId
      return '';
    }
  }

  /**
   * Generate a simple mnemonic for wallet creation
   */
  private generateMnemonic(): string {
    // Generate a simple 12-word mnemonic using random words
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual'
    ];

    const mnemonic = [];
    for (let i = 0; i < 12; i++) {
      mnemonic.push(words[Math.floor(Math.random() * words.length)]);
    }

    return mnemonic.join(' ');
  }

  /**
   * Generate mock wallet for development/testing
   * Now used as primary method since Tatum chain endpoints don't exist
   */
  private generateMockWallet(currency: string): TatumWalletResponse {
    const mockAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
    const mockPrivateKey = crypto.randomBytes(32).toString('hex');

    logger.info('Generated address for payment monitoring', {
      address: mockAddress,
      currency,
      note: 'Direct generation (Tatum chain endpoints unavailable)'
    });

    return {
      address: mockAddress,
      privateKey: mockPrivateKey,
      currency
    };
  }

  /**
   * Try to find an existing Tatum subscription for the same (address, chain, url)
   */
  private async findExistingSubscription(address: string, currency: string, webhookUrl: string): Promise<string | null> {
    try {
      if (!this.apiKey) return null;
      // Use full chain name for subscription listing match as well
      const chain = this.getChainName(currency);
      const res = await fetch(`${this.notifBaseUrl}/subscription?pageSize=50&page=0`, {
        headers: { 'x-api-key': this.apiKey }
      });
      if (!res.ok) return null;
      const items = await res.json().catch(() => null);
      if (!Array.isArray(items)) return null;
      const match = items.find((it: any) =>
        it?.type === 'INCOMING_NATIVE_TX' &&
        it?.attr?.address === address &&
        it?.attr?.chain === chain &&
        it?.attr?.url === webhookUrl
      );
      return match?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Build webhook URL with token and orderId
   */
  private buildWebhookUrl(orderId?: string): string {
    const baseUrl = process.env.TATUM_WEBHOOK_URL || 'http://localhost:3001/api/webhooks/tatum';
    const token = process.env.TATUM_WEBHOOK_TOKEN || process.env.TATUM_WEBHOOK_SECRET || '';

    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (orderId) params.set('orderId', orderId);

    return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  }

  /**
   * Create fallback webhook response
   */
  private createFallbackWebhook(address: string, currency: string, url: string, reason: string): TatumWebhookResponse {
    logger.warn(`Using fallback webhook: ${reason}`);
    return {
      id: `fallback_webhook_${crypto.randomBytes(8).toString('hex')}`,
      type: 'INCOMING_NATIVE_TX',
      url,
      currency,
      address
    };
  }

  /**
   * Validate webhook URL
   */
  private validateWebhookUrl(url: string): { valid: boolean; reason?: string } {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { valid: false, reason: 'Invalid URL format' };
    }
    if (url.length > 500) {
      return { valid: false, reason: 'URL too long' };
    }
    return { valid: true };
  }

  /**
   * Create webhook for payment monitoring
   */
  async createWebhook(address: string, currency: string = 'ETH', orderId?: string): Promise<TatumWebhookResponse> {
    const webhookUrl = this.buildWebhookUrl(orderId);
    const isLocalhost = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1');

    // Use mock for development or localhost
    if (this.shouldUseMockMode(isLocalhost)) {
      logger.info('Using mock webhook for development/localhost', { webhookUrl, isLocalhost });
      return {
        id: `mock_webhook_${crypto.randomBytes(8).toString('hex')}`,
        type: 'INCOMING_NATIVE_TX',
        url: webhookUrl,
        currency,
        address
      };
    }

    // Validate URL for production
    const validation = this.validateWebhookUrl(webhookUrl);
    if (!validation.valid) {
      return this.createFallbackWebhook(address, currency, webhookUrl, validation.reason!);
    }

    const chain = this.getChainName(currency);

    try {
      // Check for existing subscription
      const existingId = await this.findExistingSubscription(address, currency, webhookUrl);
      if (existingId) {
        logger.info('Reusing existing Tatum subscription', { existingId, address, chain });
        return {
          id: existingId,
          type: 'INCOMING_NATIVE_TX',
          url: webhookUrl,
          currency,
          address
        };
      }

      // Create new subscription
      const apiResponse = await this.makeApiRequest<{ id: string }>(
        `${this.notifBaseUrl}/subscription`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'INCOMING_NATIVE_TX',
            attr: { address, chain, url: webhookUrl }
          })
        }
      );

      if (!apiResponse.ok) {
        logger.error('Tatum webhook creation failed:', {
          status: apiResponse.status,
          error: apiResponse.error,
          chain,
          address
        });
        return this.createFallbackWebhook(address, currency, webhookUrl, 'API error');
      }

      return {
        id: apiResponse.data!.id,
        type: 'INCOMING_NATIVE_TX',
        url: webhookUrl,
        currency,
        address
      };
    } catch (error) {
      logger.error('Failed to create Tatum webhook:', error);
      return this.createFallbackWebhook(address, currency, webhookUrl, 'Exception occurred');
    }
  }



  /**
   * Generate mock transaction data
   */
  private generateMockTransaction(txHash: string): any {
    return {
      hash: txHash,
      blockNumber: Math.floor(Math.random() * 1000000),
      from: `0x${crypto.randomBytes(20).toString('hex')}`,
      to: `0x${crypto.randomBytes(20).toString('hex')}`,
      value: '1000000000000000000', // 1 ETH in wei
      confirmations: 12
    };
  }

  /**
   * Get transaction details from Tatum
   */
  async getTransaction(txHash: string, currency: string = 'ETH'): Promise<any> {
    if (this.shouldUseMockMode()) {
      return this.generateMockTransaction(txHash);
    }

    try {
      const chainName = this.getChainName(currency);
      const baseChain = chainName.includes('-') ? chainName.split('-')[0] : chainName;
      const testnetQuery = chainName.includes('-') ? `?testnetType=${chainName}` : '';
      const apiResponse = await this.makeApiRequest(
        `${this.baseUrl}/${baseChain}/transaction/${txHash}${testnetQuery}`,
        { method: 'GET' }
      );

      if (!apiResponse.ok) {
        throw new Error(`Failed to fetch transaction: ${apiResponse.status}`);
      }

      return apiResponse.data;
    } catch (error) {
      logger.error('Failed to get transaction details:', error);
      throw error;
    }
  }

  /**
   * Encrypt private key for secure storage - simplified for development
   */
  encryptPrivateKey(privateKey: string): string {
    try {
      // Simple Base64 encoding for development - replace with proper encryption in production
      const encoded = Buffer.from(privateKey + ':' + this.encryptionKey).toString('base64');
      return 'DEV_ENCRYPTED:' + encoded;
    } catch (error) {
      logger.error('Failed to encrypt private key:', error);
      // For development, just return the key with a prefix to indicate it's unencrypted
      return 'UNENCRYPTED:' + privateKey;
    }
  }

  /**
   * Get OKX trading pair symbol for cryptocurrency
   */
  private getOKXSymbol(cryptoCurrency: string, fiatCurrency: string): string {
    const crypto = cryptoCurrency.toUpperCase();
    const fiat = fiatCurrency.toUpperCase();

    // OKX uses format like BTC-USD, ETH-USDT, etc.
    const okxSymbols: Record<string, string> = {
      'ETH': 'ETH',
      'ETHEREUM': 'ETH',
      'BTC': 'BTC',
      'BITCOIN': 'BTC',
      'MATIC': 'MATIC',
      'POLYGON': 'MATIC',
      'BNB': 'BNB',
      'BSC': 'BNB',
      'SOL': 'SOL',
      'SOLANA': 'SOL',
      'ADA': 'ADA',
      'CARDANO': 'ADA',
      'DOGE': 'DOGE',
      'LTC': 'LTC',
      'XRP': 'XRP',
      'TRX': 'TRX',
      'TRON': 'TRX'
    };

    const symbol = okxSymbols[crypto] || 'ETH';

    // OKX typically uses USDT for most pairs, USD for major ones
    const quoteCurrency = fiat === 'USD' ? (symbol === 'BTC' || symbol === 'ETH' ? 'USD' : 'USDT') : 'USDT';

    return `${symbol}-${quoteCurrency}`;
  }

  /**
   * Get Tatum currency symbol for price API
   */
  private getTatumPriceSymbol(cryptoCurrency: string): string {
    const tatumSymbols: Record<string, string> = {
      'ETH': 'ETH',
      'ETHEREUM': 'ETH',
      'BTC': 'BTC',
      'BITCOIN': 'BTC',
      'MATIC': 'MATIC',
      'POLYGON': 'MATIC',
      'BNB': 'BNB',
      'BSC': 'BNB',
      'SOL': 'SOL',
      'SOLANA': 'SOL',
      'ADA': 'ADA',
      'CARDANO': 'ADA',
      'DOGE': 'DOGE',
      'LTC': 'LTC',
      'XRP': 'XRP',
      'TRX': 'TRX',
      'TRON': 'TRX'
    };
    return tatumSymbols[cryptoCurrency.toUpperCase()] || 'ETH';
  }

  /**
   * Get emergency fallback exchange rates (last resort)
   */
  private getEmergencyFallbackRates(): Record<string, number> {
    return {
      ETH: 2500,    // Updated to more realistic current prices
      BTC: 44000,
      MATIC: 0.85,
      BNB: 320,
      SOL: 95,
      ADA: 0.45,
      DOGE: 0.08,
      LTC: 75,
      XRP: 0.55,
      TRX: 0.11
    };
  }

  /**
   * Fetch price from OKX API (Primary source)
   */
  private async fetchOKXPrice(
    cryptoCurrency: string,
    fiatCurrency: string
  ): Promise<{ price: number; source: string } | null> {
    try {
      const symbol = this.getOKXSymbol(cryptoCurrency, fiatCurrency);

      // OKX public API endpoint for ticker price
      const url = `https://www.okx.com/api/v5/market/ticker?instId=${symbol}`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      // Add API key if available (optional for public endpoints)
      const okxApiKey = process.env.OKX_API_KEY;
      if (okxApiKey) {
        headers['OK-ACCESS-KEY'] = okxApiKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`OKX API returned ${response.status}`);
      }

      const data = await response.json();

      // OKX API response format: { code: "0", msg: "", data: [{ last: "price" }] }
      if (data.code !== "0" || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('Invalid response format from OKX API');
      }

      const price = parseFloat(data.data[0].last);

      if (!price || price <= 0) {
        throw new Error('Invalid price data from OKX');
      }

      return {
        price,
        source: okxApiKey ? 'okx-authenticated' : 'okx-public'
      };
    } catch (error) {
      logger.warn('OKX price fetch failed:', {
        cryptoCurrency,
        fiatCurrency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Fetch price from Tatum API (Backup source)
   */
  private async fetchTatumPrice(
    cryptoCurrency: string,
    fiatCurrency: string
  ): Promise<{ price: number; source: string } | null> {
    try {
      if (!this.apiKey) {
        logger.warn('Tatum API key not available for price fetching');
        return null;
      }

      const symbol = this.getTatumPriceSymbol(cryptoCurrency);
      const currency = fiatCurrency.toUpperCase();

      // Tatum price API endpoint
      const url = `${this.baseUrl}/tatum/rate/${symbol}?basePair=${currency}`;

      const apiResponse = await this.makeApiRequest<{ value: number }>(url, {
        method: 'GET'
      });

      if (!apiResponse.ok || !apiResponse.data?.value) {
        throw new Error('Invalid response from Tatum price API');
      }

      return {
        price: apiResponse.data.value,
        source: 'tatum'
      };
    } catch (error) {
      logger.warn('Tatum price fetch failed:', {
        cryptoCurrency,
        fiatCurrency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Convert fiat to crypto amount using OKX + Tatum dual-source pricing
   */
  async convertFiatToCrypto(
    fiatAmount: number,
    fiatCurrency: string = 'USD',
    cryptoCurrency: string = 'ETH'
  ): Promise<PriceConversionResult> {
    // Try OKX first (primary source)
    let priceResult = await this.fetchOKXPrice(cryptoCurrency, fiatCurrency);

    // If OKX fails, try Tatum (backup source)
    if (!priceResult) {
      logger.info('OKX price fetch failed, falling back to Tatum price API', {
        cryptoCurrency,
        fiatCurrency
      });
      priceResult = await this.fetchTatumPrice(cryptoCurrency, fiatCurrency);
    }

    // If both APIs fail, use emergency fallback rates
    if (!priceResult) {
      const emergencyRates = this.getEmergencyFallbackRates();
      const ticker = cryptoCurrency.toUpperCase();
      const rate = emergencyRates[ticker] || emergencyRates.ETH;
      const amount = Number((fiatAmount / rate).toFixed(8));

      logger.warn('Both OKX and Tatum price APIs failed, using emergency fallback rate', {
        cryptoCurrency,
        fiatAmount,
        rate,
        source: 'emergency-fallback'
      });

      return {
        amount,
        rate,
        source: 'emergency-fallback',
        at: new Date().toISOString()
      };
    }

    // Calculate crypto amount from fetched price
    const amount = Number((fiatAmount / priceResult.price).toFixed(8));

    logger.info('Price conversion successful', {
      cryptoCurrency,
      fiatCurrency,
      fiatAmount,
      cryptoAmount: amount,
      rate: priceResult.price,
      source: priceResult.source
    });

    return {
      amount,
      rate: priceResult.price,
      source: priceResult.source,
      at: new Date().toISOString()
    };
  }

  /**
   * Decrypt private key for use - simplified for development
   */
  decryptPrivateKey(encryptedKey: string): string {
    try {
      // Handle unencrypted keys from fallback
      if (encryptedKey.startsWith('UNENCRYPTED:')) {
        return encryptedKey.replace('UNENCRYPTED:', '');
      }

      // Handle development encrypted keys
      if (encryptedKey.startsWith('DEV_ENCRYPTED:')) {
        const encoded = encryptedKey.replace('DEV_ENCRYPTED:', '');
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const parts = decoded.split(':');
        if (parts.length >= 2) {
          return parts[0]; // Return the private key part
        }
      }

      // If it's neither format, assume it's the raw private key
      return encryptedKey;
    } catch (error) {
      logger.error('Failed to decrypt private key:', error);
      // Return the key as-is if decryption fails
      return encryptedKey;
    }
  }

  /**
   * Create complete payment setup for an order
   */
  async createPaymentSetup(orderId: string, currency: string = 'ETH', amount?: string): Promise<{
    address: string;
    webhookId: string;
    qrCode: string;
  }> {
    try {
      // Generate unique address for payment (use address generation instead of wallet generation)
      const wallet = await this.generateAddress(currency, Math.floor(Math.random() * 1000000));

      // Create webhook for monitoring
      const webhook = await this.createWebhook(wallet.address, currency, orderId);

      // Encrypt and store private key (only if not mock)
      let encryptedPrivateKey = '';
      try {
        encryptedPrivateKey = this.encryptPrivateKey(wallet.privateKey);
      } catch (encryptError) {
        logger.warn('Failed to encrypt private key, storing without encryption:', encryptError);
        encryptedPrivateKey = wallet.privateKey; // Store unencrypted as fallback
      }

      // Update order with crypto info
      const { error: updateError } = await supabase
        .from('payment_orders')
        .update({
          crypto_info: {
            address: wallet.address,
            currency,
            private_key_encrypted: encryptedPrivateKey,
            webhook_id: webhook.id,
            network: this.isTestnet ? 'testnet' : 'mainnet',
            ...(amount ? { amount } : {})
          },
          webhook_id: webhook.id,
          webhook_type: 'tatum_payment',
          webhook_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) {
        logger.error('Failed to update order with crypto info:', updateError);
        throw new Error('Failed to update order');
      }

      // Generate QR code data (include amount if provided)
      const qrCode = this.generateQRCode(wallet.address, currency, amount);

      logger.info('Payment setup created successfully', {
        orderId,
        address: wallet.address,
        webhookId: webhook.id,
        currency,
        isTestnet: this.isTestnet
      });

      return {
        address: wallet.address,
        webhookId: webhook.id,
        qrCode
      };
    } catch (error) {
      logger.error('Failed to create payment setup:', error);
      throw error;
    }
  }

  /**
   * Generate QR code data for payment
   */
  private generateQRCode(address: string, currency: string, amount?: string): string {
    // Generate QR code data based on currency
    switch (currency.toUpperCase()) {
      case 'ETH':
      case 'ETHEREUM':
        return `ethereum:${address}${amount ? `?value=${amount}` : ''}`;
      case 'BTC':
      case 'BITCOIN':
        return `bitcoin:${address}${amount ? `?amount=${amount}` : ''}`;
      case 'MATIC':
      case 'POLYGON':
        return `ethereum:${address}${amount ? `?value=${amount}` : ''}`;
      default:
        return address;
    }
  }

  /**
   * Find order by ID or address+currency
   */
  private async findOrderForPayment(webhookData: any): Promise<{ order: any; error: any }> {
    const { address, currency, orderId } = webhookData;

    // Try ID-first lookup if orderId is provided
    if (orderId) {
      const result = await supabase
        .from('payment_orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (result.data) {
        return { order: result.data, error: null };
      }
    }

    // Fallback to address+currency lookup
    const result = await supabase
      .from('payment_orders')
      .select('*')
      .eq('crypto_info->>address', address)
      .eq('crypto_info->>currency', currency)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { order: result.data, error: result.error };
  }

  /**
   * Update order with payment information
   */
  private async updateOrderPayment(
    orderId: string,
    webhookData: any,
    status: 'received' | 'paid',
    receivedAmount: number
  ): Promise<void> {
    const baseUpdate = {
      received_amount: receivedAmount,
      transaction_hash: webhookData.txId,
      webhook_status: status === 'paid' ? 'processed' : 'received',
      payload: webhookData,
      updated_at: new Date().toISOString()
    };

    const updateData = status === 'paid'
      ? {
        ...baseUpdate,
        status: 'paid',
        confirmed_at: new Date().toISOString(),
        processed_at: new Date().toISOString()
      }
      : baseUpdate;

    const { error } = await supabase
      .from('payment_orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) {
      throw new Error(`Failed to update order: ${error.message}`);
    }
  }

  /**
   * Check if payment amount is sufficient - must be equal or greater than expected
   * @param received - Amount received
   * @param expected - Expected amount
   * @returns true if payment is sufficient (received >= expected, no tolerance)
   */
  private isPaymentSufficient(received: number, expected: number): boolean {
    const isSufficient = received >= expected;

    logger.debug('Payment sufficiency check', {
      received,
      expected,
      isSufficient,
      note: 'No tolerance - payment must equal or exceed expected amount'
    });

    return isSufficient;
  }

  /**
   * Process webhook payment notification
   */
  async processPaymentWebhook(webhookData: any): Promise<void> {
    try {
      const { address, amount, txId, currency } = webhookData;

      logger.info('Processing payment webhook', { address, amount, txId, currency });

      // Find the order
      const { order, error } = await this.findOrderForPayment(webhookData);

      if (error || !order) {
        const logLevel = webhookData.orderId ? 'warn' : 'info'; // Less noisy for test webhooks
        logger[logLevel]('No pending order found for payment address', { address, orderId: webhookData.orderId });
        return;
      }

      // Verify transaction if possible
      let transaction = null;
      if (this.apiKey) {
        try {
          transaction = await this.getTransaction(txId, currency);
        } catch (error) {
          logger.warn('Failed to verify transaction, proceeding with webhook data:', error);
        }
      }

      const receivedAmount = parseFloat(amount);
      const expectedAmount = parseFloat(order.expected_amount);
      const isPaymentSufficient = this.isPaymentSufficient(receivedAmount, expectedAmount);

      if (!isPaymentSufficient) {
        logger.warn('Insufficient payment received', {
          orderId: order.id,
          expected: expectedAmount,
          received: receivedAmount
        });

        await this.updateOrderPayment(order.id, webhookData, 'received', receivedAmount);
        return;
      }

      // Payment is sufficient - mark as paid
      await this.updateOrderPayment(order.id, webhookData, 'paid', receivedAmount);

      logger.info('Payment processed successfully', {
        orderId: order.id,
        txId,
        amount: receivedAmount
      });

      // Trigger order fulfillment
      await this.triggerOrderFulfillment(order);

    } catch (error) {
      logger.error('Failed to process payment webhook:', error);
      throw error;
    }
  }

  /**
   * Trigger order fulfillment after successful payment
   */
  private async triggerOrderFulfillment(order: PaymentOrder): Promise<void> {
    try {
      logger.info('Triggering order fulfillment', { orderId: order.id });

      // TODO: Implement order fulfillment logic
      // - Send Discord notification
      // - Deliver Minecraft items
      // - Update order status to 'completed'
      // - Send confirmation to customer

      // For now, just log the fulfillment trigger
      logger.info('Order fulfillment triggered (implementation pending)', {
        orderId: order.id,
        userId: order.user_id,
        serverId: order.server_id
      });

    } catch (error) {
      logger.error('Failed to trigger order fulfillment:', error);

      // Update order with fulfillment error
      await supabase
        .from('payment_orders')
        .update({
          minecraft_delivery_error: error instanceof Error ? error.message : 'Unknown fulfillment error',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);
    }
  }

  /**
   * Check payment status for an order (now uses manual verification)
   */
  async checkPaymentStatus(orderId: string): Promise<{
    status: string;
    address?: string;
    expectedAmount: number;
    receivedAmount: number;
    transactionHash?: string;
    confirmations?: number;
  }> {
    try {
      // Use the new manual payment checking
      const paymentStatus = await this.checkOrderPaymentStatus(orderId);

      let confirmations = 0;
      if (paymentStatus.transactionHash && this.apiKey) {
        try {
          const { data: order } = await supabase
            .from('payment_orders')
            .select('crypto_info')
            .eq('id', orderId)
            .single();

          const currency = order?.crypto_info?.coin || 'ETH';
          const transaction = await this.getTransaction(paymentStatus.transactionHash, currency);
          confirmations = transaction.confirmations || 0;
        } catch (error) {
          logger.warn('Failed to get transaction confirmations:', error);
        }
      }

      return {
        status: paymentStatus.status,
        address: paymentStatus.address,
        expectedAmount: paymentStatus.expectedAmount,
        receivedAmount: paymentStatus.receivedAmount,
        transactionHash: paymentStatus.transactionHash,
        confirmations
      };
    } catch (error) {
      logger.error('Failed to check payment status:', error);
      throw error;
    }
  }

  /**
   * Cancel webhook subscription
   */
  async cancelWebhook(webhookId: string): Promise<void> {
    try {
      if (!this.apiKey || webhookId.startsWith('mock_') || webhookId.startsWith('fallback_')) {
        logger.info('Skipping webhook cancellation for mock/fallback webhook', { webhookId });
        return;
      }

      const response = await fetch(`${this.notifBaseUrl}/subscription/${webhookId}`, {
        method: 'DELETE',
        headers: {
          'x-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        logger.warn('Failed to cancel Tatum webhook:', {
          webhookId,
          status: response.status
        });
      } else {
        logger.info('Webhook cancelled successfully', { webhookId });
      }
    } catch (error) {
      logger.error('Error cancelling webhook:', error);
    }
  }

  /**
   * Clean up expired orders and their webhooks
   */
  async cleanupExpiredOrders(): Promise<number> {
    try {
      // Find expired orders with active webhooks
      const { data: expiredOrders, error } = await supabase
        .from('payment_orders')
        .select('id, webhook_id')
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString())
        .not('webhook_id', 'is', null);

      if (error) {
        logger.error('Failed to fetch expired orders:', error);
        return 0;
      }

      if (!expiredOrders?.length) {
        return 0;
      }

      // Cancel webhooks concurrently for better performance
      const webhookCancellations = expiredOrders
        .filter(order => order.webhook_id)
        .map(order => this.cancelWebhook(order.webhook_id));

      await Promise.allSettled(webhookCancellations);

      // Mark orders as expired
      const { error: updateError } = await supabase
        .from('payment_orders')
        .update({
          status: 'expired',
          webhook_status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .in('id', expiredOrders.map(o => o.id));

      if (updateError) {
        logger.error('Failed to update expired orders:', updateError);
        return 0;
      }

      logger.info('Cleaned up expired orders', { count: expiredOrders.length });
      return expiredOrders.length;

    } catch (error) {
      logger.error('Failed to cleanup expired orders:', error);
      return 0;
    }
  }

  /**
   * Ensure owner has a Virtual Account for the given currency/chain
   * Returns existing VA or creates new one
   */
  async ensureOwnerVA(userId: string, ccy: string, chain: string): Promise<{ accountId: string; created: boolean }> {
    try {
      // Check if VA already exists in wallets table
      const { data: existingWallet, error: walletError } = await supabase
        .from('wallets')
        .select('tatum_va_id')
        .eq('user_id', userId)
        .eq('ccy', ccy.toUpperCase())
        .eq('chain', chain)
        .maybeSingle();

      if (walletError) {
        logger.error('Failed to query existing wallet:', walletError);
      }

      if (existingWallet?.tatum_va_id) {
        logger.info('[ensureOwnerVA] Found existing VA', {
          userId,
          ccy,
          chain,
          accountId: existingWallet.tatum_va_id
        });
        return { accountId: existingWallet.tatum_va_id, created: false };
      }

      // Create new Ledger account with customer linkage
      const label = `${ccy}_${chain}_${userId.slice(0, 8)}`;
      const vaResult = await this.createVirtualAccount(ccy, label, userId);

      // Save or update wallets row - try upsert first, fallback to insert/update
      let upsertError = null;
      try {
        const { error } = await supabase
          .from('wallets')
          .upsert({
            user_id: userId,
            ccy: ccy.toUpperCase(),
            chain: chain,
            tatum_va_id: vaResult.id,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,ccy,chain',
            ignoreDuplicates: false
          });
        upsertError = error;
      } catch (error) {
        upsertError = error;
      }

      // If upsert failed (maybe constraint doesn't exist), try manual insert/update
      if (upsertError) {
        logger.warn('Upsert failed, trying manual insert/update:', upsertError);

        // Try to update existing row first
        const { error: updateError } = await supabase
          .from('wallets')
          .update({
            tatum_va_id: vaResult.id,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('ccy', ccy.toUpperCase())
          .eq('chain', chain);

        // If update didn't affect any rows, insert new one
        if (updateError) {
          const { error: insertError } = await supabase
            .from('wallets')
            .insert({
              user_id: userId,
              ccy: ccy.toUpperCase(),
              chain: chain,
              tatum_va_id: vaResult.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (insertError) {
            logger.error('Failed to save VA to wallets table:', insertError);
            // Don't fail the operation, just log the error
          }
        }
      }

      logger.info('[ensureOwnerVA] Created new VA', {
        userId,
        ccy,
        chain,
        accountId: vaResult.id
      });

      return { accountId: vaResult.id, created: true };
    } catch (error) {
      logger.error('Failed to ensure owner VA:', error);
      throw error;
    }
  }

  /**
   * Generate unique deposit address for an invoice using Tatum ledger
   * Uses correct Tatum ledger account endpoints and generates addresses via wallet creation
   * Supports memo/tag fields for blockchains that require them
   */
  async generateUniqueDepositAddress(accountId: string, orderId?: string): Promise<{
    address: string;
    memo?: string;
    tag?: string;
  }> {
    try {
      // Get currency from wallets table
      const { data: walletData } = await supabase
        .from('wallets')
        .select('ccy, chain')
        .eq('tatum_va_id', accountId)
        .maybeSingle();

      const currency = walletData?.ccy || 'ETH';
      const chain = walletData?.chain || 'ethereum-mainnet';

      // In development/test mode, generate mock addresses
      if (this.shouldUseMockMode()) {
        const mockAddress = `0x${crypto.randomBytes(20).toString('hex')}`;

        logger.info('[generateUniqueDepositAddress] Generated mock deposit address', {
          accountId,
          orderId,
          address: mockAddress,
          currency,
          chain,
          method: 'mock_generation'
        });

        return { address: mockAddress };
      }

      // Step 1: Get Virtual Account details using correct Tatum endpoint
      let accountDetails = null;
      try {
        const getResponse = await this.makeApiRequest<{
          id: string;
          balance: { accountBalance: string; availableBalance: string };
          currency: string;
          frozen: boolean;
          active: boolean;
          customerId?: string;
        }>(`${this.baseUrl}/ledger/account/${accountId}`, {
          method: 'GET'
        });

        if (getResponse.ok && getResponse.data) {
          accountDetails = getResponse.data;
          logger.info('[generateUniqueDepositAddress] Retrieved VA account details', {
            accountId,
            currency: accountDetails.currency,
            active: accountDetails.active,
            frozen: accountDetails.frozen
          });
        } else if (getResponse.status === 404) {
          throw new Error(`Virtual Account not found: ${accountId}`);
        } else {
          throw new Error(`Failed to get VA details: ${getResponse.status} ${JSON.stringify(getResponse.error)}`);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          logger.error('[generateUniqueDepositAddress] Failed to get VA details in production', {
            accountId,
            orderId,
            currency,
            chain,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }

        // In dev/test, fall back to mock address with warning
        const fallbackAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
        logger.warn('[generateUniqueDepositAddress] Tatum VA API failed, using fallback address in dev/test', {
          accountId,
          orderId,
          address: fallbackAddress,
          currency,
          chain,
          error: error instanceof Error ? error.message : 'Unknown error',
          method: 'fallback_generation'
        });

        return { address: fallbackAddress };
      }

      // Step 2: Generate a unique wallet address for this order
      // Since Tatum VAs don't have direct address endpoints, we generate a wallet
      // and associate it with the VA for deposit tracking
      try {
        const wallet = await this.generateWalletOrAddress(currency, 'wallet', 0);

        // For blockchains that support memo/tag, generate them
        let memo: string | undefined;
        let tag: string | undefined;

        // Generate memo/tag for supported chains
        if (currency.toUpperCase() === 'XRP') {
          tag = Math.floor(Math.random() * 4294967295).toString(); // XRP destination tag
        } else if (['XLM', 'STELLAR'].includes(currency.toUpperCase())) {
          memo = crypto.randomBytes(16).toString('hex'); // Stellar memo
        }

        logger.info('[generateUniqueDepositAddress] Generated wallet address for VA', {
          accountId,
          orderId,
          address: wallet.address,
          currency,
          chain,
          memo,
          tag,
          method: 'wallet_generation'
        });

        return {
          address: wallet.address,
          memo,
          tag
        };

      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          logger.error('[generateUniqueDepositAddress] Failed to generate wallet in production', {
            accountId,
            orderId,
            currency,
            chain,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw new Error('Failed to generate deposit address');
        }

        // In dev/test, fall back to mock address
        const fallbackAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
        logger.warn('[generateUniqueDepositAddress] Wallet generation failed, using fallback address', {
          accountId,
          orderId,
          address: fallbackAddress,
          currency,
          chain,
          error: error instanceof Error ? error.message : 'Unknown error',
          method: 'fallback_generation'
        });

        return { address: fallbackAddress };
      }

    } catch (error) {
      logger.error('Failed to generate unique deposit address:', error);
      throw error;
    }
  }

  /**
   * Get deposit address for a Virtual Account (legacy method - now generates unique addresses)
   */
  async getDepositAddressForVA(accountId: string): Promise<{
    address: string;
    memo?: string;
    tag?: string;
  }> {
    return this.generateUniqueDepositAddress(accountId);
  }

  /**
   * Get or create VA deposit address (combines the two methods above)
   * Now generates unique addresses per invoice with memo/tag support
   */
  async getOrCreateVADepositAddress(userId: string, ccy: string, chain: string, orderId?: string): Promise<{
    accountId: string;
    address: string;
    memo?: string;
    tag?: string;
  }> {
    try {
      const vaResult = await this.ensureOwnerVA(userId, ccy, chain);
      const addressInfo = await this.generateUniqueDepositAddress(vaResult.accountId, orderId);

      logger.info('[getOrCreateVADepositAddress] VA deposit address ready', {
        userId,
        ccy,
        chain,
        accountId: vaResult.accountId,
        address: addressInfo.address,
        memo: addressInfo.memo,
        tag: addressInfo.tag,
        orderId,
        unique: true
      });

      return {
        accountId: vaResult.accountId,
        address: addressInfo.address,
        memo: addressInfo.memo,
        tag: addressInfo.tag
      };
    } catch (error) {
      logger.error('Failed to get or create VA deposit address:', error);
      throw error;
    }
  }

  /**
   * Manually check for payments to a specific address
   * This replaces webhook-based monitoring with on-demand checking
   * @param address - Address to check for payments
   * @param currency - Currency/blockchain to check
   * @param expectedAmount - Expected payment amount (must be paid in full, no tolerance)
   */
  async checkAddressForPayments(address: string, currency: string, expectedAmount: number): Promise<{
    hasPayment: boolean;
    receivedAmount: number;
    transactions: any[];
    latestTxHash?: string;
  }> {
    try {
      if (this.shouldUseMockMode()) {
        // Mock payment detection for testing
        const mockHasPayment = Math.random() > 0.7; // 30% chance of payment
        const mockAmount = mockHasPayment ? expectedAmount + (Math.random() - 0.5) * 0.001 : 0;

        logger.info('[checkAddressForPayments] Mock payment check', {
          address,
          currency,
          expectedAmount,
          hasPayment: mockHasPayment,
          receivedAmount: mockAmount
        });

        return {
          hasPayment: mockHasPayment,
          receivedAmount: mockAmount,
          transactions: mockHasPayment ? [{ hash: `mock_tx_${crypto.randomBytes(16).toString('hex')}`, amount: mockAmount }] : [],
          latestTxHash: mockHasPayment ? `mock_tx_${crypto.randomBytes(16).toString('hex')}` : undefined
        };
      }

      const chainName = this.getChainName(currency);
      const baseChain = chainName.includes('-') ? chainName.split('-')[0] : chainName;
      const testnetQuery = chainName.includes('-') ? `?testnetType=${chainName}` : '';

      // Get address transactions using the appropriate Tatum API endpoint
      // Different blockchains require different endpoints
      let apiUrl: string;

      if (baseChain === 'ethereum' || baseChain === 'polygon' || baseChain === 'bsc') {
        // EVM chains: Use data API (deprecated but working)
        apiUrl = `${this.baseUrl}/data/transactions?chain=${chainName}&addresses=${address}&pageSize=50`;
      } else if (baseChain === 'bitcoin') {
        // Bitcoin: Use balance endpoint (works for both mainnet and testnet)
        apiUrl = `${this.baseUrl}/bitcoin/address/balance/${address}`;
      } else if (baseChain === 'solana') {
        // Solana: Use account balance endpoint
        apiUrl = `${this.baseUrl}/solana/account/balance/${address}`;
      } else if (baseChain === 'tron') {
        // Tron: Use account info endpoint (mainnet only)
        apiUrl = `${this.baseUrl}/tron/account/${address}`;
      } else if (baseChain === 'xrp') {
        // XRP: Use account balance endpoint
        apiUrl = `${this.baseUrl}/xrp/account/${address}/balance`;
      } else if (baseChain === 'dogecoin') {
        // Dogecoin: Use address balance endpoint
        apiUrl = `${this.baseUrl}/dogecoin/address/balance/${address}`;
      } else if (baseChain === 'litecoin') {
        // Litecoin: Use address balance endpoint
        apiUrl = `${this.baseUrl}/litecoin/address/balance/${address}`;
      } else if (baseChain === 'avalanche') {
        // Avalanche: Use account balance endpoint
        apiUrl = `${this.baseUrl}/avalanche/account/balance/${address}`;
      } else if (baseChain === 'fantom') {
        // Fantom: Use account balance endpoint
        apiUrl = `${this.baseUrl}/fantom/account/balance/${address}`;
      } else if (baseChain === 'flare') {
        // Flare: Use account balance endpoint
        apiUrl = `${this.baseUrl}/flare/account/balance/${address}`;
      } else if (baseChain === 'klaytn' || baseChain === 'kaia') {
        // Klaytn/Kaia: Use account balance endpoint
        apiUrl = `${this.baseUrl}/klaytn/account/balance/${address}`;
      } else if (baseChain === 'stellar') {
        // Stellar: Use account endpoint
        apiUrl = `${this.baseUrl}/xlm/account/${address}`;
      } else if (baseChain === 'celo') {
        // Celo: Use account balance endpoint
        apiUrl = `${this.baseUrl}/celo/account/balance/${address}`;
      } else if (baseChain === 'algorand') {
        // Algorand: Use account balance endpoint
        apiUrl = `${this.baseUrl}/algorand/account/balance/${address}`;
      } else {
        // Unsupported blockchain
        logger.warn(`[checkAddressForPayments] Unsupported blockchain: ${currency}`, {
          address,
          currency,
          chainName,
          baseChain,
          note: 'This blockchain is not supported by TatumService'
        });

        return {
          hasPayment: false,
          receivedAmount: 0,
          transactions: []
        };
      }

      const txResponse = await this.makeApiRequest<any>(
        apiUrl,
        { method: 'GET' }
      );

      if (!txResponse.ok) {
        logger.warn('Failed to get address transactions:', {
          address,
          currency,
          status: txResponse.status,
          error: txResponse.error
        });
        return {
          hasPayment: false,
          receivedAmount: 0,
          transactions: []
        };
      }

      let transactions = [];
      let totalReceived = 0;
      let latestTxHash: string | undefined;

      if (baseChain === 'ethereum' || baseChain === 'polygon' || baseChain === 'bsc') {
        // EVM chains: Handle data API response format
        const responseData = txResponse.data;
        transactions = Array.isArray(responseData) ? responseData : (responseData?.result || []);

        for (const tx of transactions) {
          // Tatum data API returns transactions with specific format
          if (tx.transactionSubtype === 'incoming' && tx.address.toLowerCase() === address.toLowerCase()) {
            const amount = parseFloat(tx.amount || '0');

            if (amount > 0) {
              totalReceived += amount;
              if (!latestTxHash) {
                latestTxHash = tx.hash;
              }
            }
          }
        }
      } else if (baseChain === 'bitcoin') {
        // Bitcoin: Handle balance API response format
        const incoming = parseFloat(txResponse.data?.incoming || '0');
        const incomingPending = parseFloat(txResponse.data?.incomingPending || '0');

        // Total received = confirmed incoming + pending incoming
        totalReceived = incoming + incomingPending;

        // For Bitcoin, we don't have individual transaction hashes from balance endpoint
        logger.info('[checkAddressForPayments] Bitcoin balance check', {
          address,
          incoming,
          incomingPending,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      } else if (baseChain === 'solana') {
        // Solana: Handle account balance API response format
        const balanceLamports = parseFloat(txResponse.data?.balance || '0');

        // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
        totalReceived = balanceLamports / 1000000000;

        // For Solana, we don't have individual transaction hashes from balance endpoint
        logger.info('[checkAddressForPayments] Solana balance check', {
          address,
          balanceLamports,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      } else if (baseChain === 'tron') {
        // Tron: Handle account info API response format
        const balanceSun = parseFloat(txResponse.data?.balance || '0');

        // Convert sun to TRX (1 TRX = 1,000,000 sun)
        totalReceived = balanceSun / 1000000;

        // For Tron, we don't have individual transaction hashes from account endpoint
        logger.info('[checkAddressForPayments] Tron balance check', {
          address,
          balanceSun,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      } else if (baseChain === 'xrp') {
        // XRP: Handle account balance API response format
        const balanceDrops = parseFloat(txResponse.data?.balance || '0');

        // Convert drops to XRP (1 XRP = 1,000,000 drops)
        totalReceived = balanceDrops / 1000000;

        logger.info('[checkAddressForPayments] XRP balance check', {
          address,
          balanceDrops,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      } else if (baseChain === 'dogecoin' || baseChain === 'litecoin') {
        // UTXO chains: Handle balance API response format
        const incoming = parseFloat(txResponse.data?.incoming || '0');
        const incomingPending = parseFloat(txResponse.data?.incomingPending || '0');

        // Total received = confirmed incoming + pending incoming
        totalReceived = incoming + incomingPending;

        logger.info(`[checkAddressForPayments] ${baseChain} balance check`, {
          address,
          incoming,
          incomingPending,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      } else if (baseChain === 'avalanche' || baseChain === 'fantom' || baseChain === 'flare' || baseChain === 'klaytn' || baseChain === 'celo') {
        // EVM-like chains: Handle account balance API response format
        const balance = parseFloat(txResponse.data?.balance || '0');

        // Convert wei to main unit (1 unit = 10^18 wei for most EVM chains)
        totalReceived = balance / Math.pow(10, 18);

        logger.info(`[checkAddressForPayments] ${baseChain} balance check`, {
          address,
          balance,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      } else if (baseChain === 'stellar') {
        // Stellar: Handle account API response format
        if (Array.isArray(txResponse.data?.balances)) {
          const nativeBalance = txResponse.data.balances.find((b: any) => b.asset_type === 'native');
          if (nativeBalance) {
            totalReceived = parseFloat(nativeBalance.balance || '0');
          }
        }

        logger.info('[checkAddressForPayments] Stellar balance check', {
          address,
          totalReceived,
          note: 'Balance-based detection (no individual transaction hashes)'
        });
      }

      const hasPayment = this.isPaymentSufficient(totalReceived, expectedAmount);

      logger.info('[checkAddressForPayments] Payment check completed', {
        address,
        currency,
        expectedAmount,
        receivedAmount: totalReceived,
        hasPayment,
        transactionCount: transactions.length,
        transactions: transactions.map(tx => ({
          hash: tx.hash,
          amount: tx.amount,
          transactionSubtype: tx.transactionSubtype,
          address: tx.address
        }))
      });

      return {
        hasPayment,
        receivedAmount: totalReceived,
        transactions,
        latestTxHash
      };

    } catch (error) {
      logger.error('Failed to check address for payments:', error);
      return {
        hasPayment: false,
        receivedAmount: 0,
        transactions: []
      };
    }
  }

  /**
   * Check payment status for an order by manually verifying the address
   * Now works with unique addresses per invoice
   */
  async checkOrderPaymentStatus(orderId: string): Promise<{
    status: 'pending' | 'paid' | 'expired';
    receivedAmount: number;
    expectedAmount: number;
    transactionHash?: string;
    address?: string;
  }> {
    try {
      // Get order details
      const { data: order, error } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error || !order) {
        throw new Error('Order not found');
      }

      const cryptoInfo = order.crypto_info;
      if (!cryptoInfo?.address) {
        throw new Error('No crypto address found for order');
      }

      const expectedAmount = parseFloat(order.expected_amount);
      const address = cryptoInfo.address;
      const currency = cryptoInfo.coin || 'ETH';

      // Check if order is expired
      if (order.expires_at && new Date(order.expires_at) < new Date()) {
        return {
          status: 'expired',
          receivedAmount: 0,
          expectedAmount,
          address
        };
      }

      // Check for payments to this unique address
      const paymentCheck = await this.checkAddressForPayments(address, currency, expectedAmount);

      logger.info('[checkOrderPaymentStatus] Payment check completed', {
        orderId,
        address,
        currency,
        expectedAmount,
        receivedAmount: paymentCheck.receivedAmount,
        hasPayment: paymentCheck.hasPayment,
        transactionCount: paymentCheck.transactions.length
      });

      if (paymentCheck.hasPayment) {
        // Update order status if payment found
        const { error: updateError } = await supabase
          .from('payment_orders')
          .update({
            status: 'paid',
            received_amount: paymentCheck.receivedAmount,
            transaction_hash: paymentCheck.latestTxHash,
            confirmed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (updateError) {
          logger.error('Failed to update order status:', updateError);
        }

        logger.info('[checkOrderPaymentStatus] Order marked as paid', {
          orderId,
          receivedAmount: paymentCheck.receivedAmount,
          transactionHash: paymentCheck.latestTxHash
        });

        return {
          status: 'paid',
          receivedAmount: paymentCheck.receivedAmount,
          expectedAmount,
          transactionHash: paymentCheck.latestTxHash,
          address
        };
      }

      return {
        status: 'pending',
        receivedAmount: paymentCheck.receivedAmount,
        expectedAmount,
        address
      };

    } catch (error) {
      logger.error('Failed to check order payment status:', error);
      throw error;
    }
  }

  /**
   * Test wallet generation endpoint for a specific currency
   */
  async testWalletGeneration(currency: string): Promise<{
    success: boolean;
    endpoint: string;
    status: number;
    error?: any;
    data?: any;
    mnemonic?: string;
  }> {
    try {
      const endpoint = this.getWalletGenerationEndpoint(currency);
      const chainName = this.getChainName(currency);
      const testMnemonic = this.generateMnemonic();

      // Build query parameters for GET request (like the working curl example)
      const params = new URLSearchParams({
        mnemonic: testMnemonic,
        ...(this.isTestnet && { testnetType: chainName })
      });

      const fullUrl = `${this.baseUrl}${endpoint}?${params.toString()}`;

      logger.info(`Testing wallet generation for ${currency}`, {
        currency,
        endpoint,
        chainName,
        isTestnet: this.isTestnet,
        hasApiKey: !!this.apiKey,
        method: 'GET'
      });

      const response = await this.makeApiRequest<any>(fullUrl, { method: 'GET' });

      return {
        success: response.ok,
        endpoint,
        status: response.status,
        error: response.error,
        data: response.data,
        mnemonic: response.ok ? testMnemonic : undefined
      };
    } catch (error) {
      return {
        success: false,
        endpoint: this.getWalletGenerationEndpoint(currency),
        status: 0,
        error: error instanceof Error ? error.message : error
      };
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    apiKeyConfigured: boolean;
    isTestnet: boolean;
    baseUrl: string;
    notifBaseUrl: string;
    supportedCurrencies: string[];
    paymentPolicy: string;
  } {
    return {
      apiKeyConfigured: !!this.apiKey,
      isTestnet: this.isTestnet,
      baseUrl: this.baseUrl,
      notifBaseUrl: this.notifBaseUrl,
      supportedCurrencies: Array.from(this.currencyConfigs.keys()),
      paymentPolicy: 'Exact payment required - no tolerance for underpayment'
    };
  }
}

// Export singleton instance
export const tatumService = new TatumService();
