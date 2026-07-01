import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTrendingSolanaTokens, type MarketToken } from '../services/dexscreener';

/*
  MarketPanel.tsx
  ────────────────
  Meme Market's interior — a live DexScreener trading-floor terminal.
  Read-only: no wallet, no trading, no swaps. Every number on screen
  comes straight from DexScreener's public API (src/services/dexscreener.ts);
  nothing here is mocked.
*/

const REFRESH_INTERVAL_MS = 15000;

type SortKey = 'trending' | 'volume' | 'liquidity' | 'm5' | 'h1' | 'h24';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'volume', label: 'Volume' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'm5', label: '5m' },
  { key: 'h1', label: '1h' },
  { key: 'h24', label: '24h' },
];

function formatCompactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return '—';
  if (price === 0) return '$0';
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  // Memecoin-scale prices — keep enough significant digits to be readable
  // instead of rounding to "$0.00".
  return `$${price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function formatPercent(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatTimeAgo(sinceMs: number | null): string {
  if (!sinceMs) return '—';
  const diffMs = Date.now() - sinceMs;
  if (diffMs < 0) return '—';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

function pctClass(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return '';
  return pct > 0 ? 'market-positive' : 'market-negative';
}

/** Logo with a graceful fallback (token initial in a gold circle) if the
 *  image is missing or fails to load — never a broken-image icon. */
function TokenLogo({ token }: { token: MarketToken }) {
  const [failed, setFailed] = useState(false);
  if (!token.logoUrl || failed) {
    return (
      <span className="market-logo market-logo--fallback" aria-hidden>
        {token.symbol.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className="market-logo"
      src={token.logoUrl}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
    />
  );
}

export function MarketPanel() {
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('trending');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let firstRunDone = false;

    const run = async (force: boolean) => {
      if (cancelled) return;
      if (!firstRunDone) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const data = await fetchTrendingSolanaTokens({ force });
        if (cancelled) return;
        setTokens(data);
        setError(null);
        setLastUpdated(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load live market data.');
      } finally {
        if (cancelled) return;
        firstRunDone = true;
        setLoading(false);
        setRefreshing(false);
      }
    };

    run(true);
    const interval = setInterval(() => run(false), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [retryTick]);

  const handleRetry = useCallback(() => setRetryTick(t => t + 1), []);

  const handleSortClick = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(key === 'trending' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const sortedTokens = useMemo(() => {
    const valueFor = (t: MarketToken): number => {
      switch (sortKey) {
        case 'trending':  return t.trendingRank;
        case 'volume':    return t.volume24h ?? -Infinity;
        case 'liquidity': return t.liquidityUsd ?? -Infinity;
        case 'm5':        return t.priceChange.m5 ?? -Infinity;
        case 'h1':         return t.priceChange.h1 ?? -Infinity;
        case 'h24':        return t.priceChange.h24 ?? -Infinity;
        default:           return 0;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...tokens].sort((a, b) => (valueFor(a) - valueFor(b)) * dir);
  }, [tokens, sortKey, sortDir]);

  const selectedToken = useMemo(
    () => tokens.find(t => t.tokenAddress === selectedAddress) ?? null,
    [tokens, selectedAddress]
  );

  const handleRowClick = useCallback((token: MarketToken) => {
    setSelectedAddress(prev => (prev === token.tokenAddress ? null : token.tokenAddress));
  }, []);

  const handleCopyAddress = useCallback((address: string) => {
    navigator.clipboard?.writeText(address).catch(() => {});
  }, []);

  const showFullError = error && tokens.length === 0 && !loading;
  const showInitialLoading = loading && tokens.length === 0;

  return (
    <div className="market-panel">
      <div className="market-toolbar">
        <div className="market-toolbar__tag">DATA: DEXSCREENER · SOLANA · READ-ONLY</div>
        <div className="market-toolbar__status">
          {refreshing && <span className="market-refresh-dot" aria-hidden />}
          {refreshing ? 'Refreshing…' : lastUpdated ? `Updated ${formatTimeAgo(lastUpdated)}` : ''}
        </div>
      </div>

      <div className="market-sort-row" role="group" aria-label="Sort trending tokens">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`market-sort-btn ${sortKey === opt.key ? 'market-sort-btn--active' : ''}`}
            onClick={() => handleSortClick(opt.key)}
          >
            {opt.label}
            {sortKey === opt.key && <span className="market-sort-btn__arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </button>
        ))}
      </div>

      {showInitialLoading && (
        <div className="market-state market-state--loading">
          <span className="market-spinner" aria-hidden />
          <p>Loading live trending tokens from DexScreener…</p>
        </div>
      )}

      {showFullError && (
        <div className="market-state market-state--error">
          <p>⚠️ {error}</p>
          <button className="market-retry-btn" onClick={handleRetry}>Retry</button>
        </div>
      )}

      {!showInitialLoading && !showFullError && (
        <div className="market-content">
          <div className="market-table-wrap">
            {error && tokens.length > 0 && (
              <div className="market-stale-banner">⚠️ Couldn't refresh — showing last known data.</div>
            )}
            <table className="market-table">
              <thead>
                <tr>
                  <th className="market-table__rank-col">#</th>
                  <th>Token</th>
                  <th>Price</th>
                  <th>5m</th>
                  <th>1h</th>
                  <th>24h</th>
                  <th>Volume</th>
                  <th>Liquidity</th>
                  <th>FDV</th>
                  <th>Mkt Cap</th>
                </tr>
              </thead>
              <tbody>
                {sortedTokens.map(token => (
                  <tr
                    key={token.tokenAddress}
                    className={`market-row ${token.trendingRank <= 3 ? 'market-row--trending' : ''} ${
                      selectedToken?.tokenAddress === token.tokenAddress ? 'market-row--selected' : ''
                    }`}
                    onClick={() => handleRowClick(token)}
                  >
                    <td className="market-table__rank-col">{token.trendingRank}</td>
                    <td>
                      <div className="market-token-cell">
                        <TokenLogo token={token} />
                        <div className="market-token-cell__text">
                          <span className="market-token-cell__symbol">{token.symbol}</span>
                          <span className="market-token-cell__name">{token.name}</span>
                        </div>
                      </div>
                    </td>
                    <td>{formatPrice(token.priceUsd)}</td>
                    <td className={pctClass(token.priceChange.m5)}>{formatPercent(token.priceChange.m5)}</td>
                    <td className={pctClass(token.priceChange.h1)}>{formatPercent(token.priceChange.h1)}</td>
                    <td className={pctClass(token.priceChange.h24)}>{formatPercent(token.priceChange.h24)}</td>
                    <td>{formatCompactUsd(token.volume24h)}</td>
                    <td>{formatCompactUsd(token.liquidityUsd)}</td>
                    <td>{formatCompactUsd(token.fdv)}</td>
                    <td>{formatCompactUsd(token.marketCap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedToken && (
            <div className="market-detail-panel">
              <div className="market-detail-panel__header">
                <TokenLogo token={selectedToken} />
                <div>
                  <div className="market-detail-panel__symbol">{selectedToken.symbol}</div>
                  <div className="market-detail-panel__name">{selectedToken.name}</div>
                </div>
                <button
                  className="market-detail-panel__close"
                  onClick={() => setSelectedAddress(null)}
                  aria-label="Close token details"
                >✕</button>
              </div>

              {selectedToken.labels.length > 0 && (
                <div className="market-detail-labels">
                  {selectedToken.labels.map(label => (
                    <span key={label} className="market-detail-label-tag">{label}</span>
                  ))}
                </div>
              )}

              <div className="market-detail-chart">
                <iframe
                  title={`${selectedToken.symbol} chart`}
                  src={`https://dexscreener.com/solana/${selectedToken.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
                  loading="lazy"
                />
              </div>

              <div className="market-detail-row">
                <span className="market-detail-row__label">Contract</span>
                <span className="market-detail-row__value market-detail-row__value--mono">
                  {truncateAddress(selectedToken.tokenAddress)}
                </span>
                <button
                  className="market-copy-btn"
                  onClick={() => handleCopyAddress(selectedToken.tokenAddress)}
                  aria-label="Copy contract address"
                  title="Copy contract address"
                >⧉</button>
              </div>

              <div className="market-detail-row">
                <span className="market-detail-row__label">Pair Age</span>
                <span className="market-detail-row__value">{formatTimeAgo(selectedToken.pairCreatedAt)}</span>
              </div>

              <div className="market-detail-row">
                <span className="market-detail-row__label">Buy / Sell (24h)</span>
                <span className="market-detail-row__value">
                  {selectedToken.txns24h
                    ? `${selectedToken.txns24h.buys} / ${selectedToken.txns24h.sells}`
                    : '—'}
                </span>
              </div>

              {selectedToken.txns24h && (selectedToken.txns24h.buys + selectedToken.txns24h.sells) > 0 && (
                <div className="market-buy-sell-bar">
                  <div
                    className="market-buy-sell-bar__buys"
                    style={{
                      width: `${(selectedToken.txns24h.buys / (selectedToken.txns24h.buys + selectedToken.txns24h.sells)) * 100}%`,
                    }}
                  />
                </div>
              )}

              <a
                className="market-dexscreener-link"
                href={selectedToken.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on DexScreener ↗
              </a>
            </div>
          )}
        </div>
      )}

      <p className="market-disclaimer">
        Live market data via DexScreener · Read-only — no wallet, no trading, no swaps.
      </p>
    </div>
  );
}
