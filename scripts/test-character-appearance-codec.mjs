/**
 * Standalone behavior tests mirroring CharacterAppearanceCodec.ts.
 * This deliberately avoids TypeScript runtime tooling.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.join(process.cwd(), 'public/assets/characters/manifests/character_runtime_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const MAX_ACCESSORIES = 3;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

function defaults() {
  return { ...manifest.defaultAppearance, accessoryIds: [...manifest.defaultAppearance.accessoryIds] };
}

function isSafeAssetId(id) {
  return typeof id === 'string' && ID_RE.test(id) && !id.includes('://') && !id.includes('/') && !id.includes('\\');
}

function cleanId(raw, fallback) {
  if (raw == null || raw === '' || raw === 'none') return null;
  return isSafeAssetId(raw) ? raw : fallback;
}

function normalize(raw) {
  const fallback = defaults();
  if (!raw || typeof raw !== 'object') return fallback;
  const accessoryIds = [];
  if (Array.isArray(raw.accessoryIds)) {
    for (const id of raw.accessoryIds) {
      if (!isSafeAssetId(id) || accessoryIds.includes(id)) continue;
      accessoryIds.push(id);
      if (accessoryIds.length >= MAX_ACCESSORIES) break;
    }
  }
  return {
    version: 1,
    baseId: cleanId(raw.baseId, fallback.baseId) ?? fallback.baseId,
    hairId: cleanId(raw.hairId, fallback.hairId),
    facialHairId: cleanId(raw.facialHairId, null),
    headwearId: cleanId(raw.headwearId, null),
    outfitId: cleanId(raw.outfitId, fallback.outfitId ?? null),
    pantsId: cleanId(raw.pantsId, fallback.pantsId),
    shoesId: cleanId(raw.shoesId, fallback.shoesId),
    accessoryIds,
  };
}

function encode(appearance) {
  return JSON.stringify({
    v: 1, b: appearance.baseId, h: appearance.hairId, f: appearance.facialHairId,
    w: appearance.headwearId, o: appearance.outfitId, p: appearance.pantsId, s: appearance.shoesId, a: appearance.accessoryIds,
  });
}

function decode(raw) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return defaults(); }
  }
  if (!raw || typeof raw !== 'object') return defaults();
  if ('b' in raw || 'v' in raw) {
    return normalize({
      version: 1, baseId: raw.b, hairId: raw.h, facialHairId: raw.f,
      headwearId: raw.w, outfitId: raw.o, pantsId: raw.p, shoesId: raw.s, accessoryIds: raw.a,
    });
  }
  return normalize(raw);
}

function migrate(raw) {
  if (raw && typeof raw === 'object' && 'hairstyle' in raw && !('baseId' in raw)) return defaults();
  return normalize(raw);
}

const defaultAppearance = defaults();
assert.deepEqual(defaultAppearance, {
  version: 1,
  baseId: manifest.defaultAppearance.baseId,
  hairId: manifest.defaultAppearance.hairId ?? null,
  facialHairId: manifest.defaultAppearance.facialHairId ?? null,
  headwearId: manifest.defaultAppearance.headwearId ?? null,
  outfitId: manifest.defaultAppearance.outfitId ?? null,
  pantsId: manifest.defaultAppearance.pantsId ?? null,
  shoesId: manifest.defaultAppearance.shoesId ?? null,
  accessoryIds: manifest.defaultAppearance.accessoryIds ?? [],
}, 'default appearance has the versioned bitmap shape');

const unsafe = normalize({
  baseId: 'https://example.test/base.png',
  hairId: '../hair',
  pantsId: 'pants/evil',
  shoesId: '\\\\network\\shoe',
});
assert.equal(unsafe.baseId, defaultAppearance.baseId);
assert.equal(unsafe.hairId, defaultAppearance.hairId);
assert.equal(unsafe.pantsId, defaultAppearance.pantsId);
assert.equal(unsafe.shoesId, defaultAppearance.shoesId);

assert.deepEqual(normalize({
  ...defaultAppearance,
  unexpected: 'ignored',
  textureUrl: 'https://example.test/x.png',
}), defaultAppearance, 'unknown fields are ignored');

const accessories = normalize({
  baseId: defaultAppearance.baseId,
  accessoryIds: ['one', 'one', 'two', 'three', 'four', 'https://bad.test/a'],
});
assert.deepEqual(accessories.accessoryIds, ['one', 'two', 'three'], 'accessories deduplicate and cap at three');

const appearance = normalize({
  baseId: 'base_skin_fair',
  hairId: 'hair_test',
  facialHairId: 'beard_test',
  headwearId: 'hat_test',
  outfitId: 'outfit_test',
  pantsId: 'pants_test',
  shoesId: 'shoes_test',
  accessoryIds: ['glasses_test', 'bag_test'],
});
assert.deepEqual(decode(encode(appearance)), appearance, 'compact encoding round trips');
assert.deepEqual(migrate({ hairstyle: { id: 'legacy-style' }, jacket: 'old' }), defaultAppearance, 'legacy creator objects migrate to defaults');

console.log('Character appearance codec tests passed (6 assertions).');
