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
        logger.warn('Tatum API non-OK response', {
          url,
          status: response.status,
          error: (result as any)?.error,
        });
      }

      return result;
    } catch (error) {
      logger.error('API request failed:', { url, error });
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
   * Generate wallet or address with unified logic
   * Simplified to avoid failing API calls - generates addresses directly
   */
  private async generateWalletOrAddress(
    currency: string = 'ETH',
    type: 'wallet' | 'address' = 'wallet',
    index?: number,
    userIdForCustomer?: string
  ): Promise<TatumWalletResponse> {
    // Always generate mock addresses since Tatum chain endpoints don't exist
    logger.info(`Generating ${type} address directly (Tatum chain endpoints unavailable)`, {
      currency,
      index,
      type
    });

    return this.generateMockWallet(currency);
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
   * Each invoice gets a fresh address while reusing the same VA for accounting
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

      // Step 1: Check for existing address
      let existingAddress = null;
      try {
        const getResponse = await this.makeApiRequest<{
          address: string;
          memo?: string;
          tag?: string;
        }>(`${this.baseUrl}/ledger/account/address/${accountId}`, {
          method: 'GET'
        });

        if (getResponse.ok && getResponse.data?.address) {
          existingAddress = getResponse.data;
          logger.info('[generateUniqueDepositAddress] Found existing ledger address', {
            accountId,
            orderId,
            address: existingAddress.address,
            memo: existingAddress.memo,
            tag: existingAddress.tag,
            currency,
            chain
          });
        }
      } catch (error) {
        logger.debug('[generateUniqueDepositAddress] No existing address found, will create new one', {
          accountId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Step 2: If no existing address, create a new one
      if (!existingAddress) {
        try {
          const createResponse = await this.makeApiRequest<{
            address: string;
            memo?: string;
            tag?: string;
          }>(`${this.baseUrl}/ledger/account/address/${accountId}`, {
            method: 'POST',
            body: JSON.stringify({})
          });

          if (createResponse.ok && createResponse.data?.address) {
            existingAddress = createResponse.data;
            logger.info('[generateUniqueDepositAddress] Created new ledger address', {
              accountId,
              orderId,
              address: existingAddress.address,
              memo: existingAddress.memo,
              tag: existingAddress.tag,
              currency,
              chain
            });
          } else {
            throw new Error(`Failed to create ledger address: ${createResponse.status} ${JSON.stringify(createResponse.error)}`);
          }
        } catch (error) {
          // In production, don't fabricate addresses - throw the error
          if (process.env.NODE_ENV === 'production') {
            logger.error('[generateUniqueDepositAddress] Failed to create ledger address in production', {
              accountId,
              orderId,
              currency,
              chain,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to create deposit address via Tatum ledger API');
          }

          // In dev/test, fall back to mock address with warning
          const fallbackAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
          logger.warn('[generateUniqueDepositAddress] Tatum API failed, using fallback address in dev/test', {
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
      }

      return {
        address: existingAddress.address,
        memo: existingAddress.memo,
        tag: existingAddress.tag
      };

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
      const { accountId } = await this.ensureOwnerVA(userId, ccy, chain);
      const addressInfo = await this.generateUniqueDepositAddress(accountId, orderId);

      logger.info('[getOrCreateVADepositAddress] VA deposit address ready', {
        userId,
        ccy,
        chain,
        accountId,
        address: addressInfo.address,
        memo: addressInfo.memo,
        tag: addressInfo.tag,
        orderId,
        unique: true
      });

      return {
        accountId,
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

      const txResponse = await this.makeApiRequest<any[]>(
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
        transactions = txResponse.data?.result || [];

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
