export interface Server {
  id: string;
  discord_server_id: string;
  name: string;
  icon?: string;
  owner_id: string;
  bot_invited: boolean;
  bot_config: BotConfig;
  subscription_tier: 'free' | 'basic' | 'premium';
  subscription_expires_at?: string;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface BotConfig {
  name?: string;
  avatar_url?: string;
  color?: string;
  prefix?: string;
  welcome_message?: string;
  shop_channel_id?: string;
  admin_role_id?: string;
  currency_symbol?: string;
  embed_footer?: string;
  show_stock?: boolean;
  auto_role_on_purchase?: boolean;
  templates?: BotTemplates;
}

export interface EmbedTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  color: string;
  thumbnail_url: string;
  footer_text: string;
  footer_icon_url: string;
  fields: Array<{
    name: string;
    value: string;
    inline: boolean;
  }>;
}

export interface BotTemplates {
  public_homepage: EmbedTemplate;
  private_main_menu: EmbedTemplate;
  confirmation_page: EmbedTemplate;
  invoice_page: EmbedTemplate;
}

export interface ServerStats {
  total_sales: number;
  total_revenue: number;
  active_products: number;
  total_orders: number;
  recent_orders: Order[];
}

export interface Order {
  id: string;
  user_id: string;
  discord_user_id: string;
  total_amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'delivered' | 'failed';
  created_at: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  delivered: boolean;
}

export interface Product {
  id: string;
  server_id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  image_url?: string;
  stock_quantity?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  server_id: string;
  name: string;
  description?: string;
  emoji?: string; // Keep for backward compatibility during migration
  image_url?: string;
  sort_order: number;
  created_at: string;
}

export interface BotStatus {
  is_online: boolean;
  is_in_server: boolean;
  has_permissions: boolean;
  missing_permissions: string[];
  last_seen?: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  okx_wallet_address?: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  server_id?: string;
  product_id?: string;
  type: 'purchase' | 'withdrawal' | 'subscription';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  okx_transaction_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRequest {
  amount: number;
  address: string;
}

// Enhanced error response types for Discord API resilience
export interface EnhancedApiError {
  success: false;
  error: {
    code: string;
    message: string;
    timestamp: string;
    retryable: boolean;
    retryAfter?: number;
    attempts?: number;
    cached?: boolean;
  };
}

export interface ApiResponseWithResilience<T> {
  success: true;
  data: T;
  cached?: boolean;
  retryCount?: number;
  responseTime?: number;
  timestamp: string;
}

// Loading states for Discord API requests
export interface DiscordApiLoadingState {
  isLoading: boolean;
  isRetrying: boolean;
  retryCount: number;
  error: string | null;
  isStale: boolean;
}