/**
 * Simulate a Tatum payment webhook end-to-end.
 * - Auth -> Create order -> Find order -> POST webhook -> Verify DB
 *
 * Requirements:
 * - Node 18+ (global fetch available)
 * - packages/backend/.env has SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DISCORD_BOT_SERVICE_TOKEN,
 *   TATUM_WEBHOOK_TOKEN or TATUM_WEBHOOK_SECRET (for auth bypass on webhook endpoint).
 *
 * Usage:
 *   node packages/backend/scripts/simulate-tatum-webhook.js
 *
 * Optional env overrides (can be set in shell before running):
 *   BASE_URL=http://localhost:3001
 *   SERVER_ID=417297319814496256
 *   USER_ID=417296513270808580
 *   PRODUCT_ID=fac6d03a-14dc-4f4a-a070-6bd53932d82f
 *   CURRENCY=ETH
 *   TEST_WEBHOOK_AMOUNT=1.23   (if not set, will use expected_amount to simulate a paid order)
 *   WEBHOOK_TOKEN=...          (fallback if TATUM_WEBHOOK_TOKEN/SECRET not set in .env)
 */

const fs = require('fs');
const path = require('path');

// Minimal .env parser (no external deps)
function loadEnvFromFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      if (!line || line.trim().startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      // Remove optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    });
  } catch {
    // ignore if file not found
  }
}

// Load backend .env
const dotenvPath = path.resolve(__dirname, '../.env');
loadEnvFromFile(dotenvPath);

// Config
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISCORD_BOT_SERVICE_TOKEN = process.env.DISCORD_BOT_SERVICE_TOKEN;
const WEBHOOK_TOKEN =
  process.env.TATUM_WEBHOOK_TOKEN ||
  process.env.TATUM_WEBHOOK_SECRET ||
  process.env.WEBHOOK_TOKEN ||
  '';

const SERVER_ID = process.env.SERVER_ID || '417297319814496256';
const USER_ID = process.env.USER_ID || '417296513270808580';
const PRODUCT_ID = process.env.PRODUCT_ID || 'fac6d03a-14dc-4f4a-a070-6bd53932d82f';
const CURRENCY = (process.env.CURRENCY || 'ETH').toUpperCase();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in packages/backend/.env');
  process.exit(1);
}
if (!DISCORD_BOT_SERVICE_TOKEN) {
  console.error('Missing DISCORD_BOT_SERVICE_TOKEN in packages/backend/.env');
  process.exit(1);
}
if (!WEBHOOK_TOKEN) {
  console.warn('No WEBHOOK_TOKEN provided (TATUM_WEBHOOK_TOKEN/SECRET). If your auth bypass requires it, webhook may 401.');
}

// WebCrypto for random tx hash
const webcrypto = (globalThis.crypto && globalThis.crypto.getRandomValues) ? globalThis.crypto : require('node:crypto').webcrypto;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const jsonFetch = async (url, options = {}) => {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { resp, data, text };
};
const randomHex = (n) =>
  Array.from(webcrypto.getRandomValues(new Uint8Array(n)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

(async () => {
  // 1) Authenticate to get JWT
  console.log('1) Authenticating service...');
  const authRes = await jsonFetch(`${BASE_URL}/api/bot-service/auth`, {
    method: 'POST',
    headers: {
      'X-Bot-Token': DISCORD_BOT_SERVICE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service: 'discord_bot',
      permissions: [
        'read_templates',
        'read_bot_config',
        'read_products',
        'read_categories',
        'create_payments',
        'minecraft_integration',
        'read_orders',
        'admin_access',
      ],
    }),
  });
  if (!authRes.resp.ok) {
    console.error('Auth failed:', authRes.data || authRes.text);
    process.exit(1);
  }
  const JWT = authRes?.data?.data?.token;
  if (!JWT) {
    console.error('JWT not found in auth response:', authRes.data);
    process.exit(1);
  }
  console.log('   ✓ JWT acquired');

  // 2) Create order
  console.log('2) Creating payment order...');
  const orderPayload = {
    serverId: SERVER_ID,
    discordUserId: USER_ID,
    products: [{ id: PRODUCT_ID, quantity: 1 }],
    paymentMethod: false,
    discordChannelId: 'test-channel',
  };
  const createRes = await jsonFetch(`${BASE_URL}/api/bot-service/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });
  if (!createRes.resp.ok) {
    console.error('Create order failed:', createRes.data || createRes.text);
    process.exit(1);
  }

  let orderId = createRes?.data?.data?.orderId || createRes?.data?.orderId || createRes?.data?.id || null;
  let orderAddress =
    createRes?.data?.data?.crypto_info?.address ||
    createRes?.data?.crypto_info?.address ||
    null;

  console.log('   tentative orderId:', orderId || '(not returned, will query DB)');
  console.log('   tentative address:', orderAddress || '(not returned, will query DB)');

  // 3) Fetch order from Supabase (prefer id; else latest pending by user/server)
  console.log('3) Fetching order from Supabase...');
  const supaHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  let dbOrder = null;
  if (orderId) {
    const oneRes = await jsonFetch(
      `${SUPABASE_URL}/rest/v1/payment_orders?select=*&id=eq.${encodeURIComponent(orderId)}&limit=1`,
      { headers: supaHeaders }
    );
    if (oneRes.resp.ok && Array.isArray(oneRes.data) && oneRes.data.length > 0) {
      dbOrder = oneRes.data[0];
    }
  }

  if (!dbOrder) {
    // Fallback: latest pending order (no server_id/user_id filter to avoid UUID mismatch)
    const listRes = await jsonFetch(
      `${SUPABASE_URL}/rest/v1/payment_orders?select=*&status=eq.pending&order=created_at.desc&limit=1`,
      { headers: supaHeaders }
    );
    if (!listRes.resp.ok || !Array.isArray(listRes.data) || listRes.data.length === 0) {
      console.error('Failed to find pending order in Supabase:', listRes.data || listRes.text);
      process.exit(1);
    }
    dbOrder = listRes.data[0];
  }

  orderId = dbOrder.id;
  orderAddress = dbOrder?.crypto_info?.address || orderAddress;
  const orderCurrency = (dbOrder?.crypto_info?.currency || CURRENCY).toUpperCase();
  const expectedAmountNum = Number(dbOrder.expected_amount);
  if (!orderAddress) {
    console.error('Order address missing; cannot simulate webhook.');
    process.exit(1);
  }
  console.log('   ✓ DB order found:', { orderId, orderAddress, orderCurrency, expectedAmountNum });

  // 4) POST simulated webhook to backend
  const webhookUrl = `${BASE_URL}/api/webhooks/tatum?token=${encodeURIComponent(WEBHOOK_TOKEN)}&orderId=${encodeURIComponent(orderId)}`;
  const testAmount =
    process.env.TEST_WEBHOOK_AMOUNT !== undefined
      ? String(process.env.TEST_WEBHOOK_AMOUNT)
      : String(expectedAmountNum); // exact match to simulate "paid" case

  const payload = {
    currency: orderCurrency,
    address: orderAddress,
    amount: testAmount,
    txId: `0x${randomHex(64)}`,
    chain: orderCurrency === 'ETH' ? 'ethereum-mainnet' : 'unknown',
    subscriptionType: 'INCOMING_NATIVE_TX',
  };

  console.log('4) Posting simulated Tatum webhook...');
  const hookRes = await jsonFetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!hookRes.resp.ok) {
    console.error('Webhook POST failed:', hookRes.data || hookRes.text);
    process.exit(1);
  }
  console.log('   ✓ Webhook response:', hookRes.data || hookRes.text);

  // 5) Verify order updated in Supabase
  console.log('5) Verifying updated order in Supabase...');
  let final = null;
  for (let i = 0; i < 10; i++) {
    const check = await jsonFetch(
      `${SUPABASE_URL}/rest/v1/payment_orders?select=*&id=eq.${encodeURIComponent(orderId)}&limit=1`,
      { headers: supaHeaders }
    );
    if (check.resp.ok && Array.isArray(check.data) && check.data.length > 0) {
      final = check.data[0];
      if (final.webhook_status || final.received_amount || final.transaction_hash) break;
    }
    await sleep(500);
  }

  if (!final) {
    console.error('Could not retrieve the order after webhook.');
    process.exit(1);
  }

  console.log('   ✓ Final order snapshot:');
  console.log(
    JSON.stringify(
      {
        id: final.id,
        status: final.status,
        webhook_status: final.webhook_status,
        received_amount: final.received_amount,
        transaction_hash: final.transaction_hash,
        payload_present: !!final.payload,
      },
      null,
      2
    )
  );

  if (Number(testAmount) >= expectedAmountNum) {
    console.log('Expectation: status may be paid (or processed) if handler marks sufficient payments immediately.');
  } else {
    console.log('Expectation: status likely remains pending; webhook_status should be "received" and payload recorded.');
  }

  console.log('\nDone.');
})().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});