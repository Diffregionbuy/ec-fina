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
  }

  /**
   * Initialize currency configurations
   */
  private initializeCurrencyConfigs(): Map<string, CurrencyConfig> {
    const configs = new Map<string, CurrencyConfig>();
    
    const currencies = [
      { keys: ['ETH', 'ETHEREUM'], ticker: 'ETH', mainnet: 'ethereum-mainnet', testnet: 'ethereum-sepolia', endpoint: 'ethereum' },
      { keys: ['BTC', 'BITCOIN'], ticker: 'BTC', mainnet: 'bitcoin-mainnet', testnet: 'bitcoin-testnet', endpoint: 'bitcoin' },
      { keys: ['MATIC', 'POLYGON'], ticker: 'MATIC', mainnet: 'polygon-mainnet', testnet: 'polygon-amoy', endpoint: 'polygon' },
      { keys: ['BNB', 'BSC', 'BINANCE'], ticker: 'BSC', mainnet: 'bsc-mainnet', testnet: 'bsc-testnet', endpoint: 'bsc' },
      { keys: ['SOL', 'SOLANA'], ticker: 'SOL', mainnet: 'solana-mainnet', testnet: 'solana-devnet', endpoint: 'solana' },
      { keys: ['TRX', 'TRON'], ticker: 'TRON', mainnet: 'tron-mainnet', testnet: 'tron-shasta', endpoint: 'tron' },
      { keys: ['XRP'], ticker: 'XRP', mainnet: 'xrp-mainnet', testnet: 'xrp-testnet', endpoint: 'xrp' },
      { keys: ['ADA', 'CARDANO'], ticker: 'ADA', mainnet: 'cardano-mainnet', testnet: 'cardano-preprod', endpoint: 'cardano' },
      { keys: ['DOGE'], ticker: 'DOGE', mainnet: 'dogecoin-mainnet', testnet: 'dogecoin-testnet', endpoint: 'dogecoin' },
      { keys: ['LTC'], ticker: 'LTC', mainnet: 'litecoin-mainnet', testnet: 'litecoin-testnet', endpoint: 'litecoin' }
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
   */
  private async generateWalletOrAddress(
    currency: string = 'ETH', 
    type: 'wallet' | 'address' = 'wallet',
    index?: number,
    userIdForCustomer?: string
  ): Promise<TatumWalletResponse> {
    if (this.shouldUseMockMode()) {
      logger.info(`Using mock ${type} generation for development/testnet`, {
        hasApiKey: !!this.apiKey,
        isTestnet: this.isTestnet,
        nodeEnv: process.env.NODE_ENV
      });
      return this.generateMockWallet(currency);
    }

    logger.info(`Generating real Tatum ${type} for production`, { currency, index });
    
    const mnemonic = this.generateMnemonic();
    const chainName = this.getChainName(currency);
    const baseChain = chainName.includes('-') ? chainName.split('-')[0] : chainName;
    const testnetQuery = chainName.includes('-') ? `?testnetType=${chainName}` : '';
    const endpoint = `/${baseChain}/${type}${testnetQuery}`;
    const requestBody: any = type === 'address' ? { index: index || 0, mnemonic } : { mnemonic };
    // When creating a wallet (ledger account), attach customer linkage
    if (type === 'wallet') {
      // Attach accountCode/accountingCurrency/compliant already handled in createVirtualAccount flow,
      // but for completeness, keep minimal body here.
      // This path is used by generateWallet(); createVirtualAccount posts directly to ledger/account.
    }

    const apiResponse = await this.makeApiRequest<TatumWalletResponse>(
      `${this.baseUrl}${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody)
      },
      this.generateMockWallet(currency)
    );

    if (!apiResponse.ok) {
      logger.error(`Tatum ${type} generation failed:`, {
        status: apiResponse.status,
        error: apiResponse.error,
        endpoint,
        requestBody
      });
      logger.warn(`Falling back to mock ${type} due to API error`);
      return this.generateMockWallet(currency);
    }

    logger.info(`Real Tatum ${type} generated successfully`, {
      address: apiResponse.data?.address,
      currency
    });

    return {
      address: apiResponse.data!.address,
      privateKey: apiResponse.data!.privateKey,
      currency
    };
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
        } catch {}
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
      } catch {}
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
      const endpoints = [ `${this.baseUrl}/ledger/customer` ];
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
   */
  private generateMockWallet(currency: string): TatumWalletResponse {
    const mockAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
    const mockPrivateKey = crypto.randomBytes(32).toString('hex');
    
    logger.info('Generated mock wallet for development', { 
      address: mockAddress, 
      currency 
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
   * Check if payment amount is sufficient
   */
  private isPaymentSufficient(received: number, expected: number, tolerancePercent: number = 1): boolean {
    const tolerance = expected * (tolerancePercent / 100);
    return received >= (expected - tolerance);
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
   * Check payment status for an order
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
      const { data: order, error } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (error || !order) {
        throw new Error('Order not found');
      }

      const result = {
        status: order.status,
        address: order.crypto_info?.address,
        expectedAmount: parseFloat(order.expected_amount),
        receivedAmount: parseFloat(order.received_amount || '0'),
        transactionHash: order.transaction_hash,
        confirmations: 0
      };

      // If we have a transaction hash, get confirmation count
      if (order.transaction_hash && this.apiKey) {
        try {
          const transaction = await this.getTransaction(
            order.transaction_hash, 
            order.crypto_info?.currency || 'ETH'
          );
          result.confirmations = transaction.confirmations || 0;
        } catch (error) {
          logger.warn('Failed to get transaction confirmations:', error);
        }
      }

      return result;
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
   * Get service health status
   */
  getHealthStatus(): {
    apiKeyConfigured: boolean;
    isTestnet: boolean;
    baseUrl: string;
    notifBaseUrl: string;
    supportedCurrencies: string[];
  } {
    return {
      apiKeyConfigured: !!this.apiKey,
      isTestnet: this.isTestnet,
      baseUrl: this.baseUrl,
      notifBaseUrl: this.notifBaseUrl,
      supportedCurrencies: Array.from(this.currencyConfigs.keys())
    };
  }
}

// Export singleton instance
export const tatumService = new TatumService();
