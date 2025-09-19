import { Router } from 'express';
import { logger } from '../utils/logger';
import { optimizedAuthMiddleware } from '../middleware/optimizedAuth';
import { authenticateBotService } from '../middleware';
import { tatumService } from '../services/tatumService';

const router = Router();

// Minimal mapping for icons (CoinGecko ids)
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  BSC: 'binancecoin',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  SOL: 'solana',
  TRON: 'tron',
  TRX: 'tron',
  MATIC: 'matic-network',
  DOGE: 'dogecoin',
  LTC: 'litecoin',
};

function coinIcon(symbol: string): string {
  const id = COINGECKO_IDS[symbol.toUpperCase()] || symbol.toLowerCase();
  // CoinGecko static path pattern
  return `https://assets.coingecko.com/coins/images/1/large/${id}.png`;
}

// Tier-1 networks only
type ChainDef = { key: string; name: string; symbol: string; mainnet: string; testnet: string };
const TIER1_CHAINS: ChainDef[] = [
  { key: 'algorand', name: 'Algorand', symbol: 'ALGO', mainnet: 'algorand-mainnet', testnet: 'algorand-testnet' },
  { key: 'arbitrum', name: 'Arbitrum One', symbol: 'ETH', mainnet: 'arbitrum-one', testnet: 'arbitrum-sepolia' },
  { key: 'avalanche', name: 'Avalanche', symbol: 'AVAX', mainnet: 'avalanche-c', testnet: 'avalanche-fuji' },
  { key: 'base', name: 'Base', symbol: 'ETH', mainnet: 'base-mainnet', testnet: 'base-sepolia' },
  { key: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', mainnet: 'bitcoin-mainnet', testnet: 'bitcoin-testnet' },
  { key: 'bsc', name: 'Binance Smart Chain', symbol: 'BNB', mainnet: 'bsc-mainnet', testnet: 'bsc-testnet' },
  { key: 'sui', name: 'Sui', symbol: 'SUI', mainnet: 'sui-mainnet', testnet: 'sui-testnet' },
  { key: 'near', name: 'NEAR', symbol: 'NEAR', mainnet: 'near-mainnet', testnet: 'near-testnet' },
  { key: 'bitcoincash', name: 'Bitcoin Cash', symbol: 'BCH', mainnet: 'bitcoincash-mainnet', testnet: 'bitcoincash-testnet' },
  { key: 'cardano', name: 'Cardano', symbol: 'ADA', mainnet: 'cardano-mainnet', testnet: 'cardano-preprod' },
  { key: 'celo', name: 'Celo', symbol: 'CELO', mainnet: 'celo-mainnet', testnet: 'celo-alfajores' },
  { key: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', mainnet: 'dogecoin-mainnet', testnet: 'dogecoin-testnet' },
  { key: 'eos', name: 'EOS', symbol: 'EOS', mainnet: 'eos-mainnet', testnet: 'eos-testnet' },
  { key: 'ethereum', name: 'Ethereum', symbol: 'ETH', mainnet: 'ethereum-mainnet', testnet: 'ethereum-sepolia' },
  { key: 'fantom', name: 'Fantom', symbol: 'FTM', mainnet: 'fantom-mainnet', testnet: 'fantom-testnet' },
  { key: 'flare', name: 'Flare', symbol: 'FLR', mainnet: 'flare-mainnet', testnet: 'flare-coston' },
  { key: 'kaia', name: 'Kaia', symbol: 'KAI', mainnet: 'kaia-mainnet', testnet: 'kaia-baobab' },
  { key: 'litecoin', name: 'Litecoin', symbol: 'LTC', mainnet: 'litecoin-mainnet', testnet: 'litecoin-testnet' },
  { key: 'optimism', name: 'Optimism', symbol: 'ETH', mainnet: 'optimism-mainnet', testnet: 'optimism-sepolia' },
  { key: 'polygon', name: 'Polygon', symbol: 'MATIC', mainnet: 'polygon-mainnet', testnet: 'polygon-amoy' },
  { key: 'ripple', name: 'Ripple', symbol: 'XRP', mainnet: 'xrp-mainnet', testnet: 'xrp-testnet' },
  { key: 'solana', name: 'Solana', symbol: 'SOL', mainnet: 'solana-mainnet', testnet: 'solana-devnet' },
  { key: 'stellar', name: 'Stellar', symbol: 'XLM', mainnet: 'stellar-mainnet', testnet: 'stellar-testnet' },
  { key: 'tron', name: 'Tron', symbol: 'TRX', mainnet: 'tron-mainnet', testnet: 'tron-shasta' },
];

const byKey = (k: string) => TIER1_CHAINS.find((c) => c.key === k)!;

// Define coin -> supported networks mapping (Tier-1 only)
const COIN_NETWORKS: Record<string, string[]> = {
  // native coins
  BTC: ['bitcoin'],
  ETH: ['ethereum', 'arbitrum', 'base', 'optimism'],
  AVAX: ['avalanche'],
  BNB: ['bsc'],
  SUI: ['sui'],
  NEAR: ['near'],
  BCH: ['bitcoincash'],
  ADA: ['cardano'],
  CELO: ['celo'],
  DOGE: ['dogecoin'],
  EOS: ['eos'],
  FTM: ['fantom'],
  FLR: ['flare'],
  KAI: ['kaia'],
  LTC: ['litecoin'],
  MATIC: ['polygon'],
  XRP: ['ripple'],
  SOL: ['solana'],
  XLM: ['stellar'],
  TRX: ['tron'],

  // Stablecoins support lists
  USDT: ['algorand', 'bsc', 'celo', 'eos', 'ethereum', 'polygon', 'solana', 'stellar', 'tron'],
  USDC: ['algorand', 'arbitrum', 'avalanche', 'base', 'bsc', 'celo', 'ethereum', 'optimism', 'polygon', 'solana', 'stellar'],
};

// GET /api/tatum/supported - coins + networks for dropdowns (tatum-based)
// Accept either user JWT (Authorization) or bot service token (X-BOT-TOKEN)
const eitherAuth = (req: any, res: any, next: any) => {
  if (req.headers['x-bot-token']) {
    return (authenticateBotService as any)(req, res, next);
  }
  return (optimizedAuthMiddleware.authenticate as any)(req, res, next);
};

router.get('/supported', eitherAuth, async (_req, res) => {
  try {
    const health = tatumService.getHealthStatus();
    const coins = Object.keys(COIN_NETWORKS).map((symbol) => {
      // derive name from any one of its chains or from symbol
      const networks = COIN_NETWORKS[symbol].map((ckey) => byKey(ckey)).filter(Boolean);
      const displayName = (() => {
        // If symbol is stablecoin, name is well-known
        if (symbol === 'USDT') return 'Tether USD';
        if (symbol === 'USDC') return 'USD Coin';
        // else use chain name of the first
        return networks[0]?.symbol === symbol ? networks[0].name : symbol;
      })();

      const buildNet = (c: ChainDef, type: 'mainnet' | 'testnet') => ({
        id: `${symbol.toLowerCase()}-${c.key}-${type}`,
        name: `${c.name} ${type === 'mainnet' ? 'Mainnet' : 'Testnet'}`,
        chain: type === 'mainnet' ? c.mainnet : c.testnet,
        symbol,
        logoUrl: coinIcon(symbol),
        fee: type === 'mainnet' ? 'dynamic' : 'testnet',
        minAmount: '0',
        maxAmount: 'unlimited',
        withdrawalTime: health.isTestnet ? 'test environment' : type === 'mainnet' ? '1-10 min' : 'simulation',
        canWithdraw: true,
        canDeposit: true,
      });

      return {
        symbol,
        name: displayName,
        logoUrl: coinIcon(symbol),
        networks: networks.flatMap((c) => [buildNet(c, 'mainnet'), buildNet(c, 'testnet')]),
      };
    });

    res.json({ success: true, data: coins, isTestnet: health.isTestnet });
  } catch (error) {
    logger.error('Failed to build Tatum supported list:', error);
    res.status(500).json({ success: false, error: { code: 'TATUM_SUPPORTED_ERROR', message: 'Failed to build list' } });
  }
});

// POST /api/tatum/simulate-payment - simulate an incoming tx (test convenience)
router.post('/simulate-payment', optimizedAuthMiddleware.authenticate, async (req, res) => {
  try {
    const { address, currency = 'ETH', amount = '0.01', txId, orderId } = req.body || {};
    if (!address && !orderId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'address or orderId required' } });
    }

    const fakeTxId = txId || `sim_${Date.now().toString(36)}`;
    const payload: any = {
      type: 'INCOMING_NATIVE_TX',
      address,
      amount: String(amount),
      txId: fakeTxId,
      currency,
      orderId,
    };

    await tatumService.processPaymentWebhook(payload);

    res.json({ success: true, data: { simulated: true, txId: fakeTxId }, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('Failed to simulate payment:', error);
    res.status(500).json({ success: false, error: { code: 'SIMULATION_ERROR', message: 'Failed to simulate payment' } });
  }
});

export default router;
