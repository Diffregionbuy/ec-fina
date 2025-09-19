import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface OKXConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  sandbox: boolean;
}

export interface PaymentIntent {
  id: string;
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  paymentUrl?: string;
  expiresAt: string;
  metadata?: Record<string, any>;
}

export interface WithdrawalRequest {
  id: string;
  amount: string;
  currency: string;
  address: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  fee?: string;
}

export interface OKXWebhookPayload {
  eventType: string;
  data: {
    orderId: string;
    amount: string;
    currency: string;
    status: string;
    timestamp: string;
    metadata?: Record<string, any>;
  };
  signature: string;
  timestamp: string;
}

export class OKXService {
  private client: AxiosInstance;
  private config: OKXConfig;
  private baseURL: string;

  constructor(config: OKXConfig) {
    this.config = config;
    this.baseURL = config.sandbox 
      ? 'https://www.okx.com/api/v5' 
      : 'https://www.okx.com/api/v5';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': config.apiKey,
        'OK-ACCESS-PASSPHRASE': config.passphrase,
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => this.signRequest(config),
      (error) => {
        logger.error('OKX API request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('OKX API response:', {
          url: response.config.url,
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('OKX API response error:', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        return Promise.reject(this.handleAPIError(error));
      }
    );
  }

  /**
   * Sign OKX API request with required headers
   */
  private signRequest(config: AxiosRequestConfig): AxiosRequestConfig {
    const timestamp = new Date().toISOString();
    const method = config.method?.toUpperCase() || 'GET';
    const requestPath = config.url || '';
    const body = config.data ? JSON.stringify(config.data) : '';
    
    // Create signature string: timestamp + method + requestPath + body
    const signatureString = timestamp + method + requestPath + body;
    
    // Create HMAC SHA256 signature
    const signature = crypto
      .createHmac('sha256', this.config.secretKey)
      .update(signatureString)
      .digest('base64');

    // Add required headers
    config.headers = {
      ...config.headers,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
    };

    return config;
  }

  /**
   * Handle API errors and convert to standardized format
   */
  private handleAPIError(error: any): Error {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.msg || data?.message || `OKX API error: ${status}`;
      const apiError = new Error(message);
      (apiError as any).status = status;
      (apiError as any).code = data?.code || 'OKX_API_ERROR';
      (apiError as any).details = data;
      return apiError;
    }
    
    if (error.request) {
      const networkError = new Error('OKX API network error');
      (networkError as any).code = 'NETWORK_ERROR';
      return networkError;
    }
    
    return error;
  }

  /**
   * Create a payment intent for a purchase
   */
  async createPaymentIntent(params: {
    amount: string;
    currency: string;
    orderId: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentIntent> {
    try {
      logger.info('Creating OKX payment intent:', params);

      const response = await this.client.post('/asset/deposit-address', {
        ccy: params.currency,
        amt: params.amount,
        to: '6', // Funding account
        clientId: params.orderId,
        tag: params.description,
      });

      const { data } = response.data;
      
      if (!data || data.length === 0) {
        throw new Error('Failed to create payment intent');
      }

      const paymentData = data[0];
      
      const paymentIntent: PaymentIntent = {
        id: paymentData.depId || params.orderId,
        amount: params.amount,
        currency: params.currency,
        status: 'pending',
        paymentUrl: paymentData.addr, // Deposit address
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        metadata: params.metadata,
      };

      logger.info('Payment intent created successfully:', paymentIntent);
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to create payment intent:', error);
      throw error;
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentIntent | null> {
    try {
      const response = await this.client.get('/asset/deposit-history', {
        params: {
          ccy: 'USDT', // Default currency, should be parameterized
          depId: paymentId,
        },
      });

      const { data } = response.data;
      
      if (!data || data.length === 0) {
        return null;
      }

      const deposit = data[0];
      
      return {
        id: deposit.depId,
        amount: deposit.amt,
        currency: deposit.ccy,
        status: this.mapDepositStatus(deposit.state),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get payment status:', error);
      throw error;
    }
  }

  /**
   * Process withdrawal request
   */
  async processWithdrawal(params: {
    amount: string;
    currency: string;
    address: string;
    tag?: string;
    clientId?: string;
  }): Promise<WithdrawalRequest> {
    try {
      logger.info('Processing OKX withdrawal:', params);

      const response = await this.client.post('/asset/withdrawal', {
        ccy: params.currency,
        amt: params.amount,
        dest: '4', // On-chain withdrawal
        toAddr: params.address,
        tag: params.tag,
        clientId: params.clientId || `withdrawal_${Date.now()}`,
        fee: await this.getWithdrawalFee(params.currency),
      });

      const { data } = response.data;
      
      if (!data || data.length === 0) {
        throw new Error('Failed to process withdrawal');
      }

      const withdrawalData = data[0];
      
      const withdrawal: WithdrawalRequest = {
        id: withdrawalData.wdId,
        amount: params.amount,
        currency: params.currency,
        address: params.address,
        status: this.mapWithdrawalStatus(withdrawalData.state),
        fee: withdrawalData.fee,
      };

      logger.info('Withdrawal processed successfully:', withdrawal);
      return withdrawal;
    } catch (error) {
      logger.error('Failed to process withdrawal:', error);
      throw error;
    }
  }

  /**
   * Get withdrawal fee for a currency
   */
  async getWithdrawalFee(currency: string): Promise<string> {
    try {
      const response = await this.client.get('/asset/currencies', {
        params: { ccy: currency },
      });

      const { data } = response.data;
      
      if (!data || data.length === 0) {
        return '0';
      }

      return data[0].minFee || '0';
    } catch (error) {
      logger.warn('Failed to get withdrawal fee, using default:', error);
      return '0';
    }
  }

  /**
   * Get account balance
   */
  async getBalance(currency?: string): Promise<Record<string, string>> {
    try {
      const response = await this.client.get('/account/balance', {
        params: currency ? { ccy: currency } : {},
      });

      const { data } = response.data;
      
      if (!data || data.length === 0) {
        return {};
      }

      const balances: Record<string, string> = {};
      
      data[0].details?.forEach((detail: any) => {
        balances[detail.ccy] = detail.availBal || '0';
      });

      return balances;
    } catch (error) {
      logger.error('Failed to get account balance:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string, timestamp: string): boolean {
    try {
      const signatureString = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.secretKey)
        .update(signatureString)
        .digest('base64');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'base64'),
        Buffer.from(expectedSignature, 'base64')
      );
    } catch (error) {
      logger.error('Failed to verify webhook signature:', error);
      return false;
    }
  }

  /**
   * Map OKX deposit status to our status
   */
  private mapDepositStatus(state: string): PaymentIntent['status'] {
    switch (state) {
      case '0':
        return 'pending';
      case '1':
        return 'completed';
      case '2':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Map OKX withdrawal status to our status
   */
  private mapWithdrawalStatus(state: string): WithdrawalRequest['status'] {
    switch (state) {
      case '-3':
        return 'pending';
      case '-2':
        return 'failed';
      case '-1':
        return 'failed';
      case '0':
        return 'pending';
      case '1':
        return 'processing';
      case '2':
        return 'completed';
      default:
        return 'pending';
    }
  }
}

// Create singleton instance
let okxService: OKXService | null = null;

export function getOKXService(): OKXService {
  if (!okxService) {
    const config: OKXConfig = {
      apiKey: process.env.OKX_API_KEY || '',
      secretKey: process.env.OKX_SECRET_KEY || '',
      passphrase: process.env.OKX_PASSPHRASE || '',
      sandbox: process.env.OKX_SANDBOX === 'true',
    };

    if (!config.apiKey || !config.secretKey || !config.passphrase) {
      throw new Error('Missing OKX configuration. Please check OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE environment variables.');
    }

    okxService = new OKXService(config);
  }

  return okxService;
}