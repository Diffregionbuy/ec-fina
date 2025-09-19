-- Allow multiple wallet addresses per user
-- Drop the accidental/legacy unique constraint on wallets.user_id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'wallets' AND c.conname = 'wallets_user_id_key'
  ) THEN
    ALTER TABLE wallets DROP CONSTRAINT wallets_user_id_key;
  END IF;
END $$;

-- Ensure fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- Prevent exact duplicate addresses for the same user/currency/network
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_user_addr_ccy_chain
  ON wallets(user_id, wallet_address, ccy, chain);

COMMENT ON INDEX uq_wallets_user_addr_ccy_chain IS 'Prevents duplicate wallet_address per (user_id, ccy, chain)';

