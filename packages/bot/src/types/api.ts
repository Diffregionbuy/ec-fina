export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface AuthResponse {
    token: string;
    expiresIn: number;
    service: string;
    permissions: string[];
}

export interface ServerTemplate {
    id: string;
    name: string;
    type: string;
    content: any;
    variables?: Record<string, any>;
}

export interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    category_id: string;
    server_id: string;
    is_active: boolean;
    metadata?: Record<string, any>;
    rating_avg?: number;
    rating_count?: number;
}

export interface Category {
    id: string;
    name: string;
    description?: string;
    image_url?: string;
    server_id: string;
    is_active: boolean;
    sort_order?: number;
}

export interface PaymentOrder {
    id: string;
    server_id: string;
    user_id: string;
    product_id: any; // JSONB - can be single product or cart
    order_number: string;
    payment_method: boolean; // false = crypto, true = fiat
    crypto_info?: {
        address: string;
        coin: string;
        network: string;
        amount: number;
        qr_code?: string;
    };
    status: 'pending' | 'paid' | 'confirmed' | 'delivered' | 'cancelled' | 'refunded';
    received_amount?: number;
    transaction_hash?: string;
    confirmed_at?: string;
    expires_at?: string;
    metadata?: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface MinecraftAccount {
    id: string;
    discord_user_id: string;
    minecraft_uuid?: string;
    minecraft_username?: string;
    link_code?: string;
    server_id: string;
    is_verified: boolean;
    linked_at?: string;
    created_at: string;
}