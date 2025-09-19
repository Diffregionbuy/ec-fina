-- EcBot SaaS Platform - Database Indexes
-- Migration: 003_indexes.sql

-- Users table indexes
CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Servers table indexes
CREATE INDEX idx_servers_discord_server_id ON servers(discord_server_id);
CREATE INDEX idx_servers_owner_id ON servers(owner_id);
CREATE INDEX idx_servers_subscription_tier ON servers(subscription_tier);
CREATE INDEX idx_servers_subscription_expires_at ON servers(subscription_expires_at);
CREATE INDEX idx_servers_bot_invited ON servers(bot_invited);

-- Categories table indexes
CREATE INDEX idx_categories_server_id ON categories(server_id);
CREATE INDEX idx_categories_sort_order ON categories(server_id, sort_order);
CREATE INDEX idx_categories_name ON categories(server_id, name);

-- Products table indexes
CREATE INDEX idx_products_server_id ON products(server_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active ON products(server_id, is_active);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_stock_quantity ON products(stock_quantity);
CREATE INDEX idx_products_created_at ON products(created_at);
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Wallets table indexes
CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- Transactions table indexes
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_server_id ON transactions(server_id);
CREATE INDEX idx_transactions_product_id ON transactions(product_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_okx_transaction_id ON transactions(okx_transaction_id);
CREATE INDEX idx_transactions_user_status ON transactions(user_id, status);
CREATE INDEX idx_transactions_server_status ON transactions(server_id, status);



-- Setup templates table indexes
CREATE INDEX idx_setup_templates_category ON setup_templates(category);
CREATE INDEX idx_setup_templates_is_active ON setup_templates(is_active);
CREATE INDEX idx_setup_templates_name ON setup_templates(name);

-- Onboarding progress table indexes
CREATE INDEX idx_onboarding_progress_user_id ON onboarding_progress(user_id);
CREATE INDEX idx_onboarding_progress_server_id ON onboarding_progress(server_id);
CREATE INDEX idx_onboarding_progress_current_step ON onboarding_progress(current_step);
CREATE INDEX idx_onboarding_progress_is_completed ON onboarding_progress(is_completed);
CREATE INDEX idx_onboarding_progress_template_id ON onboarding_progress(selected_template_id);

-- Composite indexes for common query patterns
CREATE INDEX idx_products_server_category_active ON products(server_id, category_id, is_active);
CREATE INDEX idx_transactions_user_type_status ON transactions(user_id, type, status);


-- Partial indexes for better performance on filtered queries
CREATE INDEX idx_products_active_only ON products(server_id, created_at) WHERE is_active = true;
CREATE INDEX idx_transactions_pending_only ON transactions(created_at) WHERE status = 'pending';
CREATE INDEX idx_servers_with_bot ON servers(owner_id) WHERE bot_invited = true;

-- GIN indexes for JSONB columns
CREATE INDEX idx_servers_bot_config ON servers USING gin(bot_config);
CREATE INDEX idx_transactions_metadata ON transactions USING gin(metadata);
CREATE INDEX idx_setup_templates_bot_config ON setup_templates USING gin(bot_config);
CREATE INDEX idx_setup_templates_default_categories ON setup_templates USING gin(default_categories);
CREATE INDEX idx_setup_templates_default_products ON setup_templates USING gin(default_products);
CREATE INDEX idx_onboarding_progress_data ON onboarding_progress USING gin(progress_data);