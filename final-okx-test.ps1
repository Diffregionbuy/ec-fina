# Final OKX API Test - Simple and Clear
Write-Host "=== FINAL OKX API TEST ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check what we get when accessing OKX
Write-Host "1. Testing OKX API endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://www.okx.com/api/v5/public/time" -TimeoutSec 10
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))" -ForegroundColor White
    
    # Check if it's a valid OKX response
    if ($response.Content -match '"code":"0"' -and $response.Content -match '"ts":') {
        Write-Host "   ✅ VALID OKX API RESPONSE" -ForegroundColor Green
    } else {
        Write-Host "   ❌ INVALID RESPONSE - Likely filtered/blocked" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Check DNS resolution details
Write-Host "2. Checking DNS resolution..." -ForegroundColor Yellow
try {
    $dns = Resolve-DnsName -Name "www.okx.com"
    Write-Host "   Resolved IP: $($dns[0].IPAddress)" -ForegroundColor White
    
    # Check if IP is in suspicious range
    $ip = $dns[0].IPAddress
    if ($ip -match "^198\.18\.") {
        Write-Host "   ⚠️  SUSPICIOUS IP - This is likely a filtered/redirected response" -ForegroundColor Yellow
        Write-Host "   💡 Real OKX IPs should be different (e.g., 104.x.x.x range)" -ForegroundColor Cyan
    } else {
        Write-Host "   ✅ IP looks legitimate" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ DNS resolution failed" -ForegroundColor Red
}

Write-Host ""

# Test 3: Your location
Write-Host "3. Checking your location..." -ForegroundColor Yellow
try {
    $location = Invoke-RestMethod -Uri "https://ipapi.co/json/" -TimeoutSec 5
    Write-Host "   Country: $($location.country_name) ($($location.country_code))" -ForegroundColor White
    Write-Host "   City: $($location.city)" -ForegroundColor White
    
    if ($location.country_code -eq "CN") {
        Write-Host "   🚨 YOU ARE IN CHINA - OKX IS BLOCKED/FILTERED" -ForegroundColor Red
    }
} catch {
    Write-Host "   Could not determine location" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== CONCLUSION ===" -ForegroundColor Cyan

# Final recommendation
$needsVPN = $true
Write-Host ""
if ($needsVPN) {
    Write-Host "🎯 SOLUTION: You need a VPN to access OKX from China" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "STEPS TO FIX:" -ForegroundColor Green
    Write-Host "1. Connect to a VPN server in:" -ForegroundColor White
    Write-Host "   • Hong Kong 🇭🇰" -ForegroundColor White
    Write-Host "   • Singapore 🇸🇬" -ForegroundColor White
    Write-Host "   • Japan 🇯🇵" -ForegroundColor White
    Write-Host "   • United States 🇺🇸" -ForegroundColor White
    Write-Host ""
    Write-Host "2. After connecting VPN, test again:" -ForegroundColor White
    Write-Host "   cd packages/backend" -ForegroundColor Gray
    Write-Host "   npm run okx-check" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. If VPN works, your OKX service should start working!" -ForegroundColor Green
}

Write-Host ""
Write-Host "📞 Need help? The issue is geographic blocking, not your code!" -ForegroundColor Cyan