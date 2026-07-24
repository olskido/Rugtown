/** Re-export appearance types under CharacterAppearance module name. */
export type { CharacterLoadoutV2 as CharacterAppearanceV2 } from './CharacterAppearanceModel';
export {
  SAFE_DEFAULT_LOADOUT,
  isSafeCosmeticId,
  isCharacterLoadoutV2,
  sanitizeLoadout,
} from './CharacterAppearanceModel';
