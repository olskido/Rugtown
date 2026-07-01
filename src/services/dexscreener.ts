/*
  dexscreener.ts
  ──────────────
  Read-only client for DexScreener's public API — powers the Meme Market
  trading terminal panel with LIVE Solana data. No API key, no backend:
  both endpoints used here serve `access-control-allow-origin: *`, so a
  plain browser fetch works directly from the deployed site.

  DexScreener doesn't publish an official "trending" endpoint, so this
  mirrors the same technique their own site effectively uses: the
  token-boosts feed reflects what's currently being promoted/trending,
  then a single batched /tokens/ call pulls full market data (price,
  volume, liquidity, FDV, etc.) for those addresses. Up to 30 addresses
  per /tokens/ call is the documented limit, which is comfortably more
  than the Top 20 this panel displays.

  No wallet, no trading, no swaps — every value here is display-only.
*/

const DEX_BOOSTS_URL = 'https://api.dexscreener.com/token-boosts/top/v1';
const DEX_TOKENS_URL = 'https://api.dexscreener.com/latest/dex/tokens/';
const SOLANA_CHAIN_ID = 'solana';
const MAX_CANDIDATES = 30; // DexScreener's per-request address limit
const TOP_N = 20;

/** Briefly cache results so re-opening the panel, or React re-rendering
 *  mid-refresh, never fires a duplicate network round-trip. */
const CACHE_TTL_MS = 12000; // a hair under the 15s auto-refresh interval

/* ─── DexScreener raw response shapes (only the fields we use) ─── */
interface DexTokenBoost {
  url: string;
  chainId: string;
  tokenAddress: string;
}

interface DexPairToken {
  address: string;
  name: string;
  symbol: string;
}

interface DexPairTxnWindow {
  buys: number;
  sells: number;
}

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexPairToken;
  quoteToken: DexPairToken;
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  txns?: { h24?: DexPairTxnWindow };
  labels?: string[];
  info?: { imageUrl?: string };
}

interface DexTokensResponse {
  pairs: DexPair[] | null;
}

/* ─── Normalized shape the UI actually consumes ─── */
export interface MarketToken {
  tokenAddress: string;
  pairAddress: string;
  dexId: string;
  url: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  priceUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h24: number | null };
  volume24h: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  txns24h: { buys: number; sells: number } | null;
  labels: string[];
  /** 1 = most boosted/trending on DexScreener right now. */
  trendingRank: number;
}

let cache: { data: MarketToken[]; timestamp: number } | null = null;
let inFlight: Promise<MarketToken[]> | null = null;

function normalizePair(p: DexPair, trendingRank: number): MarketToken {
  return {
    tokenAddress: p.baseToken.address,
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    url: p.url,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    logoUrl: p.info?.imageUrl ?? null,
    priceUsd: p.priceUsd !== undefined ? parseFloat(p.priceUsd) : null,
    priceChange: {
      m5: p.priceChange?.m5 ?? null,
      h1: p.priceChange?.h1 ?? null,
      h24: p.priceChange?.h24 ?? null,
    },
    volume24h: p.volume?.h24 ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    fdv: p.fdv ?? null,
    marketCap: p.marketCap ?? null,
    pairCreatedAt: p.pairCreatedAt ?? null,
    txns24h: p.txns?.h24 ? { buys: p.txns.h24.buys, sells: p.txns.h24.sells } : null,
    labels: p.labels ?? [],
    trendingRank,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DexScreener request failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function fetchFresh(): Promise<MarketToken[]> {
  const boosts = await fetchJson<DexTokenBoost[]>(DEX_BOOSTS_URL);
  const solanaBoosts = boosts.filter(b => b.chainId === SOLANA_CHAIN_ID);

  // De-dupe while preserving DexScreener's own trending order.
  const seen = new Set<string>();
  const orderedAddresses: string[] = [];
  for (const b of solanaBoosts) {
    if (seen.has(b.tokenAddress)) continue;
    seen.add(b.tokenAddress);
    orderedAddresses.push(b.tokenAddress);
  }

  if (orderedAddresses.length === 0) {
    throw new Error('No trending Solana tokens are available from DexScreener right now.');
  }

  const candidates = orderedAddresses.slice(0, MAX_CANDIDATES);
  const { pairs } = await fetchJson<DexTokensResponse>(`${DEX_TOKENS_URL}${candidates.join(',')}`);
  const solanaPairs = (pairs ?? []).filter(p => p.chainId === SOLANA_CHAIN_ID);

  // A token can have several pools (different DEXs/quote tokens) — keep
  // only the deepest-liquidity pair per token as its representative row.
  const bestPairByToken = new Map<string, DexPair>();
  for (const p of solanaPairs) {
    const addr = p.baseToken.address;
    const existing = bestPairByToken.get(addr);
    const liq = p.liquidity?.usd ?? 0;
    if (!existing || liq > (existing.liquidity?.usd ?? 0)) {
      bestPairByToken.set(addr, p);
    }
  }

  const tokens = candidates
    .map((addr, i) => {
      const pair = bestPairByToken.get(addr);
      return pair ? normalizePair(pair, i + 1) : null;
    })
    .filter((t): t is MarketToken => t !== null)
    .slice(0, TOP_N);

  if (tokens.length === 0) {
    throw new Error('DexScreener returned no tradeable Solana pairs for the current trending list.');
  }

  return tokens;
}

/**
 * Fetches the Top 20 trending Solana tokens. Cached briefly (req. 11) —
 * pass `force: true` to bypass the cache (used by the panel's manual
 * Retry action and its own periodic refresh timer never needs to, since
 * the cache TTL is already shorter than the refresh interval).
 */
export function fetchTrendingSolanaTokens(opts?: { force?: boolean }): Promise<MarketToken[]> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cache.data);
  }
  // Coalesce concurrent callers (e.g. a fast refetch while one is still
  // in flight) into a single network round-trip.
  if (inFlight) return inFlight;

  inFlight = fetchFresh()
    .then(data => {
      cache = { data, timestamp: Date.now() };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
