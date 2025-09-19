@echo off
REM Discord Bot API Endpoints Test Script (Windows)
REM This script tests all implemented API endpoints in sequence

REM Configuration
set BASE_URL=http://localhost:3001
set SERVER_ID=417297319814496256
set USER_ID=417296513270808580
REM NOTE: Minecraft endpoints currently expect UUID. For testing, use a UUID like 550e8400-e29b-41d4-a716-446655440000

echo ============================================
echo Discord Bot API Endpoints Test
echo ============================================

REM Step 1: Resolve service token
set "BOT_SERVICE_TOKEN="

REM Check environment variable first
IF NOT "%DISCORD_BOT_SERVICE_TOKEN%"=="" (
    set "BOT_SERVICE_TOKEN=%DISCORD_BOT_SERVICE_TOKEN%"
    echo Using token from environment variable
    goto :have_token
)

REM Try to read from .env file
IF EXIST "packages\backend\.env" (
    echo Reading token from packages\backend\.env...
    for /f "usebackq tokens=1,2 delims==" %%A in ("packages\backend\.env") do (
        IF "%%A"=="DISCORD_BOT_SERVICE_TOKEN" set "BOT_SERVICE_TOKEN=%%B"
    )
)

:have_token
IF "%BOT_SERVICE_TOKEN%"=="" (
    echo ERROR: DISCORD_BOT_SERVICE_TOKEN not found!
    echo Please either:
    echo 1. Set it in your PowerShell session: $env:DISCORD_BOT_SERVICE_TOKEN="your_token"
    echo 2. Add it to packages\backend\.env: DISCORD_BOT_SERVICE_TOKEN=your_token
    pause
    exit /b 1
)

echo Using service token: %BOT_SERVICE_TOKEN:~0,20%...

REM Step 2: Get JWT token
echo.
echo Step 1: Getting JWT token...
curl -s -X POST "%BASE_URL%/api/bot-service/auth" ^
  -H "X-Bot-Token: %BOT_SERVICE_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"service\": \"discord_bot\", \"permissions\": [\"read_templates\",\"read_bot_config\",\"read_products\",\"read_categories\",\"create_payments\",\"minecraft_integration\",\"read_orders\",\"admin_access\"]}" > jwt_response.json

echo Debug: Auth response content:
type jwt_response.json
echo.

REM Extract JWT using PowerShell (more reliable)
for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "(Get-Content jwt_response.json | ConvertFrom-Json).data.token 2>$null"`) do set "JWT_TOKEN=%%A"

del jwt_response.json >nul 2>&1

IF "%JWT_TOKEN%"=="" (
    echo ERROR: Failed to extract JWT token from response.
    echo Make sure backend is running and DISCORD_BOT_SERVICE_TOKEN is correct.
    pause
    exit /b 1
)

echo JWT obtained: %JWT_TOKEN:~0,50%...

REM Step 3: Test endpoints
echo.
echo Step 2: Health Check
curl -H "Authorization: Bearer %JWT_TOKEN%" "%BASE_URL%/api/bot-service/health"

echo.
echo Step 3: Get Server Templates
curl -H "Authorization: Bearer %JWT_TOKEN%" "%BASE_URL%/api/bot-service/templates/%SERVER_ID%"

echo.
echo Step 4: Get Server Products  
curl -H "Authorization: Bearer %JWT_TOKEN%" "%BASE_URL%/api/bot-service/products/%SERVER_ID%"

echo.
echo Step 5: Get Server Categories
curl -H "Authorization: Bearer %JWT_TOKEN%" "%BASE_URL%/api/bot-service/categories/%SERVER_ID%"

echo.
echo Step 6: Create Payment Order
curl -X POST "%BASE_URL%/api/bot-service/orders" ^
  -H "Authorization: Bearer %JWT_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"serverId\": \"%SERVER_ID%\", \"discordUserId\": \"%USER_ID%\", \"products\": [{\"id\": \"fac6d03a-14dc-4f4a-a070-6bd53932d82f\", \"quantity\": 1}], \"paymentMethod\": false, \"discordChannelId\": \"test-channel\"}"

echo.
echo Step 7: Generate Minecraft Link Code
curl -X POST "%BASE_URL%/api/bot-service/minecraft/link-code" ^
  -H "Authorization: Bearer %JWT_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"serverId\": \"%SERVER_ID%\", \"discordUserId\": \"%USER_ID%\"}"

echo.
echo Step 8: Get Minecraft Account Info
curl -H "Authorization: Bearer %JWT_TOKEN%" "%BASE_URL%/api/bot-service/minecraft/%SERVER_ID%/%USER_ID%"

echo.
echo Step 9: Admin Statistics
curl -H "Authorization: Bearer %JWT_TOKEN%" "%BASE_URL%/api/bot-service/admin/stats"

echo.
echo ==================================================
echo Done! If Minecraft endpoints fail with UUID errors, 
echo use a UUID for USER_ID or change DB column to TEXT.
echo ==================================================

pause