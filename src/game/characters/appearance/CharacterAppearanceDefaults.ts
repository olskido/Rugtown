/**
 * Versioned bitmap character appearance — registry IDs only, never URLs.
 */

export const CHARACTER_APPEARANCE_VERSION = 1 as const;

export interface CharacterAppearanceV1 {
  version: 1;
  baseId: string;
  hairId: string | null;
  facialHairId: string | null;
  headwearId: string | null;
  /** Phase 12 — separate clothing layer over the (now bare-skin) base
   *  body. Null renders the base body's own minimal default clothing
   *  (or nothing, once bare-skin bases are installed) — see
   *  BitmapCharacterLayout.ts's 'outfit' slot. Additive: old saved
   *  appearances simply lack this key and normalize it to null. */
  outfitId: string | null;
  pantsId: string | null;
  shoesId: string | null;
  accessoryIds: string[];
}

export type CharacterAppearance = CharacterAppearanceV1;

export const MAX_ACCESSORIES = 3;

import { getCanonicalPlayerAppearance } from './CanonicalPlayerAppearance';

export function getDefaultCharacterAppearance(): CharacterAppearanceV1 {
  return getCanonicalPlayerAppearance();
}
