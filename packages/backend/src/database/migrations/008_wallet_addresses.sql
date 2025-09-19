-- EcBot SaaS Platform - Wallet Addresses Management
-- Migration: 008_wallet_addresses.sql
-- Crypto-only approach aligned with OKX API requirements

-- Enhance existing wallets table with OKX API compatible fields
-- Uses the existing wallet_address column from initial schema
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS ccy VARCHAR(20) DEFAULT 'USDT'; -- OKX currency code (ccy parameter)
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS chain VARCHAR(50) DEFAULT 'USDT-TRC20'; -- OKX chain identifier (chain parameter)
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS tag VARCHAR(255); -- OKX tag/memo parameter (tag parameter)

-- Auto-withdrawal settings
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS min_balance_threshold DECIMAL(15,8) DEFAULT 10.00 CHECK (min_balance_threshold >= 0);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_ccy ON wallets(ccy);
CREATE INDEX IF NOT EXISTS idx_wallets_chain ON wallets(chain);

-- Add helpful comments
COMMENT ON COLUMN wallets.ccy IS 'OKX currency code for withdrawal API (e.g., BTC, ETH, USDT)';
COMMENT ON COLUMN wallets.chain IS 'OKX chain identifier for withdrawal API (e.g., BTC-Bitcoin, USDT-TRC20, ETH-Ethereum)';
COMMENT ON COLUMN wallets.tag IS 'OKX tag/memo parameter for networks that require it (XRP, EOS, etc.)';
