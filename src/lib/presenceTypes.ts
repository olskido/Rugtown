import type { CharacterAppearanceV1 } from '../game/characters/appearance/CharacterAppearanceDefaults';

/** Presence appearance is compact V1 bitmap appearance (or encoded string). */
export type PresenceAppearance = CharacterAppearanceV1 | string;

export interface PresencePayload {
  id: string;
  username: string;
  x: number;
  y: number;
  appearance: PresenceAppearance;
  appearanceRev?: number;
  rep: number;
  holderTier: string;
  level?: number;
  rankLabel?: string;
  equippedTitle?: string;
}
