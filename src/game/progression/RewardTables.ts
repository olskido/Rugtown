/**
 * RewardTables.ts — centralized XP/REP amounts for discovery & milestones.
 */

export const XP_REWARDS = {
  missionComplete: 25,
  landmarkFirstVisit: 10,
  districtFirstVisit: 15,
  interiorFirstVisit: 12,
  cityEventJoin: 15,
  playerInteractUnique: 8,
  waveOnce: 5,
  fountainClaimOnce: 8,
  tutorialLevelComplete: 10,
} as const;

export const REP_REWARDS = {
  landmarkFirstVisit: 2,
  districtFirstVisit: 4,
  interiorFirstVisit: 3,
  cityEventJoin: 0, // event systems already award their own REP
  playerInteractUnique: 1,
} as const;

export function rewardKey(parts: string[]): string {
  return parts.join(':');
}
