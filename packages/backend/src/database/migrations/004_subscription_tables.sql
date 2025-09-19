-- EcBot SaaS Platform - Subscription Management Tables
-- Migration: 004_subscription_tables.sql

-- Subscription plans table
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(10) DEFAULT 'USD',
    billing_interval VARCHAR(20) NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    features JSONB NOT NULL DEFAULT '{}',
    limits JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User subscriptions table
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    payment_transaction_id UUID REFERENCES transactions(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(server_id) -- One subscription per server
);

-- Subscription usage tracking table
CREATE TABLE subscription_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL,
    usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0),
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subscription_id, feature_key, period_start)
);

-- Insert default subscription plans
INSERT INTO subscription_plans (name, display_name, description, price, billing_interval, features, limits, sort_order) VALUES
('free', 'Free', 'Basic features for small servers', 0.00, 'monthly', 
 '{"Automatically deliver Minecraft products": true,"Fully customizable bot appearance": true, "Recieve 300+ crypto coins ": true, "basic_support": true}',
 '{"max_products": 25, "max_categories": 10, "max_transactions_per_month": 250, "storage_mb": 100}', 1),
 
('pro', 'Pro', 'Advanced features for growing servers', 9.99, 'monthly',
 '{"basic_bot": true, "product_management": true, "advanced_analytics": true, "priority_support": true, "custom_branding": true}',
 '{"max_products": 500, "max_categories": 50, "max_transactions_per_month": 5000, "custom_commands": true, "storage_mb": 1000, "api_calls_per_day": 10000}', 2),
 
('enterprise', 'Enterprise', 'Full features for large servers', 29.99, 'monthly',
 '{"basic_bot": true, "product_management": true, "advanced_analytics": true, "priority_support": true, "custom_branding": true, "api_access": true, "white_label": true}',
 '{"max_products": -1, "max_categories": -1, "max_transactions_per_month": -1, "custom_commands": true, "dedicated_support": true, "storage_mb": -1, "api_calls_per_day": -1}', 3);

-- Create indexes for better performance
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_server_id ON user_subscriptions(server_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_period_end ON user_subscriptions(current_period_end);
CREATE INDEX idx_subscription_usage_subscription_id ON subscription_usage(subscription_id);
CREATE INDEX idx_subscription_usage_feature_key ON subscription_usage(feature_key);
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active);

-- Update servers table to reference subscription instead of storing tier directly
ALTER TABLE servers DROP COLUMN IF EXISTS subscription_tier;
ALTER TABLE servers DROP COLUMN IF EXISTS subscription_expires_at;