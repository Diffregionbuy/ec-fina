-- Simple Product Ratings System
-- Migration: 007_simple_product_ratings.sql

-- Simple ratings table - just store the rating values
CREATE TABLE product_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_number UUID REFERENCES payment_orders(id) ON DELETE SET NULL,
    rating_value DECIMAL(2,1) NOT NULL CHECK (rating_value >= 1.0 AND rating_value <= 10.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate ratings from same user for same product
    UNIQUE(product_id, user_id)
);

-- Index for fast queries
CREATE INDEX idx_product_ratings_product_id ON product_ratings(product_id);
CREATE INDEX idx_product_ratings_user_id ON product_ratings(user_id);

-- Row Level Security
ALTER TABLE product_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_ratings_select_all" ON product_ratings FOR SELECT 
    USING (true);

CREATE POLICY "product_ratings_insert_own" ON product_ratings FOR INSERT 
    WITH CHECK (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');