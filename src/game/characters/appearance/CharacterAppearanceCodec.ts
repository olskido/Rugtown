import type { CharacterAppearanceV1 } from './CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance, MAX_ACCESSORIES } from './CharacterAppearanceDefaults';

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

export function isSafeAssetId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id) && !id.includes('://') && !id.includes('/') && !id.includes('\\');
}

export type AssetIdResolver = (id: string, slot: string) => boolean;

function cleanId(raw: unknown, fallback: string | null, slot: string, resolve?: AssetIdResolver): string | null {
  if (raw == null || raw === '' || raw === 'none') return null;
  if (!isSafeAssetId(raw)) return fallback;
  if (resolve && !resolve(raw, slot)) return fallback;
  return raw;
}

export function normalizeCharacterAppearance(
  raw: unknown,
  resolve?: AssetIdResolver,
): CharacterAppearanceV1 {
  const defaults = getDefaultCharacterAppearance();
  if (!raw || typeof raw !== 'object') return { ...defaults, accessoryIds: [...defaults.accessoryIds] };
  const o = raw as Record<string, unknown>;
  const version = o.version === 1 ? 1 : 1;

  let accessoryIds: string[] = [];
  if (Array.isArray(o.accessoryIds)) {
    const seen = new Set<string>();
    for (const a of o.accessoryIds) {
      if (!isSafeAssetId(a)) continue;
      if (resolve && !resolve(a, 'accessories')) continue;
      if (seen.has(a)) continue;
      seen.add(a);
      accessoryIds.push(a);
      if (accessoryIds.length >= MAX_ACCESSORIES) break;
    }
  }

  const baseId = cleanId(o.baseId, defaults.baseId, 'base', resolve) ?? defaults.baseId;

  return {
    version,
    baseId,
    hairId: cleanId(o.hairId, defaults.hairId, 'hair', resolve),
    facialHairId: cleanId(o.facialHairId, null, 'facial-hair', resolve),
    headwearId: cleanId(o.headwearId, null, 'headwear', resolve),
    outfitId: cleanId(o.outfitId, defaults.outfitId, 'outfit', resolve),
    pantsId: cleanId(o.pantsId, defaults.pantsId, 'pants', resolve),
    shoesId: cleanId(o.shoesId, defaults.shoesId, 'shoes', resolve),
    accessoryIds,
  };
}

export function validateCharacterAppearance(a: CharacterAppearanceV1): string[] {
  const errors: string[] = [];
  if (a.version !== 1) errors.push('unsupported version');
  if (!isSafeAssetId(a.baseId)) errors.push('invalid baseId');
  if (a.accessoryIds.length > MAX_ACCESSORIES) errors.push('too many accessories');
  return errors;
}

/** Compact Presence / storage payload. */
export function encodeCharacterAppearance(a: CharacterAppearanceV1): string {
  return JSON.stringify({
    v: 1,
    b: a.baseId,
    h: a.hairId,
    f: a.facialHairId,
    w: a.headwearId,
    o: a.outfitId,
    p: a.pantsId,
    s: a.shoesId,
    a: a.accessoryIds,
  });
}

export function decodeCharacterAppearance(raw: unknown, resolve?: AssetIdResolver): CharacterAppearanceV1 {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return getDefaultCharacterAppearance();
    }
  }
  if (!raw || typeof raw !== 'object') return getDefaultCharacterAppearance();
  const o = raw as Record<string, unknown>;
  // Compact form
  if ('b' in o || 'v' in o) {
    return normalizeCharacterAppearance({
      version: 1,
      baseId: o.b,
      hairId: o.h,
      facialHairId: o.f,
      headwearId: o.w,
      outfitId: o.o,
      pantsId: o.p,
      shoesId: o.s,
      accessoryIds: o.a,
    }, resolve);
  }
  return normalizeCharacterAppearance(o, resolve);
}

export function migrateCharacterAppearance(raw: unknown, resolve?: AssetIdResolver): CharacterAppearanceV1 {
  // Legacy 11-slot creator → bitmap defaults (cannot map jacket styles 1:1)
  if (raw && typeof raw === 'object' && 'hairstyle' in (raw as object) && !('baseId' in (raw as object))) {
    return getDefaultCharacterAppearance();
  }
  return normalizeCharacterAppearance(raw, resolve);
}

export function appearancesEqual(a: CharacterAppearanceV1, b: CharacterAppearanceV1): boolean {
  return encodeCharacterAppearance(a) === encodeCharacterAppearance(b);
}
