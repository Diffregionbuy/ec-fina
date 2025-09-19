/**
 * Test script to verify currency exchange API functionality
 * Tests OKX (primary) and Tatum (backup) price sources
 */

import { tatumService } from '../src/services/tatumService';
import { logger } from '../src/utils/logger';
import 'dotenv/config';

// Type definitions
interface TestResult {
  success: boolean;
  crypto: string;
  fiat: string;
  source?: string;
  rate?: number;
  amount?: number;
  duration?: number;
  error?: string;
}

interface ApiTestResult {
  success: boolean;
  price?: number;
  status?: number;
  error?: string;
}

// Test configuration
const TEST_CURRENCIES = [
  { crypto: 'ETH', fiat: 'USD', amount: 100 },
  { crypto: 'BTC', fiat: 'USD', amount: 1000 },
  { crypto: 'MATIC', fiat: 'USD', amount: 50 },
  { crypto: 'BNB', fiat: 'USD', amount: 200 },
  { crypto: 'SOL', fiat: 'USD', amount: 150 }
];

/**
 * Test individual price conversion
 */
async function testPriceConversion(crypto: string, fiat: string, amount: number): Promise<TestResult> {
  console.log(`\n🔍 Testing ${crypto}/${fiat} conversion for $${amount}`);
  console.log('─'.repeat(50));
  
  try {
    const startTime = Date.now();
    const result = await tatumService.convertFiatToCrypto(amount, fiat, crypto);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success (${duration}ms)`);
    console.log(`   Source: ${result.source}`);
    console.log(`   Rate: $${result.rate.toLocaleString()}`);
    console.log(`   Amount: ${result.amount} ${crypto}`);
    console.log(`   Timestamp: ${result.at}`);
    
    return {
      success: true,
      crypto,
      fiat,
      source: result.source,
      rate: result.rate,
      amount: result.amount,
      duration
    };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return {
      success: false,
      crypto,
      fiat,
      error: error.message
    };
  }
}

/**
 * Test OKX API directly
 */
async function testOKXDirect(): Promise<ApiTestResult> {
  console.log('\n🌐 Testing OKX API directly');
  console.log('─'.repeat(50));
  
  try {
    const response = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USD');
    const data = await response.json();
    
    if (data.code === "0" && data.data && data.data.length > 0) {
      const price = parseFloat(data.data[0].last);
      console.log(`✅ OKX API Response:`);
      console.log(`   BTC Price: $${price.toLocaleString()}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response Code: ${data.code}`);
      return { success: true, price, status: response.status };
    } else {
      console.log(`❌ Invalid OKX response format`);
      return { success: false, error: 'Invalid response format' };
    }
  } catch (error) {
    console.log(`❌ OKX API Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Tatum API directly
 */
async function testTatumDirect(): Promise<ApiTestResult> {
  console.log('\n🔧 Testing Tatum API directly');
  console.log('─'.repeat(50));
  
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    console.log('❌ TATUM_API_KEY not configured');
    return { success: false, error: 'API key missing' };
  }
  
  try {
    const response = await fetch('https://api.tatum.io/v3/tatum/rate/BTC?basePair=USD', {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Tatum API Response:`);
      console.log(`   BTC Price: $${data.value?.toLocaleString() || 'N/A'}`);
      console.log(`   Status: ${response.status}`);
      return { success: true, price: data.value, status: response.status };
    } else {
      console.log(`❌ Tatum API Error: ${response.status}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log(`❌ Tatum API Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test service health
 */
function testServiceHealth() {
  console.log('\n🏥 Service Health Check');
  console.log('─'.repeat(50));
  
  const health = tatumService.getHealthStatus();
  
  console.log(`API Key Configured: ${health.apiKeyConfigured ? '✅' : '❌'}`);
  console.log(`Is Testnet: ${health.isTestnet ? '✅' : '❌'}`);
  console.log(`Base URL: ${health.baseUrl}`);
  console.log(`Notification URL: ${health.notifBaseUrl}`);
  console.log(`Supported Currencies: ${health.supportedCurrencies.length}`);
  console.log(`  └─ ${health.supportedCurrencies.slice(0, 10).join(', ')}${health.supportedCurrencies.length > 10 ? '...' : ''}`);
  
  return health;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Currency Exchange API Test Suite');
  console.log('═'.repeat(60));
  
  // Environment check
  console.log('\n📋 Environment Configuration');
  console.log('─'.repeat(50));
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`TATUM_API_KEY: ${process.env.TATUM_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`OKX_API_KEY: ${process.env.OKX_API_KEY ? '✅ Configured' : '❌ Missing (optional)'}`);
  
  // Service health check
  const health = testServiceHealth();
  
  // Direct API tests
  const okxTest = await testOKXDirect();
  const tatumTest = await testTatumDirect();
  
  // Price conversion tests
  console.log('\n💱 Price Conversion Tests');
  console.log('═'.repeat(50));
  
  const results = [];
  for (const test of TEST_CURRENCIES) {
    const result = await testPriceConversion(test.crypto, test.fiat, test.amount);
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('═'.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Successful: ${successful.length} ✅`);
  console.log(`Failed: ${failed.length} ${failed.length > 0 ? '❌' : '✅'}`);
  
  if (successful.length > 0) {
    console.log('\n🎯 API Source Usage:');
    const sources = {};
    successful.forEach(r => {
      sources[r.source] = (sources[r.source] || 0) + 1;
    });
    
    Object.entries(sources).forEach(([source, count]) => {
      console.log(`   ${source}: ${count} requests`);
    });
    
    console.log('\n💰 Sample Prices:');
    successful.slice(0, 3).forEach(r => {
      console.log(`   ${r.crypto}: $${r.rate.toLocaleString()} (${r.source})`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(r => {
      console.log(`   ${r.crypto}/${r.fiat}: ${r.error}`);
    });
  }
  
  console.log('\n🏁 Test Complete');
  
  // Exit with appropriate code
  process.exit(failed.length > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Promise Rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});

export { runTests, testPriceConversion, testOKXDirect, testTatumDirect };