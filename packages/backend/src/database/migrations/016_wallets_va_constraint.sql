-- EcBot SaaS Platform - Wallets VA Constraint
-- Migration: 016_wallets_va_constraint.sql
-- Add unique constraint for (user_id, ccy, chain) to support VA upserts

-- Create unique constraint for one VA per user per currency/chain combination
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_user_ccy_chain
  ON wallets(user_id, ccy, chain);

COMMENT ON INDEX uq_wallets_user_ccy_chain IS 'Ensures one Virtual Account per user per currency/chain combination';