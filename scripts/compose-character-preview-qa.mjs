/**
 * Offline visual compose QA — mirrors BitmapCharacterLayout.ts's
 * getPlacementForSlot() foot-plant math (same formula, kept in sync by
 * hand since this is a plain Node script and the source of truth is
 * TypeScript — same established pattern as scripts/lib/canonical-world.mjs
 * mirroring RoadNetwork.ts). Writes contact sheets + reports under
 * docs/character-system/qa/.
 *
 * Phase 11C: updated to scale from MEASURED visible bounds (visibleWidth/
 * visibleHeight/offsetXFrac/offsetYFrac, written by install-character-
 * assets.mjs via character-bounds-analysis.mjs) instead of raw frame
 * size — this script was still using the pre-fix formula and so was
 * "proving" a scale bug that no longer exists in the real renderer.
 *
 * Usage: node scripts/compose-character-preview-qa.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'character-system', 'qa');
const MANIFEST = path.join(ROOT, 'public', 'assets', 'characters', 'manifests', 'character_runtime_manifest.json');
const ATLAS_DIR = path.join(ROOT, 'public', 'assets', 'characters', 'atlases');
const BASE_DIR = path.join(ROOT, 'public', 'assets', 'characters', 'bases');
const OUTFITS_DIR = path.join(ROOT, 'public', 'assets', 'characters', 'outfits');

const BASE_NATIVE_HEIGHT = 144;
const HEAD_CENTER_FROM_FEET = 110 / BASE_NATIVE_HEIGHT;
const HEAD_DIAMETER = 44;
const BODY_H = 144;
// Phase 11C — enlarged from 160x200: the bounds-based scale fix makes
// headwear/hair render substantially larger (correctly — see the
// transparent-bounds-report.md before/after numbers), so the old canvas
// was too tight and clipped composites.
const CANVAS_W = 220;
const CANVAS_H = 240;
const FOOT_Y = CANVAS_H - 16;

const HEIGHT_FRAC = {
  base: 1,
  outfit: 1, // Phase 13 — same as base; canvas matches base exactly.
  pants: 48 / BASE_NATIVE_HEIGHT,
  hair: (HEAD_DIAMETER * 1.15) / BASE_NATIVE_HEIGHT,
  facial: (HEAD_DIAMETER * 0.7) / BASE_NATIVE_HEIGHT,
  hat: (HEAD_DIAMETER * 1.25) / BASE_NATIVE_HEIGHT,
};
const HEAD_SLOTS = new Set(['hair', 'facial', 'hat']);

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** Mirrors BitmapCharacterLayout.ts's getPlacementForSlot(). `bounds` is
 *  the manifest asset entry (or undefined for the SVG base bodies, which
 *  fall back to frame == visible, matching the TS side's fallback). */
function placement(slot, nativeW, nativeH, bounds) {
  const frac = HEIGHT_FRAC[slot] ?? 0.3;
  const targetH = BODY_H * frac;
  // 'base'/'outfit' share one canvas by contract — scale by FRAME size,
  // not each asset's own visible-content ratio (an outfit is only ever a
  // partial overlay on that shared frame). See BitmapCharacterLayout.ts.
  const isFullFrameSlot = slot === 'base' || slot === 'outfit';
  const visibleH = Math.max(1, bounds?.visibleHeight ?? nativeH);
  const visibleW = Math.max(1, bounds?.visibleWidth ?? nativeW);
  const targetWidthCap = BODY_H * frac * 1.6;
  const scale = isFullFrameSlot ? targetH / Math.max(1, nativeH) : Math.min(targetH / visibleH, targetWidthCap / visibleW);
  const displayH = nativeH * scale;
  const offsetXFrac = isFullFrameSlot ? 0 : (bounds?.offsetXFrac ?? 0);
  const offsetYFrac = isFullFrameSlot ? 0 : (bounds?.offsetYFrac ?? 0);

  let yFromFeet = 0;
  let xFromCenter = -offsetXFrac * nativeW * scale;
  if (slot === 'base' || slot === 'pants' || slot === 'outfit') {
    yFromFeet = slot === 'pants' ? (8 / BASE_NATIVE_HEIGHT) * BODY_H : 0;
  } else if (HEAD_SLOTS.has(slot)) {
    const headCenter = HEAD_CENTER_FROM_FEET * BODY_H;
    yFromFeet = headCenter - displayH / 2 + offsetYFrac * nativeH * scale;
  }
  return { scale, displayH, yFromFeet, xFromCenter };
}

async function extractFrame(atlasId, frameName) {
  const json = JSON.parse(fs.readFileSync(path.join(ATLAS_DIR, `${atlasId}.json`), 'utf8'));
  const fr = json.frames[frameName]?.frame;
  if (!fr) throw new Error(`missing frame ${frameName} in ${atlasId}`);
  const png = path.join(ATLAS_DIR, json.meta.image);
  return sharp(png).extract({ left: fr.x, top: fr.y, width: fr.w, height: fr.h }).ensureAlpha().png().toBuffer({ resolveWithObject: true });
}

/** `layer.mirror: true` flips the frame horizontally — used ONLY for the
 *  explicitly-labeled "left (mirrored)" composites, never silently. */
async function compose(layers) {
  const composites = [];
  for (const layer of layers) {
    let buf;
    let meta;
    if (layer.file) {
      const out = await sharp(layer.file).ensureAlpha().png().toBuffer({ resolveWithObject: true });
      buf = out.data;
      meta = out.info;
    } else {
      const out = await extractFrame(layer.atlasId, layer.frame);
      buf = out.data;
      meta = out.info;
    }
    const p = placement(layer.slot, meta.width, meta.height, layer.bounds);
    // Clamp to the QA canvas — this is a visualization limit only, not a
    // statement about the real renderer (Phaser has no such cap).
    const w = Math.max(1, Math.min(CANVAS_W, Math.round(meta.width * p.scale)));
    const h = Math.max(1, Math.min(CANVAS_H, Math.round(meta.height * p.scale)));
    let pipeline = sharp(buf).resize(w, h, { kernel: sharp.kernel.nearest });
    if (layer.mirror) pipeline = pipeline.flop();
    const resized = await pipeline.png().toBuffer();
    const top = clamp(Math.round(FOOT_Y - p.yFromFeet - h), 0, CANVAS_H - h);
    const left = clamp(Math.round((CANVAS_W - w) / 2 + p.xFromCenter), 0, CANVAS_W - w);
    composites.push({ input: resized, left, top });
  }
  return sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 8, g: 12, b: 16, alpha: 1 } },
  }).composite(composites).png().toBuffer();
}

async function writeCase(name, layers, thumbs) {
  const png = await compose(layers);
  const outPath = path.join(OUT, `${name}.png`);
  fs.writeFileSync(outPath, png);
  thumbs.push({ input: png, left: thumbs.length * (CANVAS_W + 8), top: 0, label: name });
  console.log('wrote', outPath);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const byCat = (cat) => manifest.assets.filter((a) => a.category === cat && a.creatorEnabled !== false && a.alignmentStatus !== 'incompatible');
  const hair = byCat('hair')[0];
  const facial = byCat('facial-hair')[0];
  const hat = byCat('headwear')[0];
  const pants = byCat('pants')[0];
  const npc = manifest.assets.find((a) => a.category === 'npcs');

  const baseLayer = (id) => ({ slot: 'base', file: path.join(BASE_DIR, `${id}.png`) });
  const outfitLayer = (asset) => asset && { slot: 'outfit', file: path.join(OUTFITS_DIR, `${asset.id}.png`), bounds: asset };
  const cosmeticLayer = (asset, slot) => asset && {
    slot, atlasId: asset.atlasKey, frame: asset.frame, bounds: asset,
  };
  const mirroredCosmeticLayer = (asset, slot) => asset && {
    slot, atlasId: asset.atlasKey, frame: asset.frame, bounds: asset, mirror: true,
  };

  const defaultAppearance = manifest.defaultAppearance ?? {};
  const defaultBase = manifest.assets.find((a) => a.id === defaultAppearance.baseId) ?? null;
  const defaultHair = manifest.assets.find((a) => a.id === defaultAppearance.hairId) ?? null;
  const defaultOutfit = manifest.assets.find((a) => a.id === defaultAppearance.outfitId) ?? null;
  const defaultPants = manifest.assets.find((a) => a.id === defaultAppearance.pantsId) ?? null;
  const allOutfits = byCat('outfit');

  const cases = [
    { name: 'default_base_only', layers: [baseLayer('base_skin_light')] },
    { name: 'base_plus_hair', layers: [baseLayer('base_skin_light'), cosmeticLayer(hair, 'hair')].filter(Boolean) },
    {
      name: 'base_hair_facial_hat_pants',
      layers: [
        baseLayer('base_skin_medium'),
        outfitLayer(allOutfits[0]),
        cosmeticLayer(pants, 'pants'),
        cosmeticLayer(hair, 'hair'),
        cosmeticLayer(facial, 'facial'),
        cosmeticLayer(hat, 'hat'),
      ].filter(Boolean),
    },
    // Phase 13 — the deliberate starter citizen (Task 9), not a bare body.
    {
      name: 'default_player_composite',
      layers: [
        baseLayer(defaultAppearance.baseId ?? 'base_skin_light'),
        outfitLayer(defaultOutfit),
        cosmeticLayer(defaultPants, 'pants'),
        cosmeticLayer(defaultHair, 'hair'),
      ].filter(Boolean),
    },
    { name: 'hair_plus_hat', layers: [baseLayer('base_skin_light'), cosmeticLayer(hair, 'hair'), cosmeticLayer(hat, 'hat')].filter(Boolean) },
    {
      name: 'hair_facial_hat_down',
      layers: [baseLayer('base_skin_light'), cosmeticLayer(hair, 'hair'), cosmeticLayer(facial, 'facial'), cosmeticLayer(hat, 'hat')].filter(Boolean),
    },
    // Phase 11C Task 20/21 — explicitly-labeled MIRRORED left-facing
    // composite. This is NOT true left-facing art (none exists in the
    // pipeline) — it is the same honest fallback BitmapCharacter.ts uses
    // at runtime (flip only if the asset's measured mirrorSafe is true).
    {
      name: 'hair_facial_hat_left_MIRRORED_APPROXIMATION',
      layers: [
        baseLayer('base_skin_light'),
        (hair?.mirrorSafe !== false) && mirroredCosmeticLayer(hair, 'hair'),
        (facial?.mirrorSafe !== false) && mirroredCosmeticLayer(facial, 'facial'),
        (hat?.mirrorSafe !== false) && mirroredCosmeticLayer(hat, 'hat'),
      ].filter(Boolean),
    },
  ];

  // Phase 13 — one composite per outfit, same base+hair, so the full
  // wardrobe variety can be checked at a glance.
  for (const outfit of allOutfits) {
    cases.push({
      name: `outfit_${outfit.id}`,
      layers: [baseLayer('base_skin_light'), outfitLayer(outfit), cosmeticLayer(pants, 'pants'), cosmeticLayer(hair, 'hair')].filter(Boolean),
    });
  }

  if (npc) {
    cases.push({
      name: 'representative_npc',
      layers: [{ slot: 'base', atlasId: npc.atlasKey, frame: npc.frame, bounds: npc }],
    });
  }

  const thumbs = [];
  for (const c of cases) await writeCase(c.name, c.layers, thumbs);

  const sheetW = thumbs.length * (CANVAS_W + 8) - 8;
  const sheet = await sharp({
    create: { width: sheetW, height: CANVAS_H, channels: 4, background: { r: 4, g: 8, b: 12, alpha: 1 } },
  }).composite(thumbs.map(({ input, left, top }) => ({ input, left, top }))).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'contact_sheet.png'), sheet);
  console.log('wrote contact sheet:', thumbs.map((t) => t.label).join(', '));

  // Phase 11C Task 20/10 — creator-enabled + incompatible-asset reports,
  // straight from the manifest (no separate source of truth).
  const creatorEnabledReport = manifest.assets
    .filter((a) => a.creatorEnabled !== false && a.alignmentStatus !== 'incompatible' && a.creatorVisible)
    .map((a) => ({ id: a.id, category: a.category, alignmentStatus: a.alignmentStatus, mirrorSafe: a.mirrorSafe, compatibilityGroup: a.compatibilityGroup }));
  const incompatibleReport = manifest.assets
    .filter((a) => a.alignmentStatus === 'incompatible' || a.creatorEnabled === false)
    .map((a) => ({ id: a.id, category: a.category, alignmentStatus: a.alignmentStatus, creatorEnabled: a.creatorEnabled, reason: a.rejectionReason ?? 'category disabled (see phase11b-notes.md)' }));
  fs.writeFileSync(path.join(OUT, 'creator-enabled-assets-report.json'), JSON.stringify(creatorEnabledReport, null, 2));
  fs.writeFileSync(path.join(OUT, 'incompatible-assets-report.json'), JSON.stringify(incompatibleReport, null, 2));
  console.log(`wrote creator-enabled report (${creatorEnabledReport.length}) and incompatible report (${incompatibleReport.length})`);

  console.log('compose-character-preview-qa OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
