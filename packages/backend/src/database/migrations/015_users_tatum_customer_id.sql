-- Add Tatum customer linkage on users
-- Migration: 015_users_tatum_customer_id.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tatum_customer_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_users_tatum_customer_id ON users(tatum_customer_id);

COMMENT ON COLUMN users.tatum_customer_id IS 'Tatum Ledger Customer ID linked to this user';
t-68b2a0e9d258d63c2f86eec1-87d0c2d68ed54afa8759c4a2
Invoke-WebRequest -Uri "https://api-ap-southeast1.tatum.io/v3/ledger/customer"
-Method POST -Headers @{"x-api-key"="t-68b2a0e9d258d63c2f86eec1-87d0c2d68ed54afa8759c4a2"; "Content-Type"="application/json"}
-Body '{"externalId":"u_test","accountingCurrency":"USD"}'

Invoke-WebRequest -Uri "https://api.tatum.io/v3/ledger/account/68cc4012efa53b62df553494" `    -Method GET `    -Headers @{         "x-api-key" = "t-68b2a0e9d258d63c2f86eec1-87d0c2d68ed54afa8759c4a2"     } `    -ContentType "application/json"