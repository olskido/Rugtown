/**
 * UnlockCatalog.ts — feature unlocks (Phase 10F).
 * Does not lock already-open core gameplay.
 */

export interface UnlockDef {
  id: string;
  displayName: string;
  description: string;
  /** Minimum account level, if any. */
  minLevel?: number;
  /** Achievement that grants this unlock. */
  achievementId?: string;
  /** Currently informational — core gameplay stays open. */
  affectsGameplay: boolean;
}

export const UNLOCK_CATALOG: UnlockDef[] = [
  {
    id: 'unlock_title_slot',
    displayName: 'Title Slot',
    description: 'Equip a cosmetic title on your profile.',
    minLevel: 1,
    affectsGameplay: false,
  },
  {
    id: 'unlock_expanded_stats',
    displayName: 'Expanded Stats',
    description: 'View detailed exploration and social statistics.',
    minLevel: 3,
    affectsGameplay: false,
  },
  {
    id: 'unlock_profile_showcase',
    displayName: 'Profile Showcase',
    description: 'Show achievements and titles on your full profile.',
    minLevel: 5,
    affectsGameplay: false,
  },
];

export function unlocksForLevel(level: number): string[] {
  return UNLOCK_CATALOG
    .filter((u) => (u.minLevel ?? 1) <= level)
    .map((u) => u.id);
}
