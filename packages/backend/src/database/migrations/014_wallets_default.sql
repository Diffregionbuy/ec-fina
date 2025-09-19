-- Add is_default flag to wallets and enforce one default per (user, ccy, chain)
-- Migration: 014_wallets_default.sql

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure at most one default per user + currency + network
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_default_per_pair
ON wallets(user_id, ccy, chain)
WHERE is_default = TRUE;

COMMENT ON COLUMN wallets.is_default IS 'Marks the main wallet for a specific currency/network';

