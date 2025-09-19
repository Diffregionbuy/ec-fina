-- EcBot SaaS Platform - Payment Orders Table
-- Migration: 005_payment_orders_table.sql
-- Phase 1.2: Database Schema Extensions

-- Payment orders table (consolidated design)
CREATE TABLE payment_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Order Information
    order_number VARCHAR(50) UNIQUE NOT NULL,
    product_id JSONB NOT NULL, -- Shopping cart support: [{"id": "prod_123", "quantity": 2}, ...]
    
    -- Payment Configuration
    payment_method BOOLEAN DEFAULT FALSE, -- FALSE = crypto, TRUE = fiat
    crypto_info JSONB DEFAULT '{}', -- {address, coin, network, amount, private_key_encrypted}
    
    -- Order Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'completed', 'failed', 'expired', 'cancelled')),
    received_amount DECIMAL(18,8) DEFAULT 0,
    expected_amount DECIMAL(18,8) NOT NULL,
    transaction_hash VARCHAR(255),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
    
    -- Webhook Integration (consolidated)
    webhook_id VARCHAR(255), -- Tatum webhook ID
    webhook_type VARCHAR(50), -- 'tatum_payment', 'manual_confirmation', etc.
    webhook_created_at TIMESTAMP WITH TIME ZONE,
    payload JSONB DEFAULT '{}', -- Full webhook payload for debugging
    webhook_status VARCHAR(20) DEFAULT 'pending' CHECK (webhook_status IN ('pending', 'received', 'processed', 'failed')),
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Minecraft Integration
    minecraft_delivered BOOLEAN DEFAULT FALSE,
    minecraft_delivery_attempts INTEGER DEFAULT 0,
    minecraft_delivery_error TEXT,
    minecraft_delivered_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}', -- Additional order data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Minecraft account linking table
CREATE TABLE minecraft_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discord_user_id UUID NOT NULL, -- Changed from VARCHAR to UUID to match users.id
    minecraft_uuid VARCHAR(36), -- Minecraft player UUID
    minecraft_username VARCHAR(16), -- Current Minecraft username
    
    -- Linking Process
    link_code VARCHAR(10) UNIQUE, -- The 123456 code for /ecbot link
    link_code_expires_at TIMESTAMP WITH TIME ZONE,
    linked_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE, -- Verified through Minecraft plugin
    
    -- Metadata
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE, -- Which Discord server this link belongs to
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(discord_user_id, server_id), -- One Minecraft account per Discord user per server
    UNIQUE(minecraft_uuid, server_id) -- One Discord account per Minecraft player per server
);

-- Order sequence for generating order numbers
CREATE SEQUENCE order_number_seq START 1;

-- Function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    next_val INTEGER;
    order_num VARCHAR(50);
BEGIN
    next_val := nextval('order_number_seq');
    order_num := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_val::TEXT, 6, '0');
    RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order numbers
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := generate_order_number();
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
    BEFORE INSERT OR UPDATE ON payment_orders
    FOR EACH ROW
    EXECUTE FUNCTION set_order_number();

-- Function to generate link codes
CREATE OR REPLACE FUNCTION generate_link_code()
RETURNS VARCHAR(10) AS $$
DECLARE
    code VARCHAR(10);
    exists_check INTEGER;
BEGIN
    LOOP
        -- Generate 6-digit random code
        code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
        
        -- Check if code already exists
        SELECT COUNT(*) INTO exists_check 
        FROM minecraft_accounts 
        WHERE link_code = code AND link_code_expires_at > NOW();
        
        -- Exit loop if code is unique
        EXIT WHEN exists_check = 0;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate link codes and set expiry
CREATE OR REPLACE FUNCTION set_link_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.link_code IS NULL OR NEW.link_code = '' THEN
        NEW.link_code := generate_link_code();
        NEW.link_code_expires_at := NOW() + INTERVAL '1 hour'; -- Link codes expire in 1 hour
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_link_code
    BEFORE INSERT OR UPDATE ON minecraft_accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_link_code();

-- Create indexes for better performance
CREATE INDEX idx_payment_orders_server_id ON payment_orders(server_id);
CREATE INDEX idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_orders_webhook_status ON payment_orders(webhook_status);
CREATE INDEX idx_payment_orders_order_number ON payment_orders(order_number);
CREATE INDEX idx_payment_orders_created_at ON payment_orders(created_at);
CREATE INDEX idx_payment_orders_expires_at ON payment_orders(expires_at);
CREATE INDEX idx_payment_orders_minecraft_delivered ON payment_orders(minecraft_delivered);

CREATE INDEX idx_minecraft_accounts_discord_user ON minecraft_accounts(discord_user_id);
CREATE INDEX idx_minecraft_accounts_minecraft_uuid ON minecraft_accounts(minecraft_uuid);
CREATE INDEX idx_minecraft_accounts_link_code ON minecraft_accounts(link_code);
CREATE INDEX idx_minecraft_accounts_server_id ON minecraft_accounts(server_id);
CREATE INDEX idx_minecraft_accounts_active ON minecraft_accounts(is_active);

-- Create GIN indexes for JSONB columns
CREATE INDEX idx_payment_orders_product_id_gin ON payment_orders USING GIN(product_id);
CREATE INDEX idx_payment_orders_crypto_info_gin ON payment_orders USING GIN(crypto_info);
CREATE INDEX idx_payment_orders_payload_gin ON payment_orders USING GIN(payload);
CREATE INDEX idx_payment_orders_metadata_gin ON payment_orders USING GIN(metadata);

-- Views for common queries
CREATE VIEW active_orders AS
SELECT 
    po.*,
    s.name as server_name,
    u.username as user_username,
    ma.minecraft_username,
    ma.minecraft_uuid
FROM payment_orders po
LEFT JOIN servers s ON po.server_id = s.id
LEFT JOIN users u ON po.user_id = u.id
LEFT JOIN minecraft_accounts ma ON po.user_id = ma.discord_user_id AND po.server_id = ma.server_id
WHERE po.is_active = TRUE;

CREATE VIEW pending_deliveries AS
SELECT 
    po.*,
    ma.minecraft_username,
    ma.minecraft_uuid,
    s.name as server_name
FROM payment_orders po
LEFT JOIN minecraft_accounts ma ON po.user_id = ma.discord_user_id AND po.server_id = ma.server_id
LEFT JOIN servers s ON po.server_id = s.id
WHERE po.status = 'paid' 
  AND po.minecraft_delivered = FALSE 
  AND po.is_active = TRUE
  AND ma.is_verified = TRUE;

-- Function to clean up expired orders and link codes
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
    expired_orders INTEGER;
    expired_codes INTEGER;
BEGIN
    -- Mark expired orders as expired
    UPDATE payment_orders 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' 
      AND expires_at < NOW() 
      AND is_active = TRUE;
    
    GET DIAGNOSTICS expired_orders = ROW_COUNT;
    
    -- Clean up expired link codes
    UPDATE minecraft_accounts 
    SET link_code = NULL, link_code_expires_at = NULL, updated_at = NOW()
    WHERE link_code_expires_at < NOW() 
      AND linked_at IS NULL;
    
    GET DIAGNOSTICS expired_codes = ROW_COUNT;
    
    -- Log cleanup results
    INSERT INTO system_logs (level, message, metadata, created_at) VALUES (
        'INFO',
        'Cleanup completed',
        jsonb_build_object(
            'expired_orders', expired_orders,
            'expired_link_codes', expired_codes
        ),
        NOW()
    );
    
    RETURN expired_orders + expired_codes;
END;
$$ LANGUAGE plpgsql;

-- Create system_logs table if it doesn't exist (for cleanup logging)
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comments for documentation
COMMENT ON TABLE payment_orders IS 'Consolidated payment orders table with webhook and Minecraft integration';
COMMENT ON COLUMN payment_orders.product_id IS 'JSONB array of products: [{"id": "prod_123", "quantity": 2, "price": 10.00}]';
COMMENT ON COLUMN payment_orders.crypto_info IS 'Crypto payment details: {address, coin, network, amount, private_key_encrypted}';
COMMENT ON COLUMN payment_orders.payment_method IS 'FALSE = crypto payment, TRUE = fiat payment';
COMMENT ON COLUMN payment_orders.webhook_status IS 'Status of webhook processing: pending, received, processed, failed';
COMMENT ON COLUMN payment_orders.minecraft_delivered IS 'Whether items have been delivered in Minecraft';

COMMENT ON TABLE minecraft_accounts IS 'Links Discord users to Minecraft accounts per server';
COMMENT ON COLUMN minecraft_accounts.link_code IS 'Temporary code for linking via /ecbot link command';
COMMENT ON COLUMN minecraft_accounts.is_verified IS 'Whether the link has been verified through Minecraft plugin';

-- Grant permissions (adjust based on your user setup)
-- GRANT SELECT, INSERT, UPDATE ON payment_orders TO ecbot_api_user;
-- GRANT SELECT, INSERT, UPDATE ON minecraft_accounts TO ecbot_api_user;
-- GRANT USAGE ON order_number_seq TO ecbot_api_user;