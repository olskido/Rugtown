/**
 * ingest-character-art.mjs
 * ─────────────────────────
 * Phase 12 — drop individual transparent PNGs into
 * rugtown_asset_pipeline/incoming/{base,hair,facial-hair,headwear,
 * outfit,pants,shoes,accessories}/, run this, then run
 * `npm run assets:characters` as usual. No manual atlas/JSON authoring.
 *
 * What it does per category:
 *   - base:  copies files straight into public/assets/characters/bases/
 *            as base_skin_{name}.png (these are used directly, not
 *            atlas-packed — matches the existing convention).
 *   - everything else: packs all incoming files for that category into
 *            one grid atlas PNG + a TexturePacker-format JSON (same
 *            schema install-character-assets.mjs already reads), and
 *            appends/updates entries in rugtown_asset_pipeline/
 *            metadata_assets.json (existing entries are preserved;
 *            re-running with the same filename overwrites that one
 *            entry, everything else is untouched).
 *
 * Filename → id: lowercased, non-alnum runs collapsed to "_", extension
 * stripped. "Cowboy Hat.png" in incoming/headwear/ becomes
 * headwear_cowboy_hat, category "headwear", displayName "Cowboy Hat".
 *
 * This does not resize, crop, or alter pixel content — Phase 11C's
 * measured-bounds placement fix means generous padding is fine and
 * scale is computed from real visible content, not canvas size.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PIPELINE = path.join(ROOT, 'rugtown_asset_pipeline');
const INCOMING = path.join(PIPELINE, 'incoming');
const ATLASES_DIR = path.join(PIPELINE, 'atlases');
const BASES_OUT = path.join(ROOT, 'public', 'assets', 'characters', 'bases');
const METADATA_PATH = path.join(PIPELINE, 'metadata_assets.json');

const CATEGORIES = ['hair', 'facial-hair', 'headwear', 'outfit', 'pants', 'shoes', 'accessories'];
// IMPORTANT: never reuse an existing canonical atlas name here (e.g.
// "atlas_hair") — packCategory() below fully regenerates whatever file
// this maps to from scratch every run. Pointing it at a real existing
// atlas destroys every frame already packed into it (this happened once
// during development and had to be restored from a build backup). Each
// category gets its own dedicated "_ingest" atlas instead — the same
// established pattern this repo already uses for multi-part categories
// (atlas_headwear_1.json + atlas_headwear_2.json both feed "headwear").
const ATLAS_KEY_BY_CATEGORY = {
  hair: 'atlas_hair_ingest', 'facial-hair': 'atlas_facial-hair_ingest', headwear: 'atlas_headwear_ingest',
  outfit: 'atlas_outfit_ingest', pants: 'atlas_pants_ingest', shoes: 'atlas_shoes_ingest', accessories: 'atlas_accessories_ingest',
};

function slugify(base) {
  return base
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function displayNameFrom(base) {
  const stem = base.replace(/\.[^.]+$/, '');
  return stem.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function ingestBase() {
  const dir = path.join(INCOMING, 'base');
  if (!fs.existsSync(dir)) return { count: 0 };
  const files = fs.readdirSync(dir).filter((f) => /\.(png)$/i.test(f));
  fs.mkdirSync(BASES_OUT, { recursive: true });
  let count = 0;
  for (const f of files) {
    const slug = slugify(f);
    // Accept either "base_skin_fair.png" style or a bare tone name like "fair.png".
    const outName = slug.startsWith('base_skin_') ? `${slug}.png` : `base_skin_${slug}.png`;
    const meta = await sharp(path.join(dir, f)).metadata();
    if (!meta.hasAlpha) {
      console.warn(`WARN  ${f}: no alpha channel — must be a transparent PNG. Skipped.`);
      continue;
    }
    fs.copyFileSync(path.join(dir, f), path.join(BASES_OUT, outName));
    console.log('OK    base ->', outName, `(${meta.width}x${meta.height})`);
    count++;
  }
  return { count };
}

/** Packs all PNGs for one category into a single grid atlas + TexturePacker JSON. */
async function packCategory(category) {
  const dir = path.join(INCOMING, category);
  if (!fs.existsSync(dir)) return { count: 0 };
  const files = fs.readdirSync(dir).filter((f) => /\.(png)$/i.test(f));
  if (files.length === 0) return { count: 0 };

  const items = [];
  for (const f of files) {
    const meta = await sharp(path.join(dir, f)).metadata();
    if (!meta.hasAlpha) {
      console.warn(`WARN  ${f}: no alpha channel — must be a transparent PNG. Skipped.`);
      continue;
    }
    const slug = slugify(f);
    const id = slug.startsWith(`${category.replace('-', '')}_`) || slug.startsWith(`${category}_`) ? slug : `${category.replace(/-/g, '')}_${slug}`;
    items.push({ file: f, id, width: meta.width, height: meta.height, displayName: displayNameFrom(f) });
  }
  if (items.length === 0) return { count: 0 };

  // Uniform grid cell sized to the largest source image, 2px padding.
  const cellW = Math.max(...items.map((i) => i.width)) + 4;
  const cellH = Math.max(...items.map((i) => i.height)) + 4;
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / cols);
  const atlasW = cols * cellW;
  const atlasH = rows * cellH;

  const composites = [];
  const frames = {};
  items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * cellW + 2;
    const y = row * cellH + 2;
    composites.push({ input: path.join(dir, item.file), left: x, top: y });
    frames[item.id] = {
      frame: { x, y, w: item.width, h: item.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height },
      sourceSize: { w: item.width, h: item.height },
      anchor: { x: 0.5, y: 0.5 },
    };
  });

  const atlasKey = ATLAS_KEY_BY_CATEGORY[category] ?? `atlas_${category}_ingest`;
  // Hard safety guard — this function fully OVERWRITES whatever atlasKey
  // resolves to. Never let it target a canonical (non-"_ingest") atlas
  // name, no matter how ATLAS_KEY_BY_CATEGORY gets edited later.
  if (!atlasKey.endsWith('_ingest')) {
    throw new Error(`refusing to pack into "${atlasKey}" — ingest atlas names must end in "_ingest" to avoid overwriting a canonical atlas`);
  }
  const pngName = `${atlasKey}.png`;
  fs.mkdirSync(ATLASES_DIR, { recursive: true });
  await sharp({ create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toFile(path.join(ATLASES_DIR, pngName));

  const atlasJson = {
    meta: { app: 'rugtown-pipeline-ingest', version: '1', image: pngName, size: { w: atlasW, h: atlasH }, scale: '1' },
    frames,
  };
  fs.writeFileSync(path.join(ATLASES_DIR, `${atlasKey}.json`), JSON.stringify(atlasJson, null, 2));
  console.log(`OK    packed ${items.length} ${category} frame(s) -> ${pngName} (${atlasW}x${atlasH})`);

  return { count: items.length, items, atlasKey };
}

function upsertMetadata(category, items, atlasKey) {
  const metadata = fs.existsSync(METADATA_PATH) ? JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8')) : [];
  const byId = new Map(metadata.map((m) => [m.id, m]));
  for (const item of items) {
    byId.set(item.id, {
      id: item.id,
      displayName: item.displayName,
      category,
      slot: category,
      district: null,
      compatibleGender: 'any',
      playerUsable: true,
      npcOnly: false,
      rarity: 'common',
      theme: null,
      atlas: atlasKey,
      frame: item.id,
      anchorX: 0.5,
      anchorY: 0.5,
      canvasSize: Math.max(item.width, item.height),
      sourceSheet: 'ingest-character-art',
      version: 1,
      requiresReview: false,
    });
  }
  fs.writeFileSync(METADATA_PATH, JSON.stringify([...byId.values()], null, 2));
}

async function main() {
  console.log('=== Character art ingest ===\n');
  if (!fs.existsSync(INCOMING)) {
    console.error('FAIL  no incoming/ folder found at', INCOMING);
    process.exit(1);
  }

  const baseResult = await ingestBase();

  let totalPacked = 0;
  for (const category of CATEGORIES) {
    const result = await packCategory(category);
    if (result.count > 0) {
      upsertMetadata(category, result.items, result.atlasKey);
      totalPacked += result.count;
    }
  }

  console.log(`\n${baseResult.count} base body file(s), ${totalPacked} cosmetic frame(s) ingested.`);
  if (baseResult.count === 0 && totalPacked === 0) {
    console.log('Nothing found in rugtown_asset_pipeline/incoming/*. Drop PNGs in there and re-run.');
  } else {
    console.log('Next: npm run assets:characters   (installs + measures + writes the runtime manifest)');
    console.log('Then: npm run qa:character-compose   (generates contact-sheet screenshots to check alignment)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
