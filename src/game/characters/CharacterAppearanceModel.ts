/**
 * Strict character loadout model — Phase 10L.
 * Values must reference approved manifest IDs (never arbitrary URLs).
 */

export interface CharacterLoadoutV2 {
  version: 1;
  baseModelId: string;
  skinToneId: string;
  hairStyleId: string;
  hairColorId: string;
  outfitId: string;
  shoeId: string;
  headwearId: string;
  faceAccessoryId: string;
  backAccessoryId: string;
  heldItemId: string;
  auraId: string;
  emoteSetId: string;
  nameplateStyleId: string;
}

export const SAFE_DEFAULT_LOADOUT: CharacterLoadoutV2 = {
  version: 1,
  baseModelId: 'base_default',
  skinToneId: 'default',
  hairStyleId: 'hair_short',
  hairColorId: 'default',
  outfitId: 'outfit_starter_dark',
  shoeId: 'default',
  headwearId: 'none',
  faceAccessoryId: 'none',
  backAccessoryId: 'none',
  heldItemId: 'none',
  auraId: 'none',
  emoteSetId: 'default',
  nameplateStyleId: 'default',
};

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function isSafeCosmeticId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id) && !id.includes('://') && !id.includes('/') && !id.includes('\\');
}

export function isCharacterLoadoutV2(v: unknown): v is CharacterLoadoutV2 {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return false;
  const keys: (keyof CharacterLoadoutV2)[] = [
    'baseModelId', 'skinToneId', 'hairStyleId', 'hairColorId', 'outfitId', 'shoeId',
    'headwearId', 'faceAccessoryId', 'backAccessoryId', 'heldItemId', 'auraId',
    'emoteSetId', 'nameplateStyleId',
  ];
  return keys.every((k) => isSafeCosmeticId(o[k]));
}

export function sanitizeLoadout(raw: unknown): CharacterLoadoutV2 {
  if (!isCharacterLoadoutV2(raw)) return { ...SAFE_DEFAULT_LOADOUT };
  return { ...raw };
}
