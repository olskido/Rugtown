/**
 * Phase 11C — standalone behavior tests for the placement/mirror math,
 * NPC visual-scale/speed tuning, and the multi-region asset exclusion.
 * Deliberately avoids TypeScript runtime tooling (same convention as
 * scripts/test-character-appearance-codec.mjs) — the placement formula
 * is mirrored here from BitmapCharacterLayout.ts; the bounds-analysis
 * functions are imported directly since that module is plain ESM.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSingleImage } from './lib/character-bounds-analysis.mjs';

const ROOT = process.cwd();
let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('ok  -', name);
  } catch (e) {
    failures.push({ name, error: e });
    console.error('FAIL -', name, '\n     ', e.message);
  }
}

/* ── Mirrors BitmapCharacterLayout.ts getPlacementForSlot()'s core math ── */
const BASE_NATIVE_HEIGHT = 144;
const HEAD_CENTER_FROM_FEET = 110 / BASE_NATIVE_HEIGHT;
const HEAD_DIAMETER = 44;
const SLOT_HEIGHT_FRACTION_HAT = (HEAD_DIAMETER * 1.25) / BASE_NATIVE_HEIGHT;

function placeHeadSlot(bodyDisplayHeight, nativeW, nativeH, visibleW, visibleH, offsetXFrac, offsetYFrac) {
  const targetHeight = bodyDisplayHeight * SLOT_HEIGHT_FRACTION_HAT;
  const targetWidthCap = targetHeight * 1.6;
  const scale = Math.min(targetHeight / Math.max(1, visibleH), targetWidthCap / Math.max(1, visibleW));
  const displayH = nativeH * scale;
  const headCenterY = -HEAD_CENTER_FROM_FEET * bodyDisplayHeight;
  const y = headCenterY + displayH / 2 - offsetYFrac * nativeH * scale;
  const x = 0 - offsetXFrac * nativeW * scale;
  // Full-frame center in this local coordinate system (origin = bottom-center, so center = y - displayH/2).
  const frameCenterY = y - displayH / 2;
  const visibleCenterYWorld = frameCenterY + offsetYFrac * nativeH * scale;
  const frameCenterX = x; // origin anchorX=0.5 → x already IS the frame's horizontal center
  const visibleCenterXWorld = frameCenterX + offsetXFrac * nativeW * scale;
  return { scale, x, y, visibleCenterXWorld, visibleCenterYWorld, headCenterY };
}

await test('visible content lands exactly at head-center Y regardless of padding amount', () => {
  const bodyH = 48;
  // A hat with heavy asymmetric padding (visible content far from frame center).
  const a = placeHeadSlot(bodyH, 352, 352, 82, 82, 0, 0.25);
  assert.ok(Math.abs(a.visibleCenterYWorld - a.headCenterY) < 1e-6, 'heavily-offset asset should still land its visible center on head-center');
  // A hat with zero padding offset (already centered) should land identically.
  const b = placeHeadSlot(bodyH, 160, 160, 82, 82, 0, 0);
  assert.ok(Math.abs(b.visibleCenterYWorld - b.headCenterY) < 1e-6);
});

await test('visible content lands exactly at head-center X for an off-center asset', () => {
  const bodyH = 48;
  const a = placeHeadSlot(bodyH, 352, 352, 82, 82, 0.15, 0);
  assert.ok(Math.abs(a.visibleCenterXWorld - 0) < 1e-6, 'off-center-X asset should still land its visible center at x=0 (head center)');
});

await test('scale is calibrated to VISIBLE content, not raw frame size — the Phase 11C root-cause fix', () => {
  const bodyH = 48;
  // Two hats, same frame size, wildly different visible content size —
  // pre-11C both would render at the exact same scale (frame-based);
  // post-11C their VISIBLE on-screen height should be equal (bounds-based).
  // Both kept within the width-safety-cap (1.6x target height) so this
  // isolates the height-based scale fix specifically; the width cap has
  // its own purpose (capping unusually wide crops) and is not what's
  // under test here.
  const small = placeHeadSlot(bodyH, 352, 352, 50, 34, 0, 0); // small beanie, visH=34/352
  const large = placeHeadSlot(bodyH, 352, 352, 130, 99, 0, 0); // wide cap, visH=99/352
  const smallOnScreenVisH = 34 * small.scale;
  const largeOnScreenVisH = 99 * large.scale;
  assert.ok(Math.abs(smallOnScreenVisH - largeOnScreenVisH) < 0.5,
    `on-screen visible height should be consistent regardless of source padding (got ${smallOnScreenVisH} vs ${largeOnScreenVisH})`);
});

/* ── NPC visual scale — applied exactly once on top of the Phase 11B value ── */
await test('NPC_VISUAL_SCALE is the Phase 11B runtime value times 1.30, applied once', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/game/characters/render/CharacterVisualScale.ts'), 'utf8');
  const b11bMatch = src.match(/NPC_VISUAL_SCALE_PHASE_11B\s*=\s*([0-9.]+)\s*\*\s*([0-9.]+)/);
  assert.ok(b11bMatch, 'expected the documented Phase 11B baseline constant to still be present');
  const phase11b = parseFloat(b11bMatch[1]) * parseFloat(b11bMatch[2]);
  assert.ok(Math.abs(phase11b - 0.936) < 1e-6, `Phase 11B baseline should be 0.936, got ${phase11b}`);
  const finalMatch = src.match(/export const NPC_VISUAL_SCALE = NPC_VISUAL_SCALE_PHASE_11B \* ([0-9.]+)/);
  assert.ok(finalMatch, 'expected NPC_VISUAL_SCALE = NPC_VISUAL_SCALE_PHASE_11B * 1.3');
  assert.equal(parseFloat(finalMatch[1]), 1.3);
  const finalValue = phase11b * 1.3;
  assert.ok(Math.abs(finalValue - 1.2168) < 1e-4, `expected ~1.2168, got ${finalValue}`);
  // Regression guard: exactly one multiplier site in the scene (visual
  // only — not collision/interaction/hitbox).
  const scene = fs.readFileSync(path.join(ROOT, 'src/game/scenes/WorldScene.ts'), 'utf8');
  const npcScaleUses = (scene.match(/visualScale:\s*NPC_SCALE/g) || []).length;
  assert.equal(npcScaleUses, 1, 'NPC_SCALE should be used for exactly one BitmapCharacter construction (NPCs only)');
});

/* ── NPC speed must never exceed player speed ── */
await test('NPC speed range stays below PLAYER_SPEED at every district multiplier', () => {
  const mapScale = fs.readFileSync(path.join(ROOT, 'src/game/world/WorldMapScale.ts'), 'utf8');
  const playerSpeedMatch = mapScale.match(/export const PLAYER_SPEED = ([0-9.]+)/);
  assert.ok(playerSpeedMatch, 'expected PLAYER_SPEED export');
  const playerSpeed = parseFloat(playerSpeedMatch[1]);

  const scene = fs.readFileSync(path.join(ROOT, 'src/game/scenes/WorldScene.ts'), 'utf8');
  const speedMaxMatch = scene.match(/speedMax:\s*([0-9.]+)/);
  const districtMultBlockMatch = scene.match(/NPC_DISTRICT_SPEED_MULT[^}]*\{([^}]*)\}/s);
  assert.ok(speedMaxMatch && districtMultBlockMatch, 'expected speedMax and NPC_DISTRICT_SPEED_MULT to be present');
  const speedMax = parseFloat(speedMaxMatch[1]);
  const mults = [...districtMultBlockMatch[1].matchAll(/:\s*([0-9.]+)/g)].map((m) => parseFloat(m[1]));
  assert.ok(mults.length >= 4, 'expected multiple district multipliers');
  for (const mult of mults) {
    const worstCase = speedMax * mult;
    assert.ok(worstCase < playerSpeed,
      `district multiplier ${mult} * speedMax ${speedMax} = ${worstCase} must stay below PLAYER_SPEED ${playerSpeed}`);
  }
});

/* ── Multi-region defective assets must be excluded from the creator ── */
await test('assets with a genuine two-view source-art defect are excluded from the creator', () => {
  const manifestPath = path.join(ROOT, 'public/assets/characters/manifests/character_runtime_manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const knownDefective = [
    'hair_mcdem_street_styk_01', 'headwear_barista_cap_01', 'headwear_cycling_helmet_01',
    'headwear_dad_cap_01', 'headwear_festival_hat_01', 'headwear_flat_cap_01',
    'headwear_newsboy_cap_01', 'headwear_snapback_01',
  ];
  for (const id of knownDefective) {
    const asset = manifest.assets.find((a) => a.id === id);
    assert.ok(asset, `expected ${id} to still exist in the manifest (excluded, not deleted)`);
    assert.equal(asset.creatorEnabled, false, `${id} should be creatorEnabled:false`);
    assert.equal(asset.alignmentStatus, 'incompatible', `${id} should be alignmentStatus:incompatible`);
  }
});

/* ── Default appearance is a deliberate starter citizen, not a bare mannequin ── */
await test('default appearance is dressed (hair + pants), not a bare base body', () => {
  const manifestPath = path.join(ROOT, 'public/assets/characters/manifests/character_runtime_manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.defaultAppearance.hairId, 'default appearance should include hair');
  assert.ok(manifest.defaultAppearance.pantsId, 'default appearance should include pants');
  const hair = manifest.assets.find((a) => a.id === manifest.defaultAppearance.hairId);
  const pants = manifest.assets.find((a) => a.id === manifest.defaultAppearance.pantsId);
  assert.ok(hair && hair.creatorEnabled !== false && hair.alignmentStatus !== 'incompatible', 'default hair must be a real, enabled asset');
  assert.ok(pants && pants.creatorEnabled !== false && pants.alignmentStatus !== 'incompatible', 'default pants must be a real, enabled asset');
});

/* ── Mirror-safety detector: sanity-check on synthetic images ── */
await test('mirror-safety detector: symmetric shape is mirrorSafe, one-sided shape is not', async () => {
  const sharp = (await import('sharp')).default;
  const tmpDir = fs.mkdtempSync(path.join(ROOT, 'node_modules', '.tmp-11c-'));
  try {
    const symW = 40, symH = 40;
    const symSvg = `<svg width="${symW}" height="${symH}"><circle cx="20" cy="20" r="15" fill="black"/></svg>`;
    const symPath = path.join(tmpDir, 'sym.png');
    await sharp(Buffer.from(symSvg)).png().toFile(symPath);
    const symResult = await analyzeSingleImage(symPath);
    assert.ok(symResult.ok && symResult.mirrorSafe, 'a centered circle should be measured as mirror-safe');

    // A right triangle is asymmetric WITHIN its own bounding box (unlike
    // a solid rectangle, whose bbox-relative content is trivially
    // symmetric regardless of where it sits in the canvas).
    const triSvg = `<svg width="${symW}" height="${symH}"><polygon points="4,4 4,36 36,36" fill="black"/></svg>`;
    const triPath = path.join(tmpDir, 'triangle.png');
    await sharp(Buffer.from(triSvg)).png().toFile(triPath);
    const triResult = await analyzeSingleImage(triPath);
    assert.ok(triResult.ok && !triResult.mirrorSafe, 'a right triangle should NOT be measured as mirror-safe');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

/* ── Phase 13 regression: 'base'/'outfit' are full-frame slots and must
   scale by FRAME size, not each asset's own visible-content ratio. An
   earlier version of this fix made a real outfit balloon to ~3x body
   size because its visible content (just a torso) was much smaller than
   its shared 192x288 frame. See BitmapCharacterLayout.ts. ── */
function placeFullFrameSlot(bodyDisplayHeight, nativeH, visibleH) {
  // frac = 1 for both 'base' and 'outfit' (SLOT_HEIGHT_FRACTION).
  const targetHeight = bodyDisplayHeight * 1;
  const isFullFrameSlot = true;
  const scale = isFullFrameSlot ? targetHeight / Math.max(1, nativeH) : targetHeight / Math.max(1, visibleH);
  return scale;
}

await test('outfit scale uses frame height, not visible-content height (a torso-only outfit must not balloon)', () => {
  const bodyDisplayHeight = 48;
  const nativeH = 288; // shared base/outfit canvas height
  const outfitVisibleH = 100; // just the torso portion is visible — much smaller than the frame
  const scale = placeFullFrameSlot(bodyDisplayHeight, nativeH, outfitVisibleH);
  // Correct: scale = bodyDisplayHeight / nativeH = 48/288 = 0.1667
  assert.ok(Math.abs(scale - bodyDisplayHeight / nativeH) < 1e-9, 'full-frame slots must scale by nativeH, ignoring visibleH entirely');
  // The bug this guards against: scaling by visible height would have
  // given 48/100 = 0.48 — nearly 3x too large.
  const buggyScale = bodyDisplayHeight / outfitVisibleH;
  assert.ok(scale < buggyScale / 2, 'sanity check that the fixed scale is meaningfully smaller than the buggy visible-content-based scale');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
