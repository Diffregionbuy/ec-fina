-- EcBot SaaS Platform - Row Level Security Policies
-- Migration: 002_row_level_security.sql

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE setup_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Users can only view and update their own profile
CREATE POLICY "users_select_own" ON users FOR SELECT 
    USING (auth.uid()::text = discord_id OR auth.role() = 'service_role');

CREATE POLICY "users_update_own" ON users FOR UPDATE 
    USING (auth.uid()::text = discord_id);

CREATE POLICY "users_insert_own" ON users FOR INSERT 
    WITH CHECK (auth.uid()::text = discord_id OR auth.role() = 'service_role');

-- Servers table policies
-- Server owners can manage their servers, service role can access all
CREATE POLICY "servers_select_owner" ON servers FOR SELECT 
    USING (owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "servers_insert_owner" ON servers FOR INSERT 
    WITH CHECK (owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "servers_update_owner" ON servers FOR UPDATE 
    USING (owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "servers_delete_owner" ON servers FOR DELETE 
    USING (owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

-- Categories table policies
-- Server owners can manage categories for their servers
CREATE POLICY "categories_select_server_owner" ON categories FOR SELECT 
    USING (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

CREATE POLICY "categories_insert_server_owner" ON categories FOR INSERT 
    WITH CHECK (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

CREATE POLICY "categories_update_server_owner" ON categories FOR UPDATE 
    USING (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

CREATE POLICY "categories_delete_server_owner" ON categories FOR DELETE 
    USING (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

-- Products table policies
-- Server owners can manage products, anyone can view active products for purchasing
CREATE POLICY "products_select_server_access" ON products FOR SELECT 
    USING (
        (is_active = true) OR 
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR 
        auth.role() = 'service_role'
    );

CREATE POLICY "products_insert_server_owner" ON products FOR INSERT 
    WITH CHECK (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

CREATE POLICY "products_update_server_owner" ON products FOR UPDATE 
    USING (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

CREATE POLICY "products_delete_server_owner" ON products FOR DELETE 
    USING (
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR auth.role() = 'service_role'
    );

-- Wallets table policies
-- Users can only access their own wallet
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT 
    USING (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT 
    WITH CHECK (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE 
    USING (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

-- Transactions table policies
-- Users can view their own transactions, server owners can view server transactions
CREATE POLICY "transactions_select_user_or_server" ON transactions FOR SELECT 
    USING (
        user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR
        server_id IN (
            SELECT s.id FROM servers s 
            WHERE s.owner_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text)
        ) OR 
        auth.role() = 'service_role'
    );

CREATE POLICY "transactions_insert_service" ON transactions FOR INSERT 
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "transactions_update_service" ON transactions FOR UPDATE 
    USING (auth.role() = 'service_role');

-- Setup templates table policies
-- Templates are publicly readable, only service role can modify
CREATE POLICY "setup_templates_select_public" ON setup_templates FOR SELECT 
    USING (is_active = true OR auth.role() = 'service_role');

CREATE POLICY "setup_templates_insert_service" ON setup_templates FOR INSERT 
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "setup_templates_update_service" ON setup_templates FOR UPDATE 
    USING (auth.role() = 'service_role');

CREATE POLICY "setup_templates_delete_service" ON setup_templates FOR DELETE 
    USING (auth.role() = 'service_role');

-- Onboarding progress table policies
-- Users can manage their own onboarding progress
CREATE POLICY "onboarding_progress_select_own" ON onboarding_progress FOR SELECT 
    USING (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "onboarding_progress_insert_own" ON onboarding_progress FOR INSERT 
    WITH CHECK (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "onboarding_progress_update_own" ON onboarding_progress FOR UPDATE 
    USING (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');

CREATE POLICY "onboarding_progress_delete_own" ON onboarding_progress FOR DELETE 
    USING (user_id = (SELECT id FROM users WHERE discord_id = auth.uid()::text) OR auth.role() = 'service_role');