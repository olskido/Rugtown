/**
 * RankLadder.ts — RugTown progression rank (not holder tier).
 * Derived from level + REP + achievement points. Never from wallet.
 */

import type { RankTierId } from './types';

export interface RankTierDef {
  id: RankTierId;
  displayName: string;
  /** Minimum composite score to hold this tier. */
  minScore: number;
  order: number;
}

export const RANK_LADDER: RankTierDef[] = [
  { id: 'drifter', displayName: 'Drifter', minScore: 0, order: 0 },
  { id: 'scout', displayName: 'Scout', minScore: 40, order: 1 },
  { id: 'trader', displayName: 'Trader', minScore: 100, order: 2 },
  { id: 'broker', displayName: 'Broker', minScore: 180, order: 3 },
  { id: 'market_maker', displayName: 'Market Maker', minScore: 280, order: 4 },
  { id: 'whale_hunter', displayName: 'Whale Hunter', minScore: 400, order: 5 },
  { id: 'rugtown_elite', displayName: 'RugTown Elite', minScore: 550, order: 6 },
  { id: 'town_legend', displayName: 'Town Legend', minScore: 750, order: 7 },
];

/** Composite score: level*8 + sqrt(rep)*2 + achievementPoints*12 */
export function computeRankScore(opts: {
  level: number;
  rep: number;
  achievementPoints: number;
  seasonPoints?: number;
}): number {
  const levelPart = Math.max(1, opts.level) * 8;
  const repPart = Math.sqrt(Math.max(0, opts.rep)) * 2;
  const achPart = Math.max(0, opts.achievementPoints) * 12;
  const seasonPart = Math.max(0, opts.seasonPoints ?? 0) * 0.15;
  return Math.floor(levelPart + repPart + achPart + seasonPart);
}

export function rankFromScore(score: number): RankTierDef {
  let best = RANK_LADDER[0];
  for (const tier of RANK_LADDER) {
    if (score >= tier.minScore) best = tier;
  }
  return best;
}

export function deriveRankTier(opts: {
  level: number;
  rep: number;
  achievementPoints: number;
  seasonPoints?: number;
}): RankTierId {
  return rankFromScore(computeRankScore(opts)).id;
}

export function rankDisplayName(id: RankTierId): string {
  return RANK_LADDER.find((r) => r.id === id)?.displayName ?? 'Drifter';
}
