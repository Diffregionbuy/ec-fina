# Permission Fix - Bot Authentication

## 🔧 Issue Fixed

**Problem:** The bot authentication was rejecting the `minecraft_integration` permission because it wasn't defined in the valid permissions list.

**Error Message:**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Unauthorized permissions: minecraft_integration",
    "timestamp": "2025-09-04T16:42:07.484Z"
  }
}
```

## ✅ Solution Applied

**Updated:** `packages/backend/src/middleware/botAuth.ts`

Added `minecraft_integration` to the valid permissions list:

```typescript
private validPermissions = new Set([
  'read_templates',
  'read_products', 
  'read_categories',
  'create_payments',
  'webhook_access',
  'minecraft_integration'  // ✅ Added this permission
]);
```

## 🧪 Test Now

You can now test the authentication with the correct permissions:

```bash
curl -X POST http://localhost:3001/api/bot-service/auth \
  -H "Content-Type: application/json" \
  -H "X-Bot-Token: your_discord_bot_token" \
  -d '{
    "service": "discord_bot",
    "permissions": [
      "read_templates",
      "read_products", 
      "read_categories",
      "create_payments",
      "minecraft_integration"
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600,
    "service": "discord_bot",
    "permissions": [
      "read_templates",
      "read_products", 
      "read_categories",
      "create_payments",
      "minecraft_integration"
    ]
  }
}
```

## 📁 Files Updated

1. `packages/backend/src/middleware/botAuth.ts` - Added minecraft_integration permission
2. `test-api-endpoints.sh` - Updated with correct permissions
3. `test-api-endpoints.bat` - Updated with correct permissions  
4. `API_ENDPOINTS_TESTING_GUIDE.md` - Updated with correct permissions

## 🚀 Ready to Test

All testing scripts and documentation now use the correct permissions. You can run:

- **Linux/Mac:** `./test-api-endpoints.sh`
- **Windows:** `test-api-endpoints.bat`
- **Manual:** Follow `API_ENDPOINTS_TESTING_GUIDE.md`

The authentication should now work correctly! 🎉