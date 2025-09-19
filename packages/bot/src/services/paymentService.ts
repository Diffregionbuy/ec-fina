import { BotApiService } from './botApiService';
import { paymentLogger, logPayment } from '../utils/logger';
import { 
    PaymentRequest, 
    PaymentResponse, 
    PaymentStatus, 
    PaymentOrder,
    Product 
} from '../types';
import QRCode from 'qrcode';

export class PaymentService {
    private static instance: PaymentService;
    private apiService: BotApiService;
    private orderCache: Map<string, PaymentOrder> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_TTL = 2 * 60 * 1000; // 2 minutes
    private cacheHits = 0;
    private cacheMisses = 0;

    private constructor() {
        this.apiService = BotApiService.getInstance();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): PaymentService {
        if (!PaymentService.instance) {
            PaymentService.instance = new PaymentService();
        }
        return PaymentService.instance;
    }

    public getCacheStats(): { entries: number; hits: number; misses: number } {
        return {
            entries: this.orderCache.size,
            hits: this.cacheHits,
            misses: this.cacheMisses
        };
    }

    public clearCache(): void {
        this.orderCache.clear();
        this.cacheExpiry.clear();
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    /**
     * Create a payment order for products
     */
    public async createPaymentOrder(
        serverId: string,
        userId: string,
        products: Array<{ id: string; quantity: number; price: number }>,
        paymentMethod: 'crypto' | 'fiat' = 'crypto',
        currency: string = 'ETH',
        metadata?: Record<string, any>
    ): Promise<PaymentResponse> {
        try {
            const paymentRequest: PaymentRequest = {
                serverId,
                userId,
                products,
                paymentMethod,
                currency,
                metadata: {
                    ...metadata,
                    createdBy: 'discord_bot',
                    timestamp: new Date().toISOString()
                }
            };

            const response = await this.apiService.createPaymentOrder(paymentRequest);
            
            // Calculate total amount for logging
            const totalAmount = products.reduce((sum, product) => sum + (product.price * product.quantity), 0);
            
            logPayment(response.orderId, 'create', true, totalAmount, currency);
            paymentLogger.info(`Created payment order ${response.orderNumber} for user ${userId}`, {
                orderId: response.orderId,
                serverId,
                userId,
                productCount: products.length,
                totalAmount,
                currency,
                paymentMethod
            });

            return response;
        } catch (error: any) {
            logPayment('unknown', 'create', false, undefined, currency, error);
            throw error;
        }
    }

    /**
     * Get payment order status with caching
     */
    public async getPaymentOrderStatus(orderId: string, forceRefresh: boolean = false): Promise<PaymentOrder> {
        const now = Date.now();

        // Check cache first
        if (!forceRefresh && this.orderCache.has(orderId)) {
            const expiry = this.cacheExpiry.get(orderId) || 0;
            if (now < expiry) {
                paymentLogger.debug(`Using cached order status for ${orderId}`);
                return this.orderCache.get(orderId)!;
            }
        }

        try {
            const order = await this.apiService.getPaymentOrderStatus(orderId);
            
            // Cache the order
            this.orderCache.set(orderId, order);
            this.cacheExpiry.set(orderId, now + this.CACHE_TTL);
            
            logPayment(orderId, 'status_check', true);
            return order;
        } catch (error: any) {
            logPayment(orderId, 'status_check', false, undefined, undefined, error);
            throw error;
        }
    }

    /**
     * Monitor payment order status changes
     */
    public async monitorPaymentOrder(
        orderId: string,
        onStatusChange: (order: PaymentOrder) => void,
        intervalMs: number = 30000, // 30 seconds
        maxDuration: number = 30 * 60 * 1000 // 30 minutes
    ): Promise<void> {
        const startTime = Date.now();
        let lastStatus = '';

        const checkStatus = async () => {
            try {
                const order = await this.getPaymentOrderStatus(orderId, true);
                
                if (order.status !== lastStatus) {
                    lastStatus = order.status;
                    onStatusChange(order);
                    
                    paymentLogger.info(`Payment order ${orderId} status changed to ${order.status}`);
                    
                    // Stop monitoring if order is completed or failed
                    if (['paid', 'confirmed', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
                        logPayment(orderId, 'monitor_complete', true);
                        return;
                    }
                }

                // Continue monitoring if not expired
                if (Date.now() - startTime < maxDuration) {
                    setTimeout(checkStatus, intervalMs);
                } else {
                    paymentLogger.warn(`Payment monitoring timeout for order ${orderId}`);
                    logPayment(orderId, 'monitor_timeout', false);
                }
            } catch (error: any) {
                paymentLogger.error(`Error monitoring payment order ${orderId}:`, error);
                logPayment(orderId, 'monitor_error', false, undefined, undefined, error);
                
                // Retry after a longer interval
                setTimeout(checkStatus, intervalMs * 2);
            }
        };

        // Start monitoring
        logPayment(orderId, 'monitor_start', true);
        checkStatus();
    }

    /**
     * Generate QR code for crypto payment
     */
    public async generatePaymentQR(
        address: string,
        amount: number,
        currency: string = 'ETH'
    ): Promise<string> {
        try {
            let qrData: string;

            // Format QR data based on currency
            switch (currency.toLowerCase()) {
                case 'eth':
                case 'ethereum':
                    qrData = `ethereum:${address}?value=${amount}`;
                    break;
                case 'btc':
                case 'bitcoin':
                    qrData = `bitcoin:${address}?amount=${amount}`;
                    break;
                default:
                    qrData = `${currency.toLowerCase()}:${address}?amount=${amount}`;
            }

            const qrCodeDataURL = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'M',
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                width: 256
            });

            paymentLogger.debug(`Generated QR code for ${currency} payment`, {
                address,
                amount,
                currency
            });

            return qrCodeDataURL;
        } catch (error: any) {
            paymentLogger.error('Error generating QR code:', error);
            throw new Error(`Failed to generate QR code: ${error.message}`);
        }
    }

    /**
     * Calculate shopping cart total
     */
    public calculateCartTotal(products: Array<{ price: number; quantity: number }>): number {
        return products.reduce((total, product) => total + (product.price * product.quantity), 0);
    }

    /**
     * Validate payment request
     */
    public validatePaymentRequest(paymentRequest: PaymentRequest): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!paymentRequest.serverId) {
            errors.push('Server ID is required');
        }

        if (!paymentRequest.userId) {
            errors.push('User ID is required');
        }

        if (!paymentRequest.products || paymentRequest.products.length === 0) {
            errors.push('At least one product is required');
        }

        if (paymentRequest.products) {
            paymentRequest.products.forEach((product: any, index: number) => {
                if (!product.id) {
                    errors.push(`Product ${index + 1}: ID is required`);
                }
                if (!product.quantity || product.quantity <= 0) {
                    errors.push(`Product ${index + 1}: Quantity must be greater than 0`);
                }
                if (!product.price || product.price <= 0) {
                    errors.push(`Product ${index + 1}: Price must be greater than 0`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Format payment amount for display
     */
    public formatPaymentAmount(amount: number, currency: string): string {
        const decimals = this.getCurrencyDecimals(currency);
        return `${amount.toFixed(decimals)} ${currency.toUpperCase()}`;
    }

    /**
     * Get currency decimal places
     */
    private getCurrencyDecimals(currency: string): number {
        switch (currency.toLowerCase()) {
            case 'btc':
            case 'bitcoin':
                return 8;
            case 'eth':
            case 'ethereum':
                return 6;
            case 'usdt':
            case 'usdc':
                return 2;
            default:
                return 4;
        }
    }

    /**
     * Get payment status emoji
     */
    public getPaymentStatusEmoji(status: string): string {
        switch (status.toLowerCase()) {
            case 'pending':
                return '⏳';
            case 'paid':
                return '💰';
            case 'confirmed':
                return '✅';
            case 'delivered':
                return '📦';
            case 'cancelled':
                return '❌';
            case 'refunded':
                return '↩️';
            default:
                return '❓';
        }
    }

    /**
     * Get payment status description
     */
    public getPaymentStatusDescription(status: string): string {
        switch (status.toLowerCase()) {
            case 'pending':
                return 'Waiting for payment';
            case 'paid':
                return 'Payment received, confirming...';
            case 'confirmed':
                return 'Payment confirmed';
            case 'delivered':
                return 'Order delivered';
            case 'cancelled':
                return 'Order cancelled';
            case 'refunded':
                return 'Payment refunded';
            default:
                return 'Unknown status';
        }
    }

    /**
     * Check if payment is expired
     */
    public isPaymentExpired(order: PaymentOrder): boolean {
        if (!order.expires_at) {
            return false;
        }

        return new Date(order.expires_at) < new Date();
    }

    /**
     * Get time remaining for payment
     */
    public getTimeRemaining(order: PaymentOrder): string {
        if (!order.expires_at) {
            return 'No expiration';
        }

        const now = new Date();
        const expiry = new Date(order.expires_at);
        const diff = expiry.getTime() - now.getTime();

        if (diff <= 0) {
            return 'Expired';
        }

        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }


}