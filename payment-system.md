# Payment System Design (Custody & Non‑Custody with Tatum Virtual Accounts)

Status: Authoritative reference for Payments
Last updated: 2025-09-08

## 0) Scope and Goals

- Support both Custody and Non‑Custody modes for merchants.
- Generate per‑invoice deposit addresses, show QR codes, track confirmations, mark invoices paid, and handle fees/splits.
- Integrate seamlessly with:
  - Discord bot: confirmation → invoice page replacement
  - Backend API: /api/bot-service/*
  - Supabase DB: payment_orders consolidated table
  - Tatum: address generation + webhooks (v4 subscription)

Your desired flow:
1) Merchant saves their payout wallets on the website
2) Merchant chooses Custody or Non‑Custody mode
3) Merchant configures products/bot and selects a subscription plan
4) Customer pays to a Tatum-generated address
5) Funds routing:
   - Custody: funds are received into platform-controlled accounts; merchant gets net‑of‑fee payouts
   - Non‑custody: funds go to merchant wallet; platform fee goes to platform wallet using Tatum Virtual Account (off‑chain settlement)

This document aligns with Implementation-plan.md (Phase 1–2 complete) and extends it to clearly define payment modes and operations.

---

## 1) Modes: Custody vs Non‑Custody

### Custody Mode (Platform is custodian)
- Ownership: Platform (or Tatum KMS/Gas Pump under platform control) holds the keys to deposit addresses.
- Flow: Buyer → platform-controlled deposit address (per invoice) → webhook or API polling credit to merchant’s off‑chain balance (ledger) → payout net‑of‑fee to merchant wallet (instant/scheduled/threshold) → optional sweep to platform treasury.
- Pros: Works uniformly across BTC and EVM chains; precise fee/netting and reconciliation; flexible payout timing.
- Cons: You operate as a custodian (compliance, hot wallet ops, KYC/AML).

### Non‑Custody Mode (Merchant is custodian)
- Ownership: Merchant supplies payout wallet or xpub; platform never holds keys.
- Flow: Buyer → merchant-owned address → platform observes and marks invoice paid. Fees handled via:
  - Tatum VA split (cross-chain, recommended): funds land in the merchant’s VA; backend computes commission and performs either two withdrawals from the VA (commission → platform wallet/VA; remainder → merchant wallet) or VA→VA internal transfers followed by withdrawals.
- Pros: Lower custody burden. Cons: Fee split is chain-specific or requires off‑chain settlement.

---

## 2) Tatum Virtual Accounts (VA)

We will use Virtual Accounts in both modes for standardized ledgering, deposit address generation, and reconciliation.

- Custody mode (platform custodial):
  - Create a VA at merchant onboarding , one per supported asset (BTC, ETH, USDT-ERC20, ...), linked to a Tatum Customer.
  - Funds sent to the deposit address are credited to your platform’s Tatum-managed wallet and the VA ledger balance.

- Non‑custody mode (merchant custodial destination):
  - Create a VA per shop owner (/v3/virtual-account/create), linked to their provided payout wallet (merchant-controlled).
  - The VA generates per-invoice deposit addresses for the merchant. Your platform does not hold the merchant’s final wallet keys.
  - After deposit confirmation, the backend calculates fee split and uses /v3/virtual-account/transfer to move:
    - Platform commission to your wallet or platform VA.
    - Remainder to the merchant’s wallet.
  - This preserves unified ledgering and reporting even in non‑custodial mode.

---

## 3) Data Model (Supabase)

Implementation-plan.md established a consolidated orders table:

- payment_orders
  - id (uuid), order_number (e.g., ORD-2025-000001)
  - server_id (discord server), user_id (platform user), discord_user_id (bot user)
  - product_id or cart JSONB (supports multi-item)
  - payment_method boolean (false = crypto, true = fiat)
  - crypto_info JSONB { address, coin, network, amount, qrCode? }
  - status (pending|paid|expired|underpaid|overpaid|failed)
  - received_amount, transaction_hash, confirmed_at, expires_at
  - metadata JSONB, created_at, updated_at

Complementary tables:
- minecraft_accounts (for delivery integrations)
- webhook_logs (tatum webhook payloads and processing)
- Optional: virtual_accounts, payouts, ledger_entries (see Implementation-plan.md for examples and Phase 3/4 extensions)

---

## 4) API Contracts

The backend routes from Implementation-plan.md are authoritative:

- POST /api/bot-service/auth → bot JWT
- GET  /api/bot-service/templates/:serverId → templates
- GET  /api/bot-service/products/:serverId → products
- GET  /api/bot-service/categories/:serverId → categories
- POST /api/bot-service/orders → create payment order (creates unique address + webhook subscription)
- GET  /api/bot-service/orders/:orderId → order status
- POST /api/webhooks/tatum → Tatum webhook receiver (with HMAC/token and orderId correlation)

### 4.1 Create Order (as used by Discord Confirm)

Request (Discord bot):
```json
{
  "serverId": "1413584793542856856",
  "discordUserId": "417296513270808580",
  "products": [{ "id": "PRODUCT_ID", "quantity": 1 }],
  "paymentMethod": false,
  "discordChannelId": "123456789012345678",
  "metadata": {
    "source": "discord_bot",
    "messageId": "DISCORD_MESSAGE_ID",
    "coin": "USDT",
    "network": "ethereum-erc20"
  }
}
```

Response (example):
```json
{
  "success": true,
  "orderId": "e2f2a156-...-b1d2",
  "orderNumber": "ORD-2025-000123",
  "expiresAt": "2025-09-08T03:10:00.000Z",
  "cryptoInfo": {
    "address": "0xabc123...",
    "coin": "USDT",
    "network": "ethereum-erc20",
    "amount": "19.99000000",
    "qrCode": "data:image/png;base64,..."
  },
  "status": "pending"
}
```

Notes:
- The backend calculates exact amount from product price/qty and FX rates; bot should rely on cryptoInfo.amount.
- The backend creates a Tatum v4 subscription for the returned address to receive deposit webhooks.

---

## 5) Tatum Integration

Key points:
- One subscription per address (cannot monitor multiple addresses with a single subscription).
- We standardize on Virtual Accounts (v3) for both modes and use subscriptions to detect incoming payments.

### 5.1 v3 Virtual Account Endpoints
- Create VA: POST /v3/virtual-account/create
  - Body: customerId (optional), currency/asset, externalId/metadata
- Generate invoice deposit address: chain-specific address-generation tied to the VA (per invoice)
- Transactions polling: GET /v3/virtual-account/transactions?accountId=... (optional)
- Balance polling by address: GET /v3/blockchain/{chain}/address/{address}/balance (optional)
- Internal ledger transfer/split: POST /v3/virtual-account/transfer
  - Use to move commission to platform wallet/VA and remainder to merchant wallet (non‑custody split flows)

### 5.2 Subscriptions
- Create: POST /v3/subscription with type "INCOMING_PAYMENT"
  - attr: { address, chain, url }
- List/Reuse: GET /v3/subscription?pageSize=...&page=...
- Delete: DELETE /v3/subscription/{id}
- Webhook URL should include security token and orderId: /api/webhooks/tatum?token=...&orderId=...
- Lifecycle & quotas:
  - One subscription per address (no multi-address monitoring). Always create fresh per-invoice.
  - After invoice expiry or settlement, auto-delete the subscription (DELETE /v3/subscription/{id}) to avoid quota exhaustion.
  - Keep a short grace period for late webhooks before deletion.

### 5.3 Webhook processing (backend)
1) Verify signature/token and idempotency.
2) Resolve order by orderId or deposit address (VA metadata).
3) Validate confirmations, asset/network, expiry.
4) Update payment_orders (received_amount, status, txid, confirmed_at).
5) Custody:
   - Credit merchant balance in our ledger (off‑chain), funds reside in platform-managed wallet, then:
   - Payout job performs on-chain withdrawals on a schedule (weekly/monthly) or threshold.
6) Non‑custody:
   - Prefer internal VA split first: /v3/virtual-account/transfer (feeless) to separate commission vs merchant balances (same currency in ledger).
   - Then perform a single on-chain withdrawal per leg to minimize gas.
7) Emit events/notifications for Discord/UI.
8) Subscription cleanup:
   - If invoice is paid/expired, schedule deletion of the subscription (DELETE /v3/subscription/{id}) to conserve quotas.

---

## 6) End‑to‑End Flows

### 6.1 Merchant Onboarding (Website)
- Save payout wallets or xpubs per chain/asset.
- Choose mode: custody or non‑custody.
- Select platform subscription plan (fee policy, limits).
- Custody: Create Tatum Customer and Virtual Accounts (per asset). Store IDs in DB.

### 6.2 Invoice Creation
- Discord: confirm button triggers POST /api/bot-service/orders with selected product/qty/coin/network.
- Website: normal checkout can call POST /api/invoices with merchant_id/product_id/asset/network.
- Backend (both modes use VA):
  - Custody → generate a fresh deposit address tied to the merchant’s VA (platform-managed). Funds credit your platform wallet and the VA ledger.
  - Non‑custody → generate a fresh deposit address tied to the merchant’s VA (linked to their final wallet). Funds are tracked in VA/ledger and then split via /v3/virtual-account/transfer to platform + merchant wallets.
  - Compute exact amount; set expiry; create payment_orders row; create /v3/subscription (INCOMING_PAYMENT) for the deposit address.

### 6.3 Invoice Presentation
- Discord: replace confirmation page with invoice embed (webhook.editMessage) showing:
  - Address, exact amount, coin/network, QR image, countdown `<t:{epoch}:R>`, and helpful buttons (Check Status, Copy Address).

### 6.4 Payment Detection
- Tatum webhook → backend matches order by address or orderId.
- Respect per-chain confirmation policy (e.g., BTC=2, ETH=1).
- Update DB; mark Paid/Pending/Underpaid/Overpaid accordingly.

### 6.5 Funds Routing

Custody (VA + platform-managed wallet):
- Buyer → per-invoice deposit address (VA) → funds credit platform wallet and VA ledger.
- Net fee at credit time in ledger.
- Payout scheduler (weekly/monthly or threshold) performs on-chain withdrawals to merchant wallet (net-of-fee).
- Gas and fees: VA withdrawals incur on-chain gas (low on Polygon, higher on ETH). Ensure VA wallets (or Gas Pump) are pre-funded; deduct gas from platform commission unless otherwise configured.
- Optional treasury sweeps for security.

Non‑custody (VA + merchant-managed destination):
- Buyer → per-invoice deposit address (merchant VA).
- On confirmation, backend computes split and prefers:
  - execute /v3/virtual-account/transfer first (internal, feeless) to separate commission vs merchant balances, then perform a single withdrawal per leg, or
  - if transfer is unavailable, perform two direct withdrawals (commission → platform wallet/VA; remainder → merchant wallet).
- Gas and fees: two withdrawals imply double gas; deduct from commission or batch where possible.
- This preserves unified reconciliation while keeping merchant custody.

---

## 7) Discord Bot Integration Details

- Confirm → Invoice replacement:
  - Acknowledge with deferUpdate().
  - Use interaction.webhook.editMessage(messageId, payload) to update the ephemeral message in place (avoid duplicates).
- Invoice embed variables (from templates):
  - {product_name}, {product_description}, {item_price}, {wallet_address}, {exact_amount}, {crypto_currency}
  - Expires at: render as `<t:{expires_epoch}:R>` (relative countdown, not wrapped in backticks).
- Buttons:
  - invoice_check: calls GET /api/bot-service/orders/:id (requires read_orders permission) and replies ephemerally with status.
  - invoice_copy: replies ephemerally with address.

---

## 8) Environment and Configuration

.env (relevant):
```
API_BASE_URL=http://localhost:3001
BOT_SERVICE_TOKEN=...
TATUM_API_KEY=...
TATUM_WEBHOOK_URL=https://<domain>/api/webhooks/tatum
TATUM_WEBHOOK_SECRET=...
```

Bot service permissions (typical):
- read_templates, read_products, read_categories
- create_payments
- read_orders
- webhook_access
- read_bot_config
- update_order_status

Confirmations policy (configurable):
- BTC=2; ETH=1; stablecoins on EVM=1; customize per chain.

---

## 9) Error Handling and Edge Cases

- Underpayment/Overpayment:
  - Custody: allow top-up window, or credit actual received and mark partial; refunds via treasury.
  - Non‑custody: mark status; merchant decides settlement/refund.
- Expiry:
  - After `expires_at`, consider late funds “late”; require manual handling.
- Address reuse:
  - Always generate fresh per invoice for clean reconciliation; reuse VA (custody), not addresses.
- Idempotency:
  - Webhooks must be idempotent. Use unique keys per event/txid.
- Retries:
  - Use exponential backoff for Tatum API calls and webhook processing.

---

## 10) Testing and Observability

### 10.1 Withdrawal/Payout Scheduler (Custody)
- Weekly/Monthly scheduler (Supabase Edge Functions or cron + Tatum KMS):
  - Query merchant VA ledger balances above threshold.
  - Create payout batch to merchant wallets; record payouts with txids.
  - Respect per-chain gas budgets; retry with backoff.
- Threshold/Instant payouts:
  - Enable per-merchant overrides (instant for VIPs).
- Reconciliation:
  - Match VA ledger entries, payment_orders, and on-chain txids.

### 10.2 Split Transfer Tests (Non‑Custody)
- Simulate deposit to merchant VA address.
- Verify webhook → order Paid.
- Execute /v3/virtual-account/transfer:
  - Commission amount to platform wallet/VA.
  - Remainder to merchant wallet.
- Assert final balances and ledger entries.

Testing checklist:
- Create invoice on BTC and EVM (custody + non‑custody).
- Pay small amounts; verify webhook → DB update → status transitions.
- Confirm Discord invoice shows countdown and button responses.
- Verify under/overpayment branches.
- Payout flow in custody mode (instant + batch).
- Swap simulations on testnets:
  - Mock approve+swap via /v3/blockchain/*/sc/execute using 1inch calldata; verify slippage caps and retries.
  - Validate rate usage via /v3/tatum/rate/{currency}; record audit fields.

Observability:
- Structured logs including order_id, address, txid, va_id, webhook_id.
- Metrics: time-to-paid, payout latency, webhook failure rate, swap success rate.
- SDK: Prefer Tatum SDK (JS/Python) for VA transfers and sc/execute; monitor via Tatum dashboard metrics.

---

## 11) Appendix

### 11.1 Example “invoice_page” Template
```json
{
  "id": "invoice_page",
  "name": "Invoice Page",
  "color": "#10B981",
  "title": "🧾 Payment Invoice",
  "fields": [
    { "name": "✅ Product Name", "value": "`{product_name}`", "inline": true },
    { "name": "✅ Product Description", "value": "`{product_description}`", "inline": true },
    { "name": "💵 Price", "value": "`{item_price}`", "inline": false },
    { "name": "🏠 Send To Address", "value": "`{wallet_address}`", "inline": false },
    { "name": "💰 Exact Amount", "value": "`{exact_amount} {crypto_currency}`", "inline": false },
    { "name": "⏰ Expires at", "value": "<t:{expires_epoch}:R>", "inline": false }
  ],
  "description": "Scan the QR code or copy the details below to complete your payment. This invoice is valid for a limited time.\n\nAfter sending, please contact <@admin>."
}
```

### 11.2 Tatum v4 Subscription (reference)
- Create: POST https://api.tatum.io/v4/subscription
- Attr example:
```json
{
  "type": "INCOMING_NATIVE_TX",
  "attr": {
    "address": "0xabc...",
    "chain": "ethereum-mainnet",
    "url": "https://<domain>/api/webhooks/tatum?token=...&orderId=..."
  }
}
```

---

## 12) FAQ

Q: When should we create Virtual Accounts?
- Both modes: create per-merchant VAs (per asset) at onboarding (use customerId to group). Each invoice uses a fresh deposit address tied to the VA for clean reconciliation and automation.

Q: How does payment go to my wallet vs the merchant’s?
- Custody: buyer pays platform-controlled address → we credit merchant in VA ledger (net fees) → payouts to merchant wallet via scheduled or instant withdrawals; optional treasury sweep.
- Non‑custody: buyer pays a VA deposit address tied to the merchant; we split internally (VA transfer) and perform one withdrawal per leg to merchant and platform wallets (gas deducted from commission).

Q: How do we render Discord expiry as a countdown?
- Use `<t:{epoch}:R>` and avoid backticks around the tag.

## 13) Conversion & Settlement Policy

Goal
- Support cases where the customer pays in Coin A, the merchant wants Coin B, and the platform commission is kept in Coin C.
- Perform splits and conversions through Virtual Accounts (VA) and on-chain swaps, with strong guardrails.

Assumptions and recommendations
- Prefer same-chain conversions for MVP (e.g., USDT-ERC20 → ETH and USDC on Ethereum). Cross-chain conversions should be queued as asynchronous payout jobs with clear SLAs.
- Always generate the invoice deposit address on the chain of the customer’s selected asset to avoid accidental cross-chain deposits.

Standard flow (same chain, EVM example)
1) Deposit detection
   - Customer pays to the per-invoice deposit address (merchant VA).
   - We confirm via /v3/subscription (INCOMING_PAYMENT) and optionally poll /v3/virtual-account/transactions or /v3/blockchain/{chain}/address/{address}/balance.
2) Split amounts
   - gross = amount received in asset A (e.g., USDT)
   - commission = gross × feeRate
   - merchantShare = gross − commission
   - Record ledger entries for both portions.
3) Conversions and payouts
   - From the VA deposit wallet (funded with native gas or via Gas Pump):
     a) Merchant leg:
        - Approve Router and swap merchantShare A→B (e.g., USDT→ETH) via a DEX/aggregator (Uniswap/0x/etc.) with slippage cap.
        - Transfer Coin B to the merchant payout wallet.
     b) Platform leg:
        - Swap commission A→C (e.g., USDT→USDC).
        - Transfer Coin C to the platform wallet or platform VA.
   - Store tx hashes, pre-/post-swap quotes, applied slippage, and final amounts.
4) Finalization
   - Mark the invoice Paid.
   - Bot notifies merchant and (optionally) buyer; show final amounts and tx links.

Non‑custody nuance
- Still use a VA for deposits and reconciliation.
- Immediately after confirmation, perform the two legs:
  - Commission leg: VA → swap to platform’s target asset (if needed) → platform wallet/VA.
  - Merchant leg: VA → swap to merchant’s target asset (if needed) → merchant wallet.
- Merchant retains custody of the final funds; the platform never holds their private keys.

MVP cross‑chain stance
- Cross-chain conversions are out of scope for MVP. Always issue the invoice on the target chain of the selected asset.
- If a cross-chain need is detected, reissue the invoice on the correct chain instead of bridging.

Controls and guardrails
- Slippage caps per asset pair (e.g., 50–150 bps default; per-merchant override).
- Minimum amounts for conversion; refund or manual review if below thresholds.
- Rate sourcing and audit: store quotes, block numbers, and execution txids.
- Gas management: maintain gas budgets for VA wallets; fallback to scheduled batches if gas spikes.
- Retry policies with exponential backoff; idempotency keys for all steps.
- Compliance: keep full logs of conversions and transfers for reconciliation.

Tatum and related endpoints (reference)
- VA creation: POST /v3/virtual-account/create (group per merchant via customerId)
- Incoming payment subscription: POST /v3/subscription (type: INCOMING_PAYMENT)
- Transactions polling: GET /v3/virtual-account/transactions?accountId=...
- Address balance polling: GET /v3/blockchain/{chain}/address/{address}/balance
- Internal split transfer (ledger): POST /v3/virtual-account/transfer (feeless)
- On-chain transfers: POST /v3/blockchain/{chain}/transfer
- On-chain swaps: build calldata via 1inch /v5.2/1/swap; approve + execute via POST /v3/blockchain/ethereum/sc/execute with KMS signing
- Rates: GET /v3/tatum/rate/{currency} (CoinGecko-backed, minutely updates)
- Audits: Historical Balance API (2025) and expanded supported chains (e.g., Sonic, Berachain)

Concrete example (same chain, with 1inch aggregation)
- Customer pays 100 USDT (ERC20).
- Fee rate = 5% → commissionUSDT = 5; merchantUSDT = 95.
- Merchant wants ETH; platform keeps USDC.
  1) Get quote from 1inch /v5.2/1/swap for USDT→ETH (slippage ≤1%). Approve USDT to 1inch router (0x1111111254EEB25477B68fb85Ed929f73A960582), then execute via /v3/blockchain/ethereum/sc/execute; send resulting ETH to merchant wallet.
  2) Get quote from 1inch for USDT→USDC; approve + execute; send USDC to platform wallet/VA.
- Record quotes, swaps, tx hashes, and ledger entries; if slippage exceeds cap, retry or follow fallback policy.

UI/Status notes
- In Discord and Web, show intermediate states:
  - “Payment received. Converting USDT→ETH…” then “Payout sent: X ETH to merchant; Commission: Y USDC.”
- Provide links to on-chain tx for transparency.