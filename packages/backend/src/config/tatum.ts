import dotenv from 'dotenv';

dotenv.config();

export const tatumConfig = {
  // Tatum API configuration
  apiKey: process.env.TATUM_API_KEY || '',
  testnet: process.env.NODE_ENV !== 'production',
  
  // Supported networks and currencies
  networks: {
    ethereum: {
      name: 'ethereum',
      currency: 'ETH',
      testnet: 'ethereum-sepolia',
      confirmations: 12
    },
    bitcoin: {
      name: 'bitcoin',
      currency: 'BTC', 
      testnet: 'bitcoin-testnet',
      confirmations: 6
    },
    polygon: {
      name: 'polygon',
      currency: 'MATIC',
      testnet: 'polygon-mumbai',
      confirmations: 20
    }
  },

  // Default settings
  defaults: {
    network: 'ethereum',
    currency: 'ETH',
    webhookUrl: process.env.TATUM_WEBHOOK_URL || `${process.env.BACKEND_URL}/api/webhooks/tatum`,
    paymentTimeout: 30 * 60 * 1000, // 30 minutes
    minConfirmations: 1
  },

  // Webhook configuration
  webhook: {
    url: process.env.TATUM_WEBHOOK_URL || `${process.env.BACKEND_URL}/api/webhooks/tatum`,
    secret: process.env.TATUM_WEBHOOK_SECRET || 'your-webhook-secret-here',
    retryAttempts: 3,
    retryDelay: 5000 // 5 seconds
  },

  // Rate limiting
  rateLimit: {
    requestsPerSecond: 10,
    burstLimit: 50
  }
};

// Validation
export function validateTatumConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!tatumConfig.apiKey) {
    errors.push('TATUM_API_KEY is required');
  }

  if (!tatumConfig.webhook.url) {
    errors.push('TATUM_WEBHOOK_URL is required');
  }

  if (!tatumConfig.webhook.secret || tatumConfig.webhook.secret === 'your-webhook-secret-here') {
    errors.push('TATUM_WEBHOOK_SECRET must be set to a secure value');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Environment variables needed:
// TATUM_API_KEY=your_tatum_api_key_here
// TATUM_WEBHOOK_URL=https://yourdomain.com/api/webhooks/tatum  
// TATUM_WEBHOOK_SECRET=your_secure_webhook_secret_here
// BACKEND_URL=https://yourdomain.com (for webhook URL generation)