/**
 * CharacterValidation — runtime guards for loadouts and manifests.
 */

import { getCharacterManifest, getManifestEntry } from './CharacterManifest';
import { isCharacterLoadoutV2, isSafeCosmeticId, type CharacterLoadoutV2 } from './CharacterAppearanceModel';

export function validateManifestIntegrity(): string[] {
  const errors: string[] = [];
  const m = getCharacterManifest();
  const seen = new Set<string>();
  for (const e of m.entries) {
    if (seen.has(e.id)) errors.push(`duplicate id ${e.id}`);
    seen.add(e.id);
    if (!isSafeCosmeticId(e.id)) errors.push(`unsafe id ${e.id}`);
    if (e.texturePath && (e.texturePath.includes('://') || e.texturePath.includes('..'))) {
      errors.push(`unsafe path ${e.id}`);
    }
    if (e.frameWidth <= 0 || e.frameHeight <= 0) errors.push(`bad frame size ${e.id}`);
  }
  return errors;
}

export function validateLoadoutAgainstManifest(loadout: CharacterLoadoutV2): string[] {
  const errors: string[] = [];
  if (!isCharacterLoadoutV2(loadout)) return ['invalid loadout shape'];
  const slots: Array<Exclude<keyof CharacterLoadoutV2, 'version'>> = [
    'baseModelId', 'hairStyleId', 'outfitId', 'headwearId', 'faceAccessoryId',
  ];
  for (const key of slots) {
    const id = loadout[key];
    if (typeof id !== 'string') continue;
    if (id === 'none' || id === 'default') continue;
    const entry = getManifestEntry(id);
    if (!entry) errors.push(`unknown ${key}=${id}`);
    else if (entry.status === 'retired' || entry.status === 'disabled') errors.push(`disabled ${id}`);
  }
  return errors;
}
