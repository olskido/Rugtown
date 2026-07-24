/**
 * Progression types — Phase 10F canonical player identity model.
 * REP remains separate from XP / level / rank / titles.
 */

export type RankTierId =
  | 'drifter'
  | 'scout'
  | 'trader'
  | 'broker'
  | 'market_maker'
  | 'whale_hunter'
  | 'rugtown_elite'
  | 'town_legend';

export type TitleRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type TitleCategory =
  | 'exploration'
  | 'missions'
  | 'social'
  | 'events'
  | 'progression'
  | 'special';

export type AchievementCategory =
  | 'exploration'
  | 'missions'
  | 'social'
  | 'events'
  | 'progression'
  | 'collection';

export interface AchievementProgress {
  current: number;
  completed: boolean;
  completedAt?: string;
}

export interface PlayerStatistics {
  missionsCompleted: number;
  uniqueLandmarksVisited: number;
  districtsVisited: number;
  interiorsEntered: number;
  cityEventsJoined: number;
  uniquePlayersInteractedWith: number;
  totalRepEarned: number;
  lifetimeXp: number;
  playTimeSeconds: number;
  distanceTravelled: number;
  currentLoginStreak: number;
  longestLoginStreak: number;
  accountCreatedAt: string;
  lastActiveAt: string;
}

export interface SeasonProgress {
  seasonId: string | null;
  seasonPoints: number;
  seasonRank: number | null;
  seasonStart: string | null;
  seasonEnd: string | null;
}

export interface PlayerProgression {
  schemaVersion: number;
  playerId: string;
  isGuest: boolean;
  level: number;
  currentXp: number;
  lifetimeXp: number;
  rep: number;
  rankTier: RankTierId;
  season: SeasonProgress;
  equippedTitleId: string | null;
  unlockedTitleIds: string[];
  achievementProgress: Record<string, AchievementProgress>;
  unlockedFeatureIds: string[];
  statistics: PlayerStatistics;
  /** Claimed reward / discovery keys — never re-award. */
  claimedRewardKeys: string[];
  discoveredDistrictIds: string[];
  discoveredLandmarkIds: string[];
  discoveredInteriorIds: string[];
  uniquePlayerInteractIds: string[];
  updatedAt: string;
}

export interface XpAwardResult {
  awarded: boolean;
  amount: number;
  reason: string;
  key: string;
  levelsGained: number;
  newLevel: number;
  previousLevel: number;
}

export interface RepAwardResult {
  awarded: boolean;
  amount: number;
  reason: string;
  key: string;
  newRep: number;
}

export interface ProgressionSnapshot {
  level: number;
  currentXp: number;
  xpToNext: number;
  progressPercent: number;
  lifetimeXp: number;
  rep: number;
  rankTier: RankTierId;
  rankLabel: string;
  equippedTitleId: string | null;
  equippedTitleName: string | null;
  achievementCompleted: number;
  achievementTotal: number;
  discoveryLandmarks: number;
  discoveryDistricts: number;
  seasonPoints: number;
  latestEvent: string | null;
  latestRewardKey: string | null;
}

export const PROGRESSION_SCHEMA_VERSION = 1;
export const MAX_LEVEL = 50;
