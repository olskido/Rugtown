export type { Direction } from './animation/CharacterDirection';
export { DIRECTIONS, nearestCardinal } from './animation/CharacterDirection';
export type { CharacterAnimState } from './CharacterStates';
export { CHARACTER_ANIM_STATES } from './CharacterStates';
export { CharacterAnimationController } from './CharacterAnimationController';
export type { CharacterAppearanceV1 } from './appearance/CharacterAppearanceDefaults';
export {
  getDefaultCharacterAppearance,
  MAX_ACCESSORIES,
} from './appearance/CharacterAppearanceDefaults';
export {
  normalizeCharacterAppearance,
  validateCharacterAppearance,
  encodeCharacterAppearance,
  decodeCharacterAppearance,
  migrateCharacterAppearance,
} from './appearance/CharacterAppearanceCodec';
export { characterAppearanceService } from './appearance/CharacterAppearanceService';
export {
  assetExists,
  isCreatorCosmeticAllowed,
  getAssetById,
  listCreatorAssets,
  listNpcBodies,
  hydrateCharacterRegistryFromScene,
  loadCharacterRuntimeManifest,
} from './assets/CharacterAssetRegistry';
export {
  queueCharacterBitmapLoads,
  queueWorldCharacterLoads,
  queueCreatorCosmeticLoads,
  preloadCharacterBitmaps,
  characterBitmapsReady,
} from './assets/CharacterAssetLoader';
export { BitmapCharacter, npcAppearanceFromId } from './render/BitmapCharacter';
export {
  PLAYER_VISUAL_SCALE,
  REMOTE_PLAYER_VISUAL_SCALE,
  NPC_VISUAL_SCALE,
  TARGET_DISPLAY_HEIGHT,
} from './render/CharacterVisualScale';
