/**
 * Canonical locked player appearance — all users share one look.
 * Character creator cosmetics are disabled for production polish.
 */
import type { CharacterAppearanceV1 } from './CharacterAppearanceDefaults';

export const CANONICAL_PLAYER_APPEARANCE: CharacterAppearanceV1 = {
  version: 1,
  baseId: 'base_skin_light',
  hairId: 'hair_crew_cut_01',
  facialHairId: null,
  headwearId: null,
  outfitId: 'outfit_market_tunic',
  pantsId: 'pants_dark_jeans_01',
  shoesId: null,
  accessoryIds: [],
};

export function getCanonicalPlayerAppearance(): CharacterAppearanceV1 {
  return {
    ...CANONICAL_PLAYER_APPEARANCE,
    accessoryIds: [...CANONICAL_PLAYER_APPEARANCE.accessoryIds],
  };
}
