/**
 * SeasonFoundation.ts — minimum season-ready fields (Phase 10F/10G).
 * Active seasons come from public.seasons when status='active'.
 * Client catalog stays empty so UI stays hidden until server configures one.
 */

import type { SeasonProgress } from './types';

export interface SeasonDefinition {
  seasonId: string;
  displayName: string;
  seasonStart: string;
  seasonEnd: string;
  active: boolean;
}

/** Client-side catalog stays empty — activate seasons in Supabase SQL. */
export const SEASON_CATALOG: SeasonDefinition[] = [];

export function getActiveSeason(): SeasonDefinition | null {
  const now = Date.now();
  return (
    SEASON_CATALOG.find((s) => {
      if (!s.active) return false;
      const start = Date.parse(s.seasonStart);
      const end = Date.parse(s.seasonEnd);
      return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
    }) ?? null
  );
}

export function emptySeasonProgress(): SeasonProgress {
  const active = getActiveSeason();
  if (!active) {
    return {
      seasonId: null,
      seasonPoints: 0,
      seasonRank: null,
      seasonStart: null,
      seasonEnd: null,
    };
  }
  return {
    seasonId: active.seasonId,
    seasonPoints: 0,
    seasonRank: null,
    seasonStart: active.seasonStart,
    seasonEnd: active.seasonEnd,
  };
}

export function shouldShowSeasonUi(season: SeasonProgress): boolean {
  return !!season.seasonId;
}
