export interface PaymentRequest {
    serverId: string;
    userId: string;
    products: Array<{
        id: string;
        quantity: number;
        price: number;
    }>;
    paymentMethod: 'crypto' | 'fiat';
    currency?: string;
    metadata?: Record<string, any>;
}

export interface PaymentResponse {
    orderId: string;
    orderNumber: string;
    paymentAddress?: string;
    qrCode?: string;
    amount: number;
    currency: string;
    expiresAt: string;
    status: string;
}

export interface PaymentStatus {
    orderId: string;
    status: 'pending' | 'paid' | 'confirmed' | 'delivered' | 'cancelled' | 'refunded';
    receivedAmount?: number;
    transactionHash?: string;
    confirmedAt?: string;
}

export interface CryptoPayment {
    address: string;
    coin: string;
    network: string;
    amount: number;
    qrCode?: string;
}

export interface PaymentWebhook {
    orderId: string;
    transactionHash: string;
    amount: number;
    currency: string;
    status: string;
    timestamp: string;
}