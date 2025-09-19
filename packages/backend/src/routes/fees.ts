import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// Map our network keys to OKX chain name fragments
const NETWORK_TO_OKX_HINT: Record<string, string[]> = {
  // ERC20-style networks and L2s
  'ethereum-erc20': ['ERC20', 'ETH-ERC20'],
  'ethereum-mainnet': ['ERC20', 'ETH-ERC20', 'Ethereum', 'ETH'],
  'bsc-bep20': ['BEP20', 'BSC'],
  'bsc-mainnet': ['BSC', 'BNB Smart Chain', 'BEP20'],
  'polygon-erc20': ['Polygon', 'MATIC', 'ERC20'],
  'polygon-mainnet': ['Polygon', 'MATIC'],
  'avalanche-erc20': ['Avalanche', 'AVAX', 'C-Chain', 'C Chain'],
  'avalanche-c-chain': ['Avalanche', 'AVAX', 'C-Chain', 'C Chain'],
  'arbitrum-erc20': ['Arbitrum'],
  'optimism-erc20': ['Optimism'],

  // Non-EVM and native chains
  'tron-trc20': ['TRC20', 'TRON', 'TRX'],
  'tron-mainnet': ['TRON', 'TRX'],
  'solana-spl': ['SOL', 'SPL', 'Solana'],
  'solana-mainnet': ['SOL', 'Solana'],
  'bitcoin-mainnet': ['BTC', 'Bitcoin'],
  'litecoin-mainnet': ['LTC', 'Litecoin'],
  'dogecoin-mainnet': ['DOGE', 'Dogecoin'],
  'xrp-mainnet': ['XRP', 'Ripple'],
  'cardano-mainnet': ['ADA', 'Cardano'],
  'algorand-mainnet': ['ALGO', 'Algorand'],
  'fantom-mainnet': ['FTM', 'Fantom'],
};

 // Static fallbacks for common coin/network withdraw fees (approximate)
function staticFallback(coin: string, network: string): number {
  const key = `${coin.toUpperCase()}:${network.toLowerCase()}`;
  const map: Record<string, number> = {
    'ETH:ethereum-mainnet': 0.00008,
    'BTC:bitcoin-mainnet': 0.0003,
    'USDT:tron-trc20': 1,
    'USDT:ethereum-erc20': 10,
    'USDT:bsc-bep20': 1,
    'USDT:polygon-erc20': 1,
    'USDC:tron-trc20': 1,
    'USDC:ethereum-erc20': 10,
    'USDC:bsc-bep20': 1,
    'USDC:polygon-erc20': 1,
    'SOL:solana-mainnet': 0.01,
    'MATIC:polygon-mainnet': 0.2,
    'BNB:bsc-mainnet': 0.001,
    'AVAX:avalanche-c-chain': 0.01
  };
  return map[key] || 0;
}

// Network estimation (public sources) to approximate on-chain fee when OKX is unavailable
async function networkEstimate(coin: string, network: string): Promise<{ feeNative: number; feeUnit: string; source: string; ttl: number } | null> {
  try {
    const coinUp = String(coin || '').toUpperCase();
    const net = String(network || '').toLowerCase();

    // Bitcoin mainnet via mempool.space
    if (coinUp === 'BTC' && net === 'bitcoin-mainnet') {
      const r = await axios.get('https://mempool.space/api/v1/fees/recommended', { timeout: 1200 });
      const sats = Number(r.data?.halfHourFee || r.data?.fastestFee || r.data?.hourFee || 0);
      const vbytes = 150; // approx 1-in/2-out P2WPKH
      const feeBtc = (sats * vbytes) / 1e8;
      if (feeBtc > 0) return { feeNative: feeBtc, feeUnit: 'BTC', source: 'network', ttl: 120 };
      return null;
    }

    // EVM networks (ETH, ERC20, BSC, Polygon, Arbitrum, Optimism, Avalanche)
    const isEvm =
      net.includes('ethereum') || net.includes('bsc') || net.includes('polygon') ||
      net.includes('arbitrum') || net.includes('optimism') || net.includes('avalanche');

    if (isEvm) {
      const rpcMap: Record<string, string> = {
        'ethereum-mainnet': 'https://cloudflare-eth.com',
        'ethereum-erc20': 'https://cloudflare-eth.com',
        'bsc-mainnet': 'https://bsc-dataseed.binance.org',
        'bsc-bep20': 'https://bsc-dataseed.binance.org',
        'polygon-mainnet': 'https://polygon-rpc.com',
        'polygon-erc20': 'https://polygon-rpc.com',
        'arbitrum-erc20': 'https://arb1.arbitrum.io/rpc',
        'optimism-erc20': 'https://mainnet.optimism.io',
        'avalanche-c-chain': 'https://api.avax.network/ext/bc/C/rpc',
        'avalanche-erc20': 'https://api.avax.network/ext/bc/C/rpc'
      };
      const rpc = rpcMap[net] || rpcMap[net.split(':')[0] as any];
      if (!rpc) return null;

      const resp = await axios.post(
        rpc,
        { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] },
        { timeout: 1800, headers: { 'Content-Type': 'application/json' } }
      );
      const hex = resp.data?.result as string;
      if (typeof hex !== 'string') return null;

      const gasPriceWei = Number(BigInt(hex));
      const isToken = net.endsWith('erc20') || net.includes('erc20');
      const gasUnits = isToken ? 65000 : 21000;
      const feeNative = (gasPriceWei * gasUnits) / 1e18;
      const feeUnit =
        (net.includes('bsc') ? 'BNB'
          : net.includes('polygon') ? 'MATIC'
          : net.includes('avalanche') ? 'AVAX'
          : (net.includes('ethereum') || net.includes('arbitrum') || net.includes('optimism')) ? 'ETH'
          : coinUp);
      if (feeNative > 0) return { feeNative, feeUnit, source: 'network', ttl: 60 };
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

// Simple in-memory cache (TTL in ms)
const cache = new Map<string, { data: any; expiresAt: number }>();
function getCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}
function setCache<T>(key: string, data: T, ttlMs = 10 * 60_000) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function pickOkxChain(ccyData: any, coin: string, network: string) {
  if (!ccyData || !Array.isArray(ccyData.chains)) return null;
  const hints = NETWORK_TO_OKX_HINT[network] || [];
  const coinUp = (coin || '').toUpperCase();

  let candidates = ccyData.chains as any[];
  // Exclude X Layer variants and prefer ERC20 for Ethereum networks
  if (network.includes('ethereum')) {
    let filtered = candidates.filter((ch: any) => {
      const chainName = String(ch?.chain || '');
      const netName = String((ch as any)?.net || (ch as any)?.network || '');
      return !/x\s*layer/i.test(chainName) && !/x\s*layer/i.test(netName);
    });
    if (filtered.length) candidates = filtered;
    if (network === 'ethereum-mainnet') {
      const erc = candidates.find((ch: any) =>
        /erc20/i.test(String(ch?.chain || '')) ||
        /erc20/i.test(String((ch as any)?.net || (ch as any)?.network || ''))
      );
      if (erc) return erc;
    }
  }

  const byHint = candidates.find((ch: any) => {
    const chNameCombined = (
      String(ch.chain || '') + ' ' +
      String((ch as any).net || (ch as any).network || '')
    ).toLowerCase();
    return hints.some(h => chNameCombined.includes(h.toLowerCase()));
  });
  if (byHint) return byHint;

  const active = candidates.find((ch: any) => ch?.canWd === true || String(ch?.canWd).toLowerCase() === 'true');
  if (active) return active;

  return candidates[0] || null;
}

/**
 * GET /api/fees/estimate?coin=USDT&network=tron-trc20[&amount=123]
 * Returns: { success, data: { feeNative, feeUnit, source, ttl, chain? } }
 */
router.get('/estimate', async (req: Request, res: Response) => {
  try {
    const coin = String(req.query.coin || '').toUpperCase();
    const network = String(req.query.network || '').toLowerCase();

    if (!coin || !network) {
      return res.status(400).json({ success: false, error: 'coin and network are required' });
    }

    const cacheKey = `okx-fee:${coin}:${network}`;
    const noCache = String(req.query.nocache || '').toLowerCase() === 'true';
    const cached = !noCache ? getCache<any>(cacheKey) : null;
    if (cached) return res.json({ success: true, data: cached });

    // Use internal OKX proxy endpoints (prefer backend route if available)
    const selfBase = `${req.protocol}://${req.get('host')}`;
    const proxyCandidates = [
      `${selfBase}/api/backend/okx/currencies?ccy=${encodeURIComponent(coin)}`,
      `${selfBase}/api/okx/currencies?ccy=${encodeURIComponent(coin)}`
    ];
    let payload: any = null;
    let proxyUsed: string | null = null;
    for (const proxyUrl of proxyCandidates) {
      try {
        const perTimeout = proxyUrl.includes('/api/okx/') ? 2800 : 800;
        const resp = await axios.get(proxyUrl, { timeout: perTimeout });
        const data = resp?.data;
        // Normalize various proxy shapes into OKX-like { code: '0', data: [...] }
        let normalized: any = null;
        if (data && Array.isArray(data.data)) {
          normalized = { code: '0', data: data.data };
        } else if (Array.isArray(data)) {
          normalized = { code: '0', data };
        } else if (data && typeof data === 'object') {
          // Try common shapes from our proxy:
          // - { success: true, data: [...] }
          // - { code: '0', data: [...] }
          // - { currencies: [...] }
          // - { <symbol>: [ ...chains ], ... }
          if (Array.isArray((data as any).data)) {
            normalized = { code: (data as any).code ?? '0', data: (data as any).data };
          } else if (Array.isArray((data as any).currencies)) {
            normalized = { code: '0', data: (data as any).currencies };
          } else {
            // Flatten array-valued properties (e.g., per-coin arrays)
            const arrays = Object.values(data as any).filter(Array.isArray) as any[][];
            const flattened = arrays.length ? arrays.flat() : [];
            if (flattened.length) {
              normalized = { code: '0', data: flattened };
            } else {
              normalized = data;
            }
          }
        } else {
          normalized = data;
        }
        if (normalized?.code === '0' && Array.isArray(normalized?.data)) {
          payload = normalized;
          proxyUsed = proxyUrl;
          break;
        } else {
          console.warn('[fees] okx.proxy.nonzero', {
            proxyUrl,
            code: normalized?.code,
            hasData: Array.isArray(normalized?.data),
            keys: normalized ? Object.keys(normalized) : null
          });
        }
      } catch (e: any) {
        console.warn('[fees] okx.proxy.error', { proxyUrl, message: e?.message, code: e?.code });
        continue;
      }
    }
    if (!payload) {
      // Fire-and-forget warm-up to prime OKX data without blocking this request
      try {
        const warmupUrl = `${selfBase}/api/okx/currencies?ccy=${encodeURIComponent(coin)}`;
        axios.get(warmupUrl, { timeout: 6000 }).catch(() => {});
      } catch {}
      throw new Error('OKX currencies fetch failed via proxy');
    }
    console.log('[fees] okx.proxy.used', { proxyUsed });

    if (payload?.code !== '0' || !Array.isArray(payload?.data) || payload.data.length === 0) {
      return res.status(502).json({ success: false, error: 'Invalid response from OKX currencies API' });
    }

    // OKX returns a flat array of chain entries; our proxy may return mixed shapes.
    // Build a synthetic chains array and prefer entries matching the requested coin.
    const raw = Array.isArray(payload.data) ? payload.data : [];
    const normEntry = (d: any) => ({
      ccy: String(d?.ccy ?? d?.currency ?? d?.symbol ?? '').toUpperCase(),
      chain: d?.chain ?? d?.chainName ?? d?.net ?? d?.network ?? '',
      wdFee: d?.wdFee ?? d?.withdrawalFee ?? d?.withdrawFee ?? d?.minFee ?? d?.fee,
      minFee: d?.minFee ?? d?.min_withdrawal_fee ?? d?.fee,
      fee: d?.fee,
      canWd: d?.canWd ?? d?.canWithdraw ?? d?.withdrawEnable ?? d?.can_withdraw
    });
    const entries = raw.map(normEntry);
    const chainEntries = entries.filter((e: any) => e.ccy === coin);
    const ccyData = { chains: chainEntries.length > 0 ? chainEntries : entries };

    const chain = pickOkxChain(ccyData, coin, network);
    console.log('[fees] pickOkxChain', { coin, network, picked: chain ? (chain.chain || chain.net) : null, wdFee: chain?.wdFee, minFee: chain?.minFee, fee: chain?.fee, canWd: chain?.canWd });
    // For Ethereum networks, avoid X Layer; for ethereum-mainnet prefer ERC20 if present
    const effChain = (() => {
      let chosen: any = chain;
      const nameStr = (obj: any) => (String(obj?.chain || '') + ' ' + String(obj?.net || obj?.network || '')).toLowerCase();
      if (chosen && network.includes('ethereum')) {
        const isXLayer = /x\s*layer/.test(nameStr(chosen));
        const wantsErc20 = network === 'ethereum-mainnet';
        const isErc20 = /erc20/.test(nameStr(chosen));
        if (isXLayer || (wantsErc20 && !isErc20)) {
          const ercCandidate = (ccyData.chains as any[]).find(c => /erc20/.test(nameStr(c)));
          if (ercCandidate) {
            console.log('[fees] ethereum.adjust', { from: chosen?.chain || chosen?.net, to: ercCandidate?.chain || ercCandidate?.net });
            chosen = ercCandidate;
          }
        }
      }
      return chosen;
    })();
    if (!chain) {
      const netEst = await networkEstimate(coin, network);
      if (netEst && netEst.feeNative > 0) {
        if (!noCache) setCache(cacheKey, netEst, 120_000);
        console.log('[fees] result', { coin, network, source: netEst.source, chain: null, feeNative: netEst.feeNative });
        return res.json({ success: true, data: netEst });
      }
      const fb = staticFallback(coin, network);
      const empty = { feeNative: fb, feeUnit: coin, source: fb > 0 ? 'fallback-static' : 'okx-none', ttl: 120, chain: (network === 'ethereum-mainnet') ? 'Ethereum(ERC20)' : null };
      // Keep fallback cache short to allow re-trying OKX soon
      if (!noCache) setCache(cacheKey, empty, 120_000);
      console.log('[fees] result', { coin, network, source: empty.source, chain: null, feeNative: empty.feeNative });
      return res.json({ success: true, data: empty });
    }

    // Prefer a non-zero withdrawal fee; fall back to minFee/fee if needed
    const feeStrs = [effChain?.wdFee, effChain?.minFee, effChain?.fee, effChain?.actualWdFee, effChain?.withdrawFee];
    let feeNative = 0;
    for (const v of feeStrs) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) { feeNative = n; break; }
    }
    if (feeNative === 0) {
      const n = Number(chain.wdFee ?? chain.minFee ?? chain.fee ?? '0');
      feeNative = Number.isFinite(n) ? n : 0;
    }
    if (feeNative <= 0) {
      const fb = staticFallback(coin, network);
      if (fb > 0) feeNative = fb;
    }
    const result = {
      feeNative,
      feeUnit: coin,
      source: 'okx',
      ttl: 600,
      chain: (network === 'ethereum-mainnet') ? 'Ethereum(ERC20)' : ((effChain && (effChain.chain || (effChain as any).net)) || undefined),
    };

    console.log('[fees] result', { coin, network, source: result.source, chain: result.chain, feeNative: result.feeNative });
    if (!noCache) setCache(cacheKey, result);
    return res.json({ success: true, data: result });
  } catch (_err) {
    // Log why we are falling back (timeout, network error, etc.)
    try {
      const e: any = _err;
      console.warn('[fees] okx.error', { message: e?.message, code: e?.code, name: e?.name });
    } catch {}
    // Graceful fallback
    const coin = String(req.query.coin || '').toUpperCase();
    const network = String(req.query.network || '').toLowerCase();
    const netEst = await networkEstimate(coin, network);
    if (netEst && netEst.feeNative > 0) {
      console.log('[fees] result', { coin, network, source: netEst.source, chain: null, feeNative: netEst.feeNative });
      return res.status(200).json({ success: true, data: netEst });
    }
    const fb = staticFallback(coin, network);
    console.log('[fees] result', { coin, network, source: fb > 0 ? 'fallback-static' : 'fallback', chain: null, feeNative: fb });
    return res.status(200).json({
      success: true,
      data: { feeNative: fb, feeUnit: coin, source: fb > 0 ? 'fallback-static' : 'fallback', ttl: 120, chain: (network === 'ethereum-mainnet') ? 'Ethereum(ERC20)' : null },
    });
  }
});

export default router;