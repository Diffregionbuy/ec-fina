-- EcBot SaaS Platform - Advanced Database Indexes and Optimizations
-- Migration: 009_advanced_indexes.sql

-- Advanced composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_products_server_active_price ON products(server_id, is_active, price) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_server_category_active_created ON products(server_id, category_id, is_active, created_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_search_active ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, ''))) WHERE is_active = true;

-- Optimized indexes for user-server relationships
CREATE INDEX IF NOT EXISTS idx_servers_owner_bot_invited ON servers(owner_id, bot_invited);
CREATE INDEX IF NOT EXISTS idx_servers_discord_id_owner ON servers(discord_server_id, owner_id);

-- Transaction and order performance indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_created_status ON transactions(user_id, created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_transactions_server_created_status ON transactions(server_id, created_at DESC, status);



-- Subscription management indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_server_status_period ON user_subscriptions(server_id, status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expiring_soon ON user_subscriptions(current_period_end) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscription_usage_subscription_period ON subscription_usage(subscription_id, period_start, period_end);





-- Onboarding progress optimization
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_server_step ON onboarding_progress(user_id, server_id, current_step);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_incomplete ON onboarding_progress(user_id, created_at) WHERE is_completed = false;

-- Product ratings performance
CREATE INDEX IF NOT EXISTS idx_product_ratings_product_rating ON product_ratings(product_id, rating_value DESC);
CREATE INDEX IF NOT EXISTS idx_product_ratings_user_created ON product_ratings(user_id, created_at DESC);

-- Covering indexes for common SELECT queries
CREATE INDEX IF NOT EXISTS idx_products_list_covering ON products(server_id, is_active, created_at DESC) 
INCLUDE (id, name, price, currency, image_url, stock_quantity, category_id);


-- Partial indexes for better performance on filtered queries
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products(server_id, stock_quantity) 
WHERE stock_quantity IS NOT NULL AND stock_quantity <= 10 AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_transactions_failed_recent ON transactions(created_at DESC) 
WHERE status = 'failed';


-- Expression indexes for common calculations
CREATE INDEX IF NOT EXISTS idx_products_price_usd ON products(server_id, (CASE WHEN currency = 'USD' THEN price ELSE price * 1.0 END)) WHERE is_active = true;

-- Indexes for JSON/JSONB queries
CREATE INDEX IF NOT EXISTS idx_servers_bot_config_prefix ON servers USING gin((bot_config->'prefix'));
CREATE INDEX IF NOT EXISTS idx_servers_bot_config_channels ON servers USING gin((bot_config->'shop_channel_id'), (bot_config->'log_channel_id'));
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_type ON transactions USING gin((metadata->'payment_method'), (metadata->'gateway'));

-- Unique constraints for data integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_discord_id_unique ON servers(discord_server_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id_unique ON users(discord_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_server_name_unique ON categories(server_id, LOWER(name));

-- Statistics and maintenance
ANALYZE users;
ANALYZE servers;
ANALYZE products;
ANALYZE categories;
ANALYZE transactions;

ANALYZE wallets;
ANALYZE user_subscriptions;

-- Create a function to automatically update statistics
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS void AS $$
BEGIN
    ANALYZE users;
    ANALYZE servers;
    ANALYZE products;
    ANALYZE categories;
    ANALYZE transactions;
    ANALYZE wallets;
    ANALYZE user_subscriptions;

    ANALYZE product_ratings;
    ANALYZE bot_config_versions;
    ANALYZE onboarding_progress;
    ANALYZE subscription_usage;
END;
$$ LANGUAGE plpgsql;

-- Schedule statistics updates (requires pg_cron extension)
-- SELECT cron.schedule('update-stats', '0 2 * * *', 'SELECT update_table_statistics();');

COMMENT ON FUNCTION update_table_statistics() IS 'Updates table statistics for query optimization';