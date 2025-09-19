-- Add Tatum Virtual Account linkage to wallets

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS tatum_va_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_wallets_tatum_va_id ON wallets(tatum_va_id);

COMMENT ON COLUMN wallets.tatum_va_id IS 'Tatum Virtual Account ID associated with this withdrawal address';

