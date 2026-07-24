/**
 * types.ts — Phase 10I achievement / title / season-pass client types.
 * Server is authoritative; these types mirror RPC responses.
 */

export type AchievementCategory =
  | 'exploration' | 'missions' | 'progression' | 'social' | 'economy'
  | 'collectibles' | 'events' | 'seasons' | 'consistency' | 'hidden' | 'special';

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface AchievementCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  isSecret: boolean;
  titleUnlockId: string | null;
  sortOrder: number;
  target: number;
  rewardXp: number;
  rewardRep: number;
}

export interface AchievementProgressView {
  achievementId: string;
  currentValue: number;
  targetValue: number;
  status: 'locked' | 'tracking' | 'completed' | 'claimed' | 'expired' | 'revoked' | 'under_review';
  completedAt: string | null;
}

export interface AchievementUnlockView {
  id: string;
  achievementId: string;
  unlockedAt: string;
  verificationStatus: string;
}

export interface TitleView {
  id: string;
  titleId: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  isEquipped: boolean;
  unlockedAt: string;
  sourceType: string;
  revokedAt: string | null;
  isHidden: boolean;
}

export interface SeasonPassView {
  id: string;
  seasonId: string;
  name: string;
  description: string;
  status: string;
  startsAt: string;
  endsAt: string;
  maxTier: number;
  pointsPerTier: number;
  premiumEnabled: boolean;
  isTest: boolean;
}

export interface SeasonPassTierView {
  id: string;
  tierNumber: number;
  pointsRequired: number;
  name: string | null;
  freeReward: { id: string; type: string; quantity: number; claimMode: string } | null;
  premiumReward: { id: string; type: string; quantity: number; claimMode: string } | null;
}

export interface PlayerSeasonPassView {
  seasonPassPoints: number;
  currentTier: number;
  premiumEntitled: boolean;
  joinedAt: string;
}

export const POINT_RELATIONSHIP_DOC = {
  xp: 'Lifetime experience toward level',
  rep: 'reputation score',
  rugPoints: 'in-game campaign currency; not SOL',
  seasonPoints: 'season leaderboard score',
  seasonPassPoints: 'separate track for season-pass tiers (not identical to season points)',
} as const;
