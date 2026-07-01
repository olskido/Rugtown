import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTrendingSolanaTokens, type MarketToken } from '../services/dexscreener';

/*
  AlphaLoungePanel.tsx
  ──────────────────────
  Alpha Lounge's interior — a local market-narrative read on the same
  live DexScreener trending data the Meme Market/Notice Board use (same
  service, same cache; fully self-contained, no imports from either of
  those panel files). Everything here — mood, narratives, "danger"
  ranking, and the written summary — is computed with plain arithmetic
  and string templates over real numbers. No external AI API, no
  backend, no wallet, no trading. Read-only.
*/

const THIN_LIQUIDITY_USD = 20_000;
const SECTION_LIMIT = 5;

/* ─── Local "narrative" guesser ───
   Deliberately simple keyword matching over each token's name+symbol —
   a fun, fast, fully-local heuristic, not real NLP. The requirement
   calls these "guessed" narratives on purpose. */
const NARRATIVE_KEYWORDS: { label: string; icon: string; keywords: string[] }[] = [
  { label: 'Dog-themed',         icon: '🐕', keywords: ['dog', 'doge', 'shib', 'inu', 'puppy', 'bonk', 'woof'] },
  { label: 'Frog-themed',        icon: '🐸', keywords: ['pepe', 'frog', 'froggy', 'kek'] },
  { label: 'Cat-themed',         icon: '🐱', keywords: ['cat', 'kitty', 'meow', 'neko'] },
  { label: 'AI-themed',          icon: '🤖', keywords: ['ai', 'gpt', 'neural', 'agent', 'robot'] },
  { label: 'Political / Culture', icon: '🧢', keywords: ['trump', 'maga', 'elon', 'biden', 'politic'] },
  { label: 'Moon / Hype',        icon: '🚀', keywords: ['moon', 'rocket', 'gem', '100x', 'pump'] },
  { label: 'Animal Meme',        icon: '🐻', keywords: ['bull', 'bear', 'ape', 'monkey', 'chimp', 'whale'] },
];

function guessNarratives(tokens: MarketToken[]): { label: string; icon: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    const haystack = `${t.name} ${t.symbol}`.toLowerCase();
    for (const cat of NARRATIVE_KEYWORDS) {
      if (cat.keywords.some(kw => haystack.includes(kw))) {
        counts.set(cat.label, (counts.get(cat.label) ?? 0) + 1);
      }
    }
  }
  return NARRATIVE_KEYWORDS
    .map(cat => ({ label: cat.label, icon: cat.icon, count: counts.get(cat.label) ?? 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

type MarketMood = 'Bullish' | 'Mixed' | 'Risky';

interface MarketAnalysis {
  mood: MarketMood;
  gainers: number;
  losers: number;
  avgH24: number;
  thinCount: number;
  narratives: { label: string; icon: string; count: number }[];
  strongest5m: MarketToken[];
  strongest24h: MarketToken[];
  dangerous: MarketToken[];
  summary: string;
}

function analyzeMarket(tokens: MarketToken[]): MarketAnalysis | null {
  if (tokens.length === 0) return null;

  const h24Values = tokens.map(t => t.priceChange.h24).filter((v): v is number => v !== null);
  const gainers = h24Values.filter(v => v > 0).length;
  const losers = h24Values.filter(v => v < 0).length;
  const avgH24 = h24Values.length > 0 ? h24Values.reduce((a, b) => a + b, 0) / h24Values.length : 0;

  const thinTokens = tokens.filter(t => t.liquidityUsd !== null && t.liquidityUsd < THIN_LIQUIDITY_USD);
  const thinCount = thinTokens.length;
  const thinRatio = thinCount / tokens.length;

  let mood: MarketMood;
  if (avgH24 <= -8 || thinRatio >= 0.4) {
    mood = 'Risky';
  } else if (avgH24 >= 8 && gainers > losers * 1.3) {
    mood = 'Bullish';
  } else {
    mood = 'Mixed';
  }

  const narratives = guessNarratives(tokens);

  const strongest5m = [...tokens]
    .filter(t => t.priceChange.m5 !== null)
    .sort((a, b) => Math.abs(b.priceChange.m5 ?? 0) - Math.abs(a.priceChange.m5 ?? 0))
    .slice(0, SECTION_LIMIT);

  const strongest24h = [...tokens]
    .filter(t => t.priceChange.h24 !== null)
    .sort((a, b) => Math.abs(b.priceChange.h24 ?? 0) - Math.abs(a.priceChange.h24 ?? 0))
    .slice(0, SECTION_LIMIT);

  const dangerous = [...thinTokens]
    .sort((a, b) => Math.abs(b.priceChange.h24 ?? 0) - Math.abs(a.priceChange.h24 ?? 0))
    .slice(0, SECTION_LIMIT);

  const topMover = strongest24h[0] ?? null;
  const sentences: string[] = [];
  sentences.push(`Market mood across the trending Solana board looks ${mood.toLowerCase()} right now.`);
  sentences.push(
    `${gainers} of ${tokens.length} trending tokens are green and ${losers} are red, averaging ` +
    `${avgH24 >= 0 ? '+' : ''}${avgH24.toFixed(1)}% over 24h.`
  );
  if (narratives.length > 0) {
    sentences.push(`${narratives[0].icon} ${narratives[0].label} tokens are dominating the trending list right now.`);
  }
  if (topMover) {
    const pct = topMover.priceChange.h24 ?? 0;
    sentences.push(`$${topMover.symbol} is the loudest name on the board, ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% over 24h.`);
  }
  if (dangerous.length > 0) {
    sentences.push(
      `${dangerous.length} trending token${dangerous.length === 1 ? '' : 's'} ${dangerous.length === 1 ? 'is' : 'are'} ` +
      `combining thin liquidity with sharp moves — tread carefully.`
    );
  } else {
    sentences.push('Liquidity across the trending board looks reasonably healthy for now.');
  }

  return { mood, gainers, losers, avgH24, thinCount, narratives, strongest5m, strongest24h, dangerous, summary: sentences.join(' ') };
}

function formatCompactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPercent(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function pctClass(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return '';
  return pct > 0 ? 'alpha-positive' : 'alpha-negative';
}

function TokenMoverRow({ token, metric, metricClass }: { token: MarketToken; metric: string; metricClass?: string }) {
  return (
    <a className="alpha-row" href={token.url} target="_blank" rel="noopener noreferrer" title={`Open ${token.symbol} on DexScreener`}>
      <span className="alpha-row__symbol">${token.symbol}</span>
      <span className="alpha-row__name">{token.name}</span>
      <span className={`alpha-row__metric ${metricClass ?? ''}`}>{metric}</span>
    </a>
  );
}

export function AlphaLoungePanel() {
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async (force: boolean) => {
      if (cancelled) return;
      if (force) setRefreshing(tokens.length > 0);
      if (tokens.length === 0) setLoading(true);
      setError(null);
      try {
        const data = await fetchTrendingSolanaTokens({ force });
        if (cancelled) return;
        setTokens(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load live market data.');
      } finally {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      }
    };
    run(retryTick > 0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick]);

  const handleRefresh = useCallback(() => setRetryTick(t => t + 1), []);

  const analysis = useMemo(() => analyzeMarket(tokens), [tokens]);

  const showFullError = error && tokens.length === 0 && !loading;
  const showInitialLoading = loading && tokens.length === 0;

  return (
    <div className="alpha-lounge">
      <div className="alpha-toolbar">
        <span className="alpha-toolbar__tag">DATA: DEXSCREENER · SOLANA · READ-ONLY</span>
        <button className="alpha-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? '⏳ Refreshing…' : '🔄 Refresh'}
        </button>
      </div>

      {showInitialLoading && (
        <div className="alpha-state alpha-state--loading">
          <span className="alpha-spinner" aria-hidden />
          <p>Reading the trending board…</p>
        </div>
      )}

      {showFullError && (
        <div className="alpha-state alpha-state--error">
          <p>⚠️ {error}</p>
          <button className="alpha-refresh-btn" onClick={handleRefresh}>Retry</button>
        </div>
      )}

      {!showInitialLoading && !showFullError && analysis && (
        <div className="alpha-content">
          {error && tokens.length > 0 && (
            <div className="alpha-stale-banner">⚠️ Couldn't refresh — showing last known analysis.</div>
          )}

          <div className="alpha-mood">
            <span className={`alpha-mood__badge alpha-mood__badge--${analysis.mood.toLowerCase()}`}>
              {analysis.mood === 'Bullish' ? '📈' : analysis.mood === 'Risky' ? '⚠️' : '🌗'} {analysis.mood}
            </span>
            <span className="alpha-mood__sub">
              {analysis.gainers} green · {analysis.losers} red · avg 24h {formatPercent(analysis.avgH24)}
            </span>
          </div>

          <div className="alpha-summary">
            <span className="alpha-summary__label">🗒️ Lounge Read — local summary, no external AI</span>
            <p className="alpha-summary__text">{analysis.summary}</p>
          </div>

          {analysis.narratives.length > 0 && (
            <section className="alpha-section">
              <div className="alpha-section__header"><span aria-hidden>🧠</span><span>Top Narratives (guessed)</span></div>
              <div className="alpha-narrative-tags">
                {analysis.narratives.map(n => (
                  <span key={n.label} className="alpha-narrative-tag">
                    {n.icon} {n.label} <span className="alpha-narrative-tag__count">×{n.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="alpha-section">
            <div className="alpha-section__header"><span aria-hidden>⚡</span><span>Strongest 5m Movers</span></div>
            {analysis.strongest5m.length === 0 ? (
              <p className="alpha-section__empty">No 5m data right now.</p>
            ) : (
              <div className="alpha-section__rows">
                {analysis.strongest5m.map(t => (
                  <TokenMoverRow key={t.tokenAddress} token={t} metric={formatPercent(t.priceChange.m5)} metricClass={pctClass(t.priceChange.m5)} />
                ))}
              </div>
            )}
          </section>

          <section className="alpha-section">
            <div className="alpha-section__header"><span aria-hidden>🌐</span><span>Strongest 24h Movers</span></div>
            {analysis.strongest24h.length === 0 ? (
              <p className="alpha-section__empty">No 24h data right now.</p>
            ) : (
              <div className="alpha-section__rows">
                {analysis.strongest24h.map(t => (
                  <TokenMoverRow key={t.tokenAddress} token={t} metric={formatPercent(t.priceChange.h24)} metricClass={pctClass(t.priceChange.h24)} />
                ))}
              </div>
            )}
          </section>

          <section className="alpha-section">
            <div className="alpha-section__header"><span aria-hidden>💀</span><span>Most Dangerous (Thin Liquidity + Big Moves)</span></div>
            {analysis.dangerous.length === 0 ? (
              <p className="alpha-section__empty">Nothing flagged as dangerous right now.</p>
            ) : (
              <div className="alpha-section__rows">
                {analysis.dangerous.map(t => (
                  <TokenMoverRow
                    key={t.tokenAddress}
                    token={t}
                    metric={`${formatCompactUsd(t.liquidityUsd)} liq`}
                    metricClass="alpha-negative"
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <p className="alpha-disclaimer">
        Live market data via DexScreener, analyzed locally · No external AI · Read-only — no wallet, no trading.
      </p>
    </div>
  );
}
