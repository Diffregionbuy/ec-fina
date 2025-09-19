#!/bin/bash

# Discord Bot API Endpoints Test Script
# This script tests all implemented API endpoints in sequence

# Configuration
BASE_URL="http://localhost:3001"
BOT_TOKEN="your_discord_bot_token"  # Replace with your actual token
SERVER_ID="your_server_id"          # Replace with actual server ID
USER_ID="your_user_id"              # Replace with actual user ID

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🤖 Discord Bot API Endpoints Test Script${NC}"
echo "=================================================="

# Function to make API calls and check responses
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local headers=$4
    local description=$5
    
    echo -e "\n${YELLOW}Testing: $description${NC}"
    echo "Endpoint: $method $endpoint"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$endpoint" \
            -H "Content-Type: application/json" \
            $headers \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" "$endpoint" $headers)
    fi
    
    # Extract HTTP status code (last line)
    http_code=$(echo "$response" | tail -n1)
    # Extract response body (all but last line)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        echo -e "${GREEN}✅ SUCCESS (HTTP $http_code)${NC}"
        echo "Response: $(echo "$body" | jq -r '.success // "No success field"')"
        
        # Extract JWT token from auth response
        if [[ "$endpoint" == *"/auth" ]]; then
            JWT_TOKEN=$(echo "$body" | jq -r '.data.token // empty')
            if [ -n "$JWT_TOKEN" ]; then
                echo -e "${GREEN}🔑 JWT Token extracted successfully${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ FAILED (HTTP $http_code)${NC}"
        echo "Error: $body"
    fi
}

# Step 1: Generate JWT Token
echo -e "\n${BLUE}Step 1: Authentication${NC}"
test_endpoint "POST" \
    "$BASE_URL/api/bot-service/auth" \
    '{"service": "discord_bot", "permissions": ["read_templates", "read_products", "create_payments", "minecraft_integration"]}' \
    "-H \"X-Bot-Token: $BOT_TOKEN\"" \
    "Generate JWT Token"

# Check if JWT token was extracted
if [ -z "$JWT_TOKEN" ]; then
    echo -e "${RED}❌ Failed to get JWT token. Cannot continue with other tests.${NC}"
    echo -e "${YELLOW}Please check:${NC}"
    echo "1. Backend server is running on $BASE_URL"
    echo "2. BOT_TOKEN is correct in this script"
    echo "3. Environment variables are set correctly"
    exit 1
fi

# Step 2: Health Check
echo -e "\n${BLUE}Step 2: Health Check${NC}"
test_endpoint "GET" \
    "$BASE_URL/api/bot-service/health" \
    "" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Health Check"

# Step 3: Get Server Templates
echo -e "\n${BLUE}Step 3: Server Data${NC}"
test_endpoint "GET" \
    "$BASE_URL/api/bot-service/templates/$SERVER_ID" \
    "" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Get Server Templates"

# Step 4: Get Server Products
test_endpoint "GET" \
    "$BASE_URL/api/bot-service/products/$SERVER_ID" \
    "" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Get Server Products"

# Step 5: Get Server Categories
test_endpoint "GET" \
    "$BASE_URL/api/bot-service/categories/$SERVER_ID" \
    "" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Get Server Categories"

# Step 6: Create Payment Order
echo -e "\n${BLUE}Step 4: Payment System${NC}"
test_endpoint "POST" \
    "$BASE_URL/api/bot-service/orders" \
    "{\"serverId\": \"$SERVER_ID\", \"userId\": \"$USER_ID\", \"products\": [{\"id\": \"test-product\", \"quantity\": 1}], \"paymentMethod\": false, \"discordChannelId\": \"test-channel\"}" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Create Payment Order"

# Step 7: Minecraft Integration
echo -e "\n${BLUE}Step 5: Minecraft Integration${NC}"
test_endpoint "POST" \
    "$BASE_URL/api/bot-service/minecraft/link-code" \
    "{\"serverId\": \"$SERVER_ID\", \"discordUserId\": \"$USER_ID\"}" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Generate Minecraft Link Code"

# Step 8: Get Minecraft Account Info
test_endpoint "GET" \
    "$BASE_URL/api/bot-service/minecraft/$SERVER_ID/$USER_ID" \
    "" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Get Minecraft Account Info"

# Step 9: Admin Statistics
echo -e "\n${BLUE}Step 6: Admin Endpoints${NC}"
test_endpoint "GET" \
    "$BASE_URL/api/bot-service/admin/stats" \
    "" \
    "-H \"Authorization: Bearer $JWT_TOKEN\"" \
    "Get Admin Statistics"

echo -e "\n${BLUE}=================================================="
echo -e "🎉 API Endpoints Testing Complete!${NC}"
echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Check any failed endpoints and fix issues"
echo "2. Update SERVER_ID and USER_ID with real values"
echo "3. Add real products/categories to your database"
echo "4. Move to Phase 1.3: Tatum Integration"
echo -e "\n${GREEN}All endpoints are ready for Discord bot integration! 🚀${NC}"