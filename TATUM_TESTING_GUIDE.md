# Tatum Integration Testing Guide

## How to Test for Errors

### 1. Pre-Testing Setup

#### Check Environment Variables
```bash
# Create a test script to verify environment setup
echo "TATUM_API_KEY=$TATUM_API_KEY"
echo "TATUM_WEBHOOK_URL=$TATUM_WEBHOOK_URL"
echo "TATUM_WEBHOOK_SECRET=$TATUM_WEBHOOK_SECRET"
echo "BACKEND_URL=$BACKEND_URL"
```

#### Verify Database Schema
```sql
-- Check if payment_orders table has webhook fields
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payment_orders' 
AND column_name LIKE '%webhook%';

-- Expected columns:
-- webhook_id, webhook_type, webhook_created_at, webhook_status, payload
```

### 2. Step-by-Step Testing

#### Step 1: Test Backend Startup
```bash
# Start backend and check for errors
npm run dev

# Look for these log messages:
# ✅ "Server running on port 3001"
# ❌ Any TypeScript compilation errors
# ❌ Database connection errors
```

#### Step 2: Test Webhook Health Check
```bash
# Test webhook system is working
curl http://localhost:3001/api/webhooks/health

# Expected response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-09-05T01:00:00.000Z",
    "webhooks": {
      "tatum": "active",
      "manual": "active"
    }
  }
}
```

#### Step 3: Test Bot Service Authentication
```bash
# Test bot service auth (should work from your existing test)
curl -X POST http://localhost:3001/api/bot-service/auth \
  -H "Content-Type: application/json" \
  -H "X-Bot-Token: your_bot_service_token" \
  -d "{}"

# Expected: JWT token response
# ❌ Watch for: "INSUFFICIENT_PERMISSIONS" or "INVALID_TOKEN"
```

#### Step 4: Test Order Creation with Tatum
```bash
# Use your existing test script but watch for specific errors
.\test-api-endpoints.bat

# Step 6 (Create Payment Order) - Watch for these errors:
```

**Common Error Patterns to Look For:**

### 3. Error Detection Methods

#### A. Check Backend Logs
```bash
# Watch backend console for these error patterns:

# ❌ Tatum Service Errors:
"Failed to create payment setup"
"Tatum API error"
"Invalid Tatum configuration"

# ❌ PaymentService Errors:
"Failed to create payment order"
"Product not found"
"User resolution failed"

# ❌ Database Errors:
"Failed to insert payment order"
"Foreign key constraint violation"
"Column does not exist"
```

#### B. Test Individual Components

**Test TatumService Directly:**
```bash
# Create a test endpoint to verify Tatum service
curl -X POST http://localhost:3001/api/webhooks/manual-confirm \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-id",
    "transactionHash": "0xtest123",
    "amount": "0.05"
  }'

# Expected: 404 ORDER_NOT_FOUND (normal - means webhook system works)
# ❌ Watch for: 500 errors, database connection issues
```

**Test PaymentService:**
```javascript
// Add this temporary test endpoint to bot-service.ts for debugging:
router.get('/test-payment-service', async (req, res) => {
  try {
    const testOrder = await paymentService.createPaymentOrder({
      serverId: "417297319814496256",
      userId: "550e8400-e29b-41d4-a716-446655440000", // Use a real UUID
      productId: "fac6d03a-14dc-4f4a-a070-6bd53932d82f",
      quantity: 1,
      paymentMethod: false,
      discordChannelId: "test-channel"
    });
    res.json({ success: true, data: testOrder });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});
```

### 4. Common Error Scenarios & Solutions

#### Error 1: "Property 'walletProvider' does not exist on type 'TatumSDK'"
**Cause**: Tatum SDK version mismatch or incorrect import
**Solution**: 
```bash
# Check Tatum SDK version
npm list @tatumio/tatum

# If needed, install specific version:
npm install @tatumio/tatum@latest
```

#### Error 2: "Failed to create payment setup"
**Cause**: Invalid Tatum API key or network configuration
**Test**:
```bash
# Test Tatum API directly
curl -X GET "https://api.tatum.io/v3/ethereum/address/balance/0x1234567890123456789012345678901234567890" \
  -H "x-api-key: YOUR_TATUM_API_KEY"

# Should return balance data or specific error
```

#### Error 3: "User resolution failed" / "USER_NOT_FOUND"
**Cause**: Discord user ID format or missing users table entry
**Debug**:
```sql
-- Check users table structure
SELECT discord_id, id FROM users LIMIT 5;

-- Check if test user exists
SELECT * FROM users WHERE discord_id = '417296513270808580';
```

#### Error 4: "Product not found" / "PRODUCT_NOT_FOUND"
**Debug**:
```sql
-- Check if test product exists for the server
SELECT p.id, p.name, p.is_active, s.discord_server_id 
FROM products p 
JOIN servers s ON p.server_id = s.id 
WHERE s.discord_server_id = '417297319814496256';
```

#### Error 5: Database Connection Issues
**Test**:
```bash
# Test Supabase connection
curl -X GET "YOUR_SUPABASE_URL/rest/v1/users?select=count" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SUPABASE_SERVICE_KEY"
```

### 5. Debugging Tools

#### Enable Detailed Logging
Add to your `.env`:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

#### Database Query Logging
```javascript
// Add to tatumService.ts for debugging
logger.debug('Creating payment setup', {
  orderId,
  currency,
  tatumConfig: tatumConfig.defaults
});
```

#### Webhook Testing Tool
```bash
# Test webhook endpoint manually
curl -X POST http://localhost:3001/api/webhooks/tatum \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment_received",
    "orderId": "test-order-uuid",
    "txHash": "0xtest123",
    "amount": "0.05",
    "confirmations": 1
  }'
```

### 6. Error Monitoring Checklist

**Before Running Tests:**
- [ ] Backend starts without TypeScript errors
- [ ] Database connection successful
- [ ] All environment variables set
- [ ] Webhook health check passes

**During Order Creation:**
- [ ] JWT authentication succeeds
- [ ] Server resolution works (Discord ID → internal UUID)
- [ ] User resolution/creation works
- [ ] Product validation passes
- [ ] Tatum service creates wallet address
- [ ] Database insert succeeds

**After Order Creation:**
- [ ] Order has valid crypto address (not "placeholder_crypto_address")
- [ ] QR code generated successfully
- [ ] Webhook ID stored in database
- [ ] Order status is "pending"

**Webhook Testing:**
- [ ] Manual webhook confirmation works
- [ ] Webhook logs appear in payment_orders table
- [ ] Order status updates correctly

### 7. Quick Error Check Script

Create `test-tatum-integration.bat`:
```batch
@echo off
echo Testing Tatum Integration...

echo.
echo 1. Testing webhook health...
curl -s http://localhost:3001/api/webhooks/health

echo.
echo 2. Testing bot service auth...
curl -s -X POST http://localhost:3001/api/bot-service/auth ^
  -H "Content-Type: application/json" ^
  -H "X-Bot-Token: %BOT_SERVICE_TOKEN%" ^
  -d "{}"

echo.
echo 3. Testing order creation...
REM Use your existing test script here

echo.
echo 4. Checking recent webhook logs...
curl -s "http://localhost:3001/api/webhooks/logs?limit=5"

echo.
echo Testing complete. Check output above for errors.
pause
```

Run this script to quickly identify where errors occur in the integration flow.