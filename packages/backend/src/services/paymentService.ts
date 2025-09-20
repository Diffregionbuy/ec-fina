import { logger } from '../utils/logger';
import { supabase } from '../config/database';
import { tatumService } from './tatumService';

export interface CreatePaymentRequest {
  serverId: string;
  userId: string;
  productId: string;
  quantity: number;
  paymentMethod: boolean; // false = crypto, true = fiat
  discordChannelId?: string;
}

export interface PaymentOrder {
  id: string;
  orderNumber: string;
  serverId: string;
  userId: string;
  products: Array<{
    id: string;
    name: string;
    price: string;
    currency: string;
    quantity: number;
    minecraft_commands?: string[];
  }>;
  totalAmount: number;
  currency: string;
  paymentMethod: 'crypto' | 'fiat';
  status: 'pending' | 'paid' | 'completed' | 'failed' | 'expired' | 'cancelled';
  cryptoInfo?: {
    address: string;
    coin: string;
    network: string;
    amount: string;
    qrCode: string;
    memo?: string;
    tag?: string;
  };
  expiresAt: string;
  createdAt: string;
}

export class PaymentService {
  /**
   * Create a new payment order with crypto payment setup
   */
  async createPaymentOrder(request: CreatePaymentRequest): Promise<PaymentOrder> {
    try {
      const { serverId, userId, productId, quantity, paymentMethod, discordChannelId } = request;

      logger.info('Creating payment order', {
        serverId,
        userId,
        productId,
        quantity,
        paymentMethod
      });

      // Resolve internal server UUID from discord_server_id
      const { data: serverRow, error: serverErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverErr || !serverRow) {
        throw new Error('Server not found');
      }
      const internalServerId = serverRow.id;

      // Get product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, price, currency, minecraft_commands, stock_quantity')
        .eq('id', productId)
        .eq('server_id', internalServerId)
        .eq('is_active', true)
        .single();

      if (productError || !product) {
        throw new Error(`Product not found: ${productId}`);
      }

      // Check stock
      if (product.stock_quantity !== null && product.stock_quantity < quantity) {
        throw new Error(`Insufficient stock for product: ${product.name}`);
      }

      const expectedFiat = parseFloat(product.price) * quantity;
      const productDetails = [{
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        quantity,
        minecraft_commands: product.minecraft_commands
      }];

      // Create payment order in database
      // Determine crypto currency to use if paying with crypto
      const payCrypto = !paymentMethod;
      const cryptoCurrency = product.currency === 'USD' ? 'ETH' : product.currency;

      // If crypto payment and product is priced in fiat, convert to crypto
      let expectedCryptoAmount: number | null = null;
      let conversionInfo: any = null;
      if (payCrypto) {
        if (product.currency === 'USD') {
          conversionInfo = await tatumService.convertFiatToCrypto(expectedFiat, 'USD', cryptoCurrency);
          expectedCryptoAmount = conversionInfo.amount;
        } else {
          expectedCryptoAmount = expectedFiat; // already in crypto units
        }
      }

      const { data: order, error: orderError } = await supabase
        .from('payment_orders')
        .insert({
          server_id: internalServerId,
          user_id: userId,
          product_id: productDetails, // JSONB array
          payment_method: paymentMethod,
          // Store expected_amount in crypto units when paying with crypto, else fiat
          expected_amount: payCrypto ? (expectedCryptoAmount ?? expectedFiat) : expectedFiat,
          status: 'pending',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
          metadata: {
            discord_channel_id: discordChannelId,
            created_by: 'payment_service',
            fiat_expected: expectedFiat,
            fiat_currency: product.currency,
            crypto_currency: payCrypto ? cryptoCurrency : null,
            conversion: conversionInfo
          }
        })
        .select()
        .single();

      if (orderError) {
        logger.error('Failed to create payment order:', orderError);
        throw new Error('Failed to create payment order');
      }

      let cryptoInfo = null;

      // Set up crypto payment if needed
      if (!paymentMethod) {
        try {
          // Resolve shop owner for the server
          const { data: serverDetails, error: serverDetailsError } = await supabase
            .from('servers')
            .select('owner_id')
            .eq('id', internalServerId)
            .single();

          if (serverDetailsError || !serverDetails?.owner_id) {
            throw new Error('Failed to resolve server owner');
          }

          const ownerId = serverDetails.owner_id;

          // Determine target chain from currency
          const targetChain = this.getTargetChain(cryptoCurrency);

          // Get or create VA deposit address for the owner (unique per invoice)
          const vaResult = await tatumService.getOrCreateVADepositAddress(
            ownerId,
            cryptoCurrency,
            targetChain,
            order.id
          );

          logger.info('[invoice] using VA for payment', {
            orderId: order.id,
            accountId: vaResult.accountId,
            currency: cryptoCurrency,
            chain: targetChain,
            ownerId
          });

          logger.info('[invoice] deposit address assigned', {
            orderId: order.id,
            address: vaResult.address,
            accountId: vaResult.accountId
          });

          // Generate QR code with memo/tag support
          const qrCode = this.generateQRCode(
            vaResult.address,
            cryptoCurrency,
            expectedCryptoAmount ? expectedCryptoAmount.toFixed(8) : undefined,
            vaResult.memo,
            vaResult.tag
          );

          cryptoInfo = {
            address: vaResult.address,
            coin: cryptoCurrency,
            network: targetChain,
            amount: (expectedCryptoAmount ?? expectedFiat).toFixed(8),
            qrCode: qrCode,
            fiat_amount: expectedFiat,
            fiat_currency: product.currency,
            conversion_rate: conversionInfo?.rate,
            conversion_source: conversionInfo?.source,
            conversion_at: conversionInfo?.at,
            va_account_id: vaResult.accountId,
            memo: vaResult.memo,
            tag: vaResult.tag
          };

          // Update order with crypto info (no webhook)
          const { error: updateError } = await supabase
            .from('payment_orders')
            .update({
              crypto_info: cryptoInfo,
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id);

          if (updateError) {
            logger.error('Failed to update order with crypto info:', updateError);
          }

          logger.info('Crypto payment setup completed', {
            orderId: order.id,
            address: vaResult.address,
            accountId: vaResult.accountId
          });

        } catch (error) {
          logger.error('Failed to setup crypto payment:', error);
          // Don't fail the order creation, but log the error
          cryptoInfo = {
            address: 'setup_failed',
            coin: cryptoCurrency,
            network: 'ethereum',
            amount: (expectedCryptoAmount ?? expectedFiat).toFixed(8),
            qrCode: 'setup_failed'
          };
        }
      }

      const result: PaymentOrder = {
        id: order.id,
        orderNumber: order.order_number,
        serverId,
        userId,
        products: productDetails,
        totalAmount: expectedFiat,
        currency: product.currency,
        paymentMethod: paymentMethod ? 'fiat' : 'crypto',
        status: 'pending',
        cryptoInfo,
        expiresAt: order.expires_at,
        createdAt: order.created_at
      };

      logger.info('Payment order created successfully', {
        orderId: order.id,
        orderNumber: order.order_number,
        totalAmount: expectedFiat,
        paymentMethod: result.paymentMethod
      });

      return result;

    } catch (error) {
      logger.error('Failed to create payment order:', error);
      throw error;
    }
  }

  /**
   * Get payment order status
   */
  async getPaymentOrderStatus(orderId: string): Promise<{
    orderId: string;
    status: string;
    orderNumber: string;
    totalAmount: number;
    receivedAmount: number;
    currency: string;
    paymentMethod: string;
    cryptoInfo?: any;
    transactionHash?: string;
    confirmations?: number;
    expiresAt: string;
    createdAt: string;
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

      let confirmations = 0;
      if (order.transaction_hash && order.crypto_info?.currency) {
        try {
          const paymentStatus = await tatumService.checkPaymentStatus(orderId);
          confirmations = paymentStatus.confirmations || 0;
        } catch (error) {
          logger.warn('Failed to get payment confirmations:', error);
        }
      }

      const paymentMethodStr = order.payment_method ? 'fiat' : 'crypto';
      const fiatTotal = order.metadata?.fiat_expected ?? (paymentMethodStr === 'fiat' ? Number(order.expected_amount) : 0);
      const fiatCurrency = order.metadata?.fiat_currency ?? (order.product_id?.[0]?.currency || 'USD');
      const currencyCrypto = order.metadata?.crypto_currency ?? order.crypto_info?.currency ?? null;
      const totalAmountCrypto = paymentMethodStr === 'crypto' ? Number(order.expected_amount) : 0;
      const receivedAmt = Number(order.received_amount || 0);

      return {
        orderId: order.id,
        status: order.status,
        orderNumber: order.order_number,
        totalAmount: fiatTotal,
        receivedAmount: receivedAmt,
        currency: fiatCurrency,
        paymentMethod: paymentMethodStr,
        cryptoInfo: order.crypto_info,
        transactionHash: order.transaction_hash,
        confirmations,
        expiresAt: order.expires_at,
        createdAt: order.created_at
      };

    } catch (error) {
      logger.error('Failed to get payment order status:', error);
      throw error;
    }
  }

  /**
   * Cancel payment order
   */
  async cancelPaymentOrder(orderId: string): Promise<void> {
    try {
      const { data: order, error: fetchError } = await supabase
        .from('payment_orders')
        .select('webhook_id, status')
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'pending') {
        throw new Error('Only pending orders can be cancelled');
      }

      // Cancel webhook if exists
      if (order.webhook_id) {
        await tatumService.cancelWebhook(order.webhook_id);
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('payment_orders')
        .update({
          status: 'cancelled',
          webhook_status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) {
        throw new Error('Failed to cancel order');
      }

      logger.info('Payment order cancelled', { orderId });

    } catch (error) {
      logger.error('Failed to cancel payment order:', error);
      throw error;
    }
  }

  /**
   * Process successful payment and trigger fulfillment
   */
  async processSuccessfulPayment(orderId: string): Promise<void> {
    try {
      const { data: order, error } = await supabase
        .from('payment_orders')
        .select(`
          *,
          servers!inner(discord_server_id, name),
          users!inner(discord_id, username)
        `)
        .eq('id', orderId)
        .single();

      if (error || !order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'paid') {
        throw new Error('Order is not in paid status');
      }

      logger.info('Processing successful payment for fulfillment', {
        orderId,
        serverName: order.servers.name,
        username: order.users.username
      });

      // TODO: Implement fulfillment logic
      // 1. Send Discord notification to customer
      // 2. Deliver Minecraft items if applicable
      // 3. Send confirmation email
      // 4. Update analytics

      // For now, mark as completed
      const { error: updateError } = await supabase
        .from('payment_orders')
        .update({
          status: 'completed',
          minecraft_delivered: true,
          minecraft_delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) {
        throw new Error('Failed to update order status');
      }

      logger.info('Payment fulfillment completed', { orderId });

    } catch (error) {
      logger.error('Failed to process successful payment:', error);
      throw error;
    }
  }

  /**
   * Get orders for a server (admin view)
   */
  async getServerOrders(serverId: string, options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    orders: any[];
    total: number;
  }> {
    try {
      const { status, limit = 50, offset = 0 } = options;

      // Resolve internal server UUID
      const { data: serverRow, error: serverErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverErr || !serverRow) {
        throw new Error('Server not found');
      }

      let query = supabase
        .from('payment_orders')
        .select(`
          *,
          users!inner(discord_id, username)
        `)
        .eq('server_id', serverRow.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }

      const { data: orders, error, count } = await query;

      if (error) {
        throw new Error('Failed to fetch orders');
      }

      return {
        orders: orders || [],
        total: count || 0
      };

    } catch (error) {
      logger.error('Failed to get server orders:', error);
      throw error;
    }
  }

  /**
   * Get target chain for a cryptocurrency
   */
  private getTargetChain(cryptoCurrency: string): string {
    const chainMap: Record<string, string> = {
      'ALGO': 'algorand-testnet',
      'ALGORAND': 'algorand-testnet',
      'ETH': 'ethereum-sepolia', // Use testnet for development
      'ETHEREUM': 'ethereum-sepolia',
      'BTC': 'bitcoin-testnet',
      'BITCOIN': 'bitcoin-testnet',
      'MATIC': 'polygon-amoy',
      'POLYGON': 'polygon-amoy',
      'BNB': 'bsc-testnet',
      'BSC': 'bsc-testnet',
      'SOL': 'solana-devnet',
      'SOLANA': 'solana-devnet',
      'TRX': 'tron-shasta',
      'TRON': 'tron-shasta',
      'XRP': 'xrp-testnet',
      'ADA': 'cardano-preprod',
      'CARDANO': 'cardano-preprod',
      'DOGE': 'dogecoin-testnet',
      'LTC': 'litecoin-testnet',
      'AVAX': 'avalanche-fuji',
      'AVALANCHE': 'avalanche-fuji',
      'FTM': 'fantom-testnet',
      'FANTOM': 'fantom-testnet',
      'FLR': 'flare-coston',
      'FLARE': 'flare-coston',
      'KAI': 'kaia-baobab',
      'KAIA': 'kaia-baobab',
      'KLAY': 'kaia-baobab',
      'KLAYTN': 'kaia-baobab',
      'XLM': 'stellar-testnet',
      'STELLAR': 'stellar-testnet',
      'CELO': 'celo-alfajores',
      // Layer 2 and additional EVM chains
      'ARBITRUM': 'arbitrum-sepolia',
      'BASE': 'base-sepolia',
      'OPTIMISM': 'optimism-sepolia',
      // Stablecoins (default to Ethereum testnet, but can be overridden)
      'USDT': 'ethereum-sepolia',
      'USDC': 'ethereum-sepolia',
      'PYUSD': 'ethereum-sepolia'
    };

    // In production, use mainnet
    if (process.env.NODE_ENV === 'production') {
      const mainnetMap: Record<string, string> = {
        'ALGO': 'algorand-mainnet',
        'ALGORAND': 'algorand-mainnet',
        'ETH': 'ethereum-mainnet',
        'ETHEREUM': 'ethereum-mainnet',
        'BTC': 'bitcoin-mainnet',
        'BITCOIN': 'bitcoin-mainnet',
        'MATIC': 'polygon-mainnet',
        'POLYGON': 'polygon-mainnet',
        'BNB': 'bsc-mainnet',
        'BSC': 'bsc-mainnet',
        'SOL': 'solana-mainnet',
        'SOLANA': 'solana-mainnet',
        'TRX': 'tron-mainnet',
        'TRON': 'tron-mainnet',
        'XRP': 'xrp-mainnet',
        'ADA': 'cardano-mainnet',
        'CARDANO': 'cardano-mainnet',
        'DOGE': 'dogecoin-mainnet',
        'LTC': 'litecoin-mainnet',
        'AVAX': 'avalanche-c',
        'AVALANCHE': 'avalanche-c',
        'FTM': 'fantom-mainnet',
        'FANTOM': 'fantom-mainnet',
        'FLR': 'flare-mainnet',
        'FLARE': 'flare-mainnet',
        'KAI': 'kaia-mainnet',
        'KAIA': 'kaia-mainnet',
        'KLAY': 'kaia-mainnet',
        'KLAYTN': 'kaia-mainnet',
        'XLM': 'stellar-mainnet',
        'STELLAR': 'stellar-mainnet',
        'CELO': 'celo-mainnet',
        // Layer 2 and additional EVM chains
        'ARBITRUM': 'arbitrum-one',
        'BASE': 'base-mainnet',
        'OPTIMISM': 'optimism-mainnet',
        // Stablecoins (default to Ethereum mainnet, but can be overridden)
        'USDT': 'ethereum-mainnet',
        'USDC': 'ethereum-mainnet',
        'PYUSD': 'ethereum-mainnet'
      };
      return mainnetMap[cryptoCurrency.toUpperCase()] || 'ethereum-mainnet';
    }

    return chainMap[cryptoCurrency.toUpperCase()] || 'ethereum-sepolia';
  }

  /**
   * Generate QR code data for payment with memo/tag support
   */
  private generateQRCode(address: string, currency: string, amount?: string, memo?: string, tag?: string): string {
    // Generate QR code data based on currency
    const params = new URLSearchParams();
    
    switch (currency.toUpperCase()) {
      case 'ETH':
      case 'ETHEREUM':
        if (amount) params.set('value', amount);
        if (memo) params.set('memo', memo);
        if (tag) params.set('tag', tag);
        return `ethereum:${address}${params.toString() ? `?${params.toString()}` : ''}`;
        
      case 'BTC':
      case 'BITCOIN':
        if (amount) params.set('amount', amount);
        if (memo) params.set('memo', memo);
        if (tag) params.set('tag', tag);
        return `bitcoin:${address}${params.toString() ? `?${params.toString()}` : ''}`;
        
      case 'MATIC':
      case 'POLYGON':
        if (amount) params.set('value', amount);
        if (memo) params.set('memo', memo);
        if (tag) params.set('tag', tag);
        return `ethereum:${address}${params.toString() ? `?${params.toString()}` : ''}`;
        
      case 'XRP':
        if (amount) params.set('amount', amount);
        if (tag) params.set('dt', tag); // XRP uses 'dt' for destination tag
        return `xrp:${address}${params.toString() ? `?${params.toString()}` : ''}`;
        
      case 'XLM':
      case 'STELLAR':
        if (amount) params.set('amount', amount);
        if (memo) params.set('memo', memo);
        return `stellar:${address}${params.toString() ? `?${params.toString()}` : ''}`;
        
      default:
        // For other currencies, include memo/tag as generic parameters
        if (amount) params.set('amount', amount);
        if (memo) params.set('memo', memo);
        if (tag) params.set('tag', tag);
        return params.toString() ? `${address}?${params.toString()}` : address;
    }
  }

  /**
   * Get payment statistics for a server
   */
  async getPaymentStats(serverId: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    completedOrders: number;
    failedOrders: number;
  }> {
    try {
      // Resolve internal server UUID
      const { data: serverRow, error: serverErr } = await supabase
        .from('servers')
        .select('id')
        .eq('discord_server_id', serverId)
        .single();

      if (serverErr || !serverRow) {
        throw new Error('Server not found');
      }

      const { data: stats, error } = await supabase
        .from('payment_orders')
        .select('status, expected_amount')
        .eq('server_id', serverRow.id);

      if (error) {
        throw new Error('Failed to fetch payment stats');
      }

      const result = {
        totalOrders: stats?.length || 0,
        totalRevenue: 0,
        pendingOrders: 0,
        completedOrders: 0,
        failedOrders: 0
      };

      if (stats) {
        for (const order of stats) {
          if (order.status === 'completed' || order.status === 'paid') {
            result.totalRevenue += parseFloat(order.expected_amount);
            result.completedOrders++;
          } else if (order.status === 'pending') {
            result.pendingOrders++;
          } else if (order.status === 'failed' || order.status === 'expired') {
            result.failedOrders++;
          }
        }
      }

      return result;

    } catch (error) {
      logger.error('Failed to get payment stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();