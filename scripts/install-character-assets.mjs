/**
 * Audit + install RugTown character atlases from rugtown_asset_pipeline.
 * Mode: deterministic, fail-loud. Does not load from pipeline at runtime.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { analyzeAtlasDirectory, analyzeSingleImage } from './lib/character-bounds-analysis.mjs';
import { baseBodySvg, outfitSvg, OUTFIT_DEFS, BODY_CANVAS_W, BODY_CANVAS_H } from './lib/character-body-art.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PIPELINE = path.join(ROOT, 'rugtown_asset_pipeline');
const OUT = path.join(ROOT, 'public', 'assets', 'characters');
const DOCS = path.join(ROOT, 'docs', 'character-system');

/** Phase 11C — the old 'mannequin_v1' name predates the bitmap cutover
 *  and reads as if the system were still the placeholder mannequin.
 *  compatibilityGroup is manifest/creator metadata only — it is never
 *  written into a saved CharacterAppearanceV1 (which stores asset IDs),
 *  so renaming it needs no save-data migration. */
const COMPATIBILITY_GROUP_NAME = 'bitmap_citizen_v1';

const errors = [];
const BASE_IDS = ['base_skin_fair', 'base_skin_light', 'base_skin_medium', 'base_skin_tan', 'base_skin_deep', 'base_skin_dark'];
function fail(m) { errors.push(m); console.error('FAIL', m); }
function ok(m) { console.log('OK ', m); }

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Map frame name → { atlasKey, jsonFile, pngFile, frame } */
function buildFrameIndex(atlasesDir) {
  const index = new Map();
  const files = fs.readdirSync(atlasesDir).filter((f) => f.endsWith('.json'));
  for (const jsonFile of files) {
    const jsonPath = path.join(atlasesDir, jsonFile);
    const data = readJson(jsonPath);
    const pngFile = data.meta?.image;
    if (!pngFile) {
      fail(`${jsonFile}: missing meta.image`);
      continue;
    }
    const pngPath = path.join(atlasesDir, pngFile);
    if (!fs.existsSync(pngPath)) {
      fail(`${jsonFile}: missing PNG ${pngFile}`);
      continue;
    }
    const atlasKey = jsonFile.replace(/\.json$/, '');
    const imgW = data.meta.size?.w ?? 0;
    const imgH = data.meta.size?.h ?? 0;
    for (const [name, entry] of Object.entries(data.frames || {})) {
      const fr = entry.frame;
      if (!fr || fr.w <= 0 || fr.h <= 0) {
        fail(`${atlasKey}: bad frame ${name}`);
        continue;
      }
      if (fr.x + fr.w > imgW + 1 || fr.y + fr.h > imgH + 1) {
        fail(`${atlasKey}: frame OOB ${name}`);
        continue;
      }
      if (index.has(name)) {
        fail(`duplicate frame name ${name}`);
        continue;
      }
      index.set(name, { atlasKey, jsonFile, pngFile, frame: fr, size: { w: imgW, h: imgH } });
    }
    ok(`atlas ${atlasKey}: ${Object.keys(data.frames).length} frames`);
  }
  return index;
}

async function generateBaseBodies(outBases) {
  ensureDir(outBases);
  // Phase 13 — bare-skin bodies (real anatomy: shoulders, neck, tapered
  // torso, readable hands, boots) in a fitted neutral undergarment.
  // Clothing is no longer baked in — see generateOutfits() below and the
  // new 'outfit' layer (Phase 12).
  const bases = [
    { id: 'base_skin_fair', skin: '#e8c4a0', skinShadow: '#c9a17a' },
    { id: 'base_skin_light', skin: '#d4a878', skinShadow: '#b0824f' },
    { id: 'base_skin_medium', skin: '#b88458', skinShadow: '#8f6440' },
    { id: 'base_skin_tan', skin: '#9a6a40', skinShadow: '#754e2e' },
    { id: 'base_skin_deep', skin: '#6b4428', skinShadow: '#4d3019' },
    { id: 'base_skin_dark', skin: '#3e2818', skinShadow: '#2a1a0f' },
  ];
  const W = BODY_CANVAS_W;
  const H = BODY_CANVAS_H;
  const entries = [];
  for (const b of bases) {
    const out = path.join(outBases, `${b.id}.png`);
    // ingest-character-art.mjs copies real user-supplied art straight
    // into this same path. Real art will not be exactly WxH (this
    // generator's fixed size), so detect and preserve it instead of
    // clobbering it with the procedural placeholder on every install run.
    let isRealArt = false;
    if (fs.existsSync(out)) {
      const existingMeta = await sharp(out).metadata();
      isRealArt = existingMeta.width !== W || existingMeta.height !== H;
    }
    let width = W, height = H;
    if (isRealArt) {
      const existingMeta = await sharp(out).metadata();
      width = existingMeta.width;
      height = existingMeta.height;
      ok(`base ${b.id}: using real art (${width}x${height}), not regenerating placeholder`);
    } else {
      const svg = baseBodySvg(b.skin, b.skinShadow);
      await sharp(Buffer.from(svg)).png().toFile(out);
    }
    // Phase 11C — measure the real visible bounds of this body instead
    // of assuming frame == visible content.
    const bounds = await analyzeSingleImage(out);
    entries.push({
      id: b.id,
      category: 'base',
      slot: 'base',
      atlasKey: null,
      textureKey: `char-base-${b.id}`,
      frame: null,
      imagePath: `bases/${b.id}.png`,
      width,
      height,
      anchorX: 0.5,
      anchorY: 1,
      playerUsable: true,
      npcOnly: false,
      directions: ['down'],
      states: ['idle', 'walk'],
      layerOrder: 10,
      creatorVisible: true,
      creatorEnabled: true,
      alignmentStatus: 'ok',
      compatibilityGroup: COMPATIBILITY_GROUP_NAME,
      compatibleBaseIds: BASE_IDS,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      visibleWidth: bounds.ok ? bounds.visible.w : undefined,
      visibleHeight: bounds.ok ? bounds.visible.h : undefined,
      offsetXFrac: bounds.ok ? bounds.offsetFromFrameCenterXFrac : undefined,
      offsetYFrac: bounds.ok ? bounds.offsetFromFrameCenterYFrac : undefined,
      mirrorSafe: bounds.ok ? bounds.mirrorSafe : true,
      requiresReview: false,
      accepted: true,
    });
  }
  ok(`generated ${entries.length} bitmap base bodies`);
  return entries;
}

/** Phase 13 — real, distinct outfit silhouettes (not recolors) for the
 *  'outfit' layer wired up in Phase 12. Same real-art-preservation
 *  pattern as generateBaseBodies(): a user-supplied outfit PNG of a
 *  different size at the same path is preserved, not overwritten. */
async function generateOutfits(outOutfits) {
  ensureDir(outOutfits);
  const W = BODY_CANVAS_W, H = BODY_CANVAS_H;
  const entries = [];
  for (const [id, def] of Object.entries(OUTFIT_DEFS)) {
    const out = path.join(outOutfits, `${id}.png`);
    let isRealArt = false;
    if (fs.existsSync(out)) {
      const existingMeta = await sharp(out).metadata();
      isRealArt = existingMeta.width !== W || existingMeta.height !== H;
    }
    if (isRealArt) {
      ok(`outfit ${id}: using real art, not regenerating placeholder`);
    } else {
      await sharp(Buffer.from(outfitSvg(id))).png().toFile(out);
    }
    const bounds = await analyzeSingleImage(out);
    entries.push({
      id,
      category: 'outfit',
      slot: 'outfit',
      atlasKey: null,
      textureKey: `char-outfit-${id}`,
      frame: null,
      imagePath: `outfits/${id}.png`,
      width: bounds.ok ? bounds.frame.w : W,
      height: bounds.ok ? bounds.frame.h : H,
      anchorX: 0.5,
      anchorY: 1,
      playerUsable: true,
      npcOnly: false,
      directions: ['down'],
      states: ['idle', 'walk'],
      layerOrder: 15,
      creatorVisible: true,
      creatorEnabled: true,
      alignmentStatus: 'ok',
      compatibilityGroup: COMPATIBILITY_GROUP_NAME,
      compatibleBaseIds: BASE_IDS,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      visibleWidth: bounds.ok ? bounds.visible.w : undefined,
      visibleHeight: bounds.ok ? bounds.visible.h : undefined,
      offsetXFrac: bounds.ok ? bounds.offsetFromFrameCenterXFrac : undefined,
      offsetYFrac: bounds.ok ? bounds.offsetFromFrameCenterYFrac : undefined,
      mirrorSafe: bounds.ok ? bounds.mirrorSafe : true,
      requiresReview: false,
      accepted: true,
      displayName: def.displayName,
    });
  }
  ok(`generated ${entries.length} outfits`);
  return entries;
}

async function main() {
  console.log('=== Character asset audit + install ===\n');
  if (!fs.existsSync(PIPELINE)) {
    fail(`pipeline missing: ${PIPELINE}`);
    process.exit(1);
  }

  const metadata = readJson(path.join(PIPELINE, 'metadata_assets.json'));
  const atlasesDir = path.join(PIPELINE, 'atlases');
  const frameIndex = buildFrameIndex(atlasesDir);

  // Phase 11C — real, measured visible-bounds per frame (replaces the old
  // blanket per-category offset/scale heuristic below). See
  // scripts/lib/character-bounds-analysis.mjs and Task 6.
  console.log('measuring visible bounds for all atlas frames...');
  const boundsIndex = await analyzeAtlasDirectory(atlasesDir);
  ok(`measured ${boundsIndex.size} frame(s)`);

  const reviewIds = new Set(metadata.filter((x) => x.requiresReview).map((x) => x.id));
  let qaDupes = new Set();
  try {
    const qa = readJson(path.join(PIPELINE, 'qa', 'qa_report.json'));
    // Prefer keeping first occurrence; mark later texture dupes rejected when ids listed
    if (Array.isArray(qa.duplicate_textures)) {
      for (const row of qa.duplicate_textures) {
        if (typeof row === 'string') qaDupes.add(row);
        else if (row?.discard) qaDupes.add(row.discard);
        else if (Array.isArray(row)) row.slice(1).forEach((id) => qaDupes.add(id));
      }
    }
  } catch {
    ok('qa_report optional parse skipped');
  }

  const audit = {
    generatedAt: new Date().toISOString(),
    pipelineRoot: 'rugtown_asset_pipeline',
    totalMetadata: metadata.length,
    atlases: [],
    assets: [],
    summary: {
      accepted: 0,
      rejected: 0,
      categories: {},
      notes: [
        'Pipeline assets are static single frames (no directional walk cycles).',
        'Modular cosmetics require generated base bodies (install-time bitmaps).',
        'NPC category uses complete full-body sprites.',
        'Atlas metadata atlas field may be split (_1/_2); resolved via frame index.',
      ],
    },
  };

  for (const jsonFile of fs.readdirSync(atlasesDir).filter((f) => f.endsWith('.json'))) {
    const j = readJson(path.join(atlasesDir, jsonFile));
    audit.atlases.push({
      id: jsonFile.replace(/\.json$/, ''),
      png: j.meta.image,
      frameCount: Object.keys(j.frames).length,
      size: j.meta.size,
      accepted: true,
    });
  }

  const registryAssets = [];
  let pantsSeen = 0;
  let necklaceAccessoriesSeen = 0;
  // Phase 12 — outfit layer (separate clothing over the bare base body).
  let outfitsSeen = 0;

  for (const item of metadata) {
    const cat = item.category;
    audit.summary.categories[cat] = (audit.summary.categories[cat] || 0) + 1;
    const frameMeta = frameIndex.get(item.frame || item.id);
    let accepted = true;
    let reason = null;
    if (!frameMeta) {
      accepted = false;
      reason = 'frame not found in any atlas JSON';
    } else if (reviewIds.has(item.id)) {
      accepted = false;
      reason = 'requiresReview / manual cleanup';
    } else if (qaDupes.has(item.id)) {
      accepted = false;
      reason = 'duplicate texture (qa)';
    }

    if (cat === 'pants') pantsSeen++;
    if (cat === 'outfit') outfitsSeen++;
    const isHeadCategory = ['hair', 'facial-hair', 'headwear'].includes(cat);
    const necklaceLike = cat === 'accessories' && /necklace|pendant|chain/i.test(`${item.id} ${item.displayName || ''}`);
    if (necklaceLike) necklaceAccessoriesSeen++;
    // Phase 11C — real measured visible-content bounds for this exact
    // frame, keyed by the same frame name used to resolve frameMeta.
    const measured = boundsIndex.get(item.frame || item.id);
    const measuredFields = measured?.ok ? {
      visibleWidth: measured.visible.w,
      visibleHeight: measured.visible.h,
      offsetXFrac: measured.offsetFromFrameCenterXFrac,
      offsetYFrac: measured.offsetFromFrameCenterYFrac,
      mirrorSafe: measured.mirrorSafe,
    } : { mirrorSafe: true };
    // Phase 11C — some source frames pack TWO reference views (a front
    // view + a 3/4 side view) into one frame — e.g. headwear_dad_cap_01
    // literally contains two drawings of the cap. Rendered as a single
    // asset this composes as "two heads". Detected via connected-
    // component analysis (character-bounds-analysis.mjs); such assets
    // are excluded from the creator until the source frame is re-cropped
    // to one view — this is a source-art defect, not something the
    // placement/scale fix below can correct.
    const multiRegionDefect = !!measured?.multiRegion;

    // Phase 11C — categories that are creator-enabled now compose from
    // REAL measured visible bounds (see boundsIndex below), so they are
    // promoted from 'approximate' to 'ok'. Shoes/accessories stay
    // 'incompatible' — that status reflects a STYLE mismatch (isometric
    // crops vs the mannequin's front view, per phase11b-notes.md), not a
    // measurement gap this pass fixes; out of scope to re-enable them.
    const alignmentStatus = multiRegionDefect ? 'incompatible' :
      cat === 'npcs' ? 'ok' :
      ['hair', 'facial-hair', 'headwear', 'pants', 'outfit'].includes(cat) ? 'ok' :
      ['shoes', 'accessories'].includes(cat) ? 'incompatible' : 'ok';
    const creatorEnabled = !multiRegionDefect && accepted && !!item.playerUsable
      && (isHeadCategory || (cat === 'pants' && pantsSeen <= 8)
        || (cat === 'outfit' && outfitsSeen <= 12)
        || (necklaceLike && necklaceAccessoriesSeen <= 3));
    // Old provisional per-category foot-relative offsets — kept only for
    // any legacy reader; BitmapCharacterLayout.ts no longer applies these
    // to head slots (Phase 11B already disabled that for hair/hat/facial;
    // Phase 11C replaces the *root* scale bug with measured bounds below).
    const categoryPlacement =
      cat === 'pants' ? { offsetX: 0, offsetY: -(8 / 144), scale: 1 } :
      cat === 'shoes' ? { offsetX: 0, offsetY: 0, scale: 1 } :
      cat === 'outfit' ? { offsetX: 0, offsetY: 0, scale: 1 } :
      isHeadCategory ? { offsetX: 0, offsetY: -(88 / 144), scale: 1 } :
      cat === 'accessories' ? { offsetX: 0, offsetY: -(44 / 144), scale: 1 } :
      { offsetX: 0, offsetY: 0, scale: 1 };
    const entry = {
      id: item.id,
      category: cat,
      slot: item.slot || cat,
      atlasKey: frameMeta?.atlasKey ?? null,
      textureKey: frameMeta ? `char-atlas-${frameMeta.atlasKey}` : null,
      frame: item.frame || item.id,
      width: frameMeta?.frame?.w ?? item.canvasSize ?? 0,
      height: frameMeta?.frame?.h ?? item.canvasSize ?? 0,
      anchorX: item.anchorX ?? 0.5,
      anchorY: item.anchorY ?? (cat === 'npcs' ? 1 : 0.5),
      playerUsable: !!item.playerUsable && cat !== 'npcs',
      npcOnly: cat === 'npcs' || !!item.npcOnly,
      // Honest directional metadata: the pipeline only ever produced a
      // single front/"down" frame per asset — no true left/right/up art
      // exists anywhere. Do not claim otherwise. mirrorSafe (measured
      // above) is the separate, real signal the renderer uses to decide
      // whether flipping this frame for 'left' is a valid approximation.
      directions: ['down'],
      states: ['idle', 'walk'],
      layerOrder:
        cat === 'outfit' ? 15 :
        cat === 'pants' ? 20 :
        cat === 'shoes' ? 25 :
        cat === 'hair' ? 40 :
        cat === 'facial-hair' ? 45 :
        cat === 'headwear' ? 50 :
        cat === 'accessories' ? 55 :
        cat === 'npcs' ? 10 : 30,
      creatorVisible: accepted && cat !== 'npcs' && !!item.playerUsable,
      creatorEnabled,
      alignmentStatus,
      compatibilityGroup: isHeadCategory || cat === 'pants' || cat === 'outfit' ? COMPATIBILITY_GROUP_NAME : 'none',
      compatibleBaseIds: creatorEnabled ? BASE_IDS : [],
      ...measuredFields,
      ...categoryPlacement,
      requiresReview: !!item.requiresReview || multiRegionDefect,
      accepted,
      rejectionReason: multiRegionDefect
        ? 'source frame packs multiple reference views (e.g. front + side) into one image — needs re-cropping before it can be creator-enabled'
        : reason,
      displayName: item.displayName || item.id,
      rarity: item.rarity || 'common',
      district: item.district || null,
    };

    audit.assets.push(entry);
    if (accepted) {
      audit.summary.accepted++;
      registryAssets.push(entry);
    } else {
      audit.summary.rejected++;
    }
  }

  // Install directories
  ensureDir(path.join(OUT, 'atlases'));
  ensureDir(path.join(OUT, 'bases'));
  ensureDir(path.join(OUT, 'outfits'));
  ensureDir(path.join(OUT, 'manifests'));
  ensureDir(DOCS);

  // Clear previous installed atlases only
  for (const f of fs.readdirSync(path.join(OUT, 'atlases'))) {
    fs.unlinkSync(path.join(OUT, 'atlases', f));
  }

  // Copy atlases
  for (const f of fs.readdirSync(atlasesDir)) {
    if (!/\.(png|json)$/i.test(f)) continue;
    fs.copyFileSync(path.join(atlasesDir, f), path.join(OUT, 'atlases', f));
  }
  ok('copied atlas PNG+JSON pairs');

  const bases = await generateBaseBodies(path.join(OUT, 'bases'));
  registryAssets.push(...bases);
  audit.summary.accepted += bases.length;

  const outfits = await generateOutfits(path.join(OUT, 'outfits'));
  registryAssets.push(...outfits);
  audit.summary.accepted += outfits.length;

  // Promote a few clean NPCs as optional complete presets (npcOnly remain true for random NPCs)
  const npcPresets = registryAssets.filter((a) => a.category === 'npcs').slice(0, 24);
  for (const n of npcPresets) {
    // keep npcOnly; used for NPC assignment only
  }

  // Phase 11C Task 9 — the previous default (base body only, every slot
  // null) is exactly what read as "a bare temporary mannequin". This is a
  // deliberate starter citizen built from existing, creator-enabled,
  // alignmentStatus:'ok' assets — no new art required. Verified present
  // in registryAssets below (hair_crew_cut_01 / pants_dark_jeans_01).
  // Phase 13 — real outfits now exist; default to the first one
  // (outfit_market_tunic — plain, versatile) rather than a bare body.
  const firstOutfit = registryAssets.find((a) => a.category === 'outfit' && a.creatorEnabled)?.id ?? null;
  const defaultAppearance = {
    version: 1,
    baseId: 'base_skin_light',
    hairId: 'hair_crew_cut_01',
    facialHairId: null,
    headwearId: null,
    outfitId: firstOutfit,
    pantsId: 'pants_dark_jeans_01',
    shoesId: null,
    accessoryIds: [],
  };

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    logicalDisplayHeight: 48,
    defaultAppearance,
    atlases: audit.atlases.map((a) => ({
      id: a.id,
      textureKey: `char-atlas-${a.id}`,
      url: `/assets/characters/atlases/${a.png}`,
      jsonUrl: `/assets/characters/atlases/${a.id}.json`,
      frameCount: a.frameCount,
    })),
    bases: bases.map((b) => ({
      id: b.id,
      textureKey: b.textureKey,
      url: `/assets/characters/${b.imagePath}`,
    })),
    assets: registryAssets,
  };

  fs.writeFileSync(path.join(OUT, 'manifests', 'character_runtime_manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(DOCS, 'asset-audit.json'), JSON.stringify(audit, null, 2));

  // Generated TS mirror for compile-time imports (slim: ids + defaults)
  const ts = `/* AUTO-GENERATED by scripts/install-character-assets.mjs — do not edit */
export const CHARACTER_RUNTIME_MANIFEST_URL = '/assets/characters/manifests/character_runtime_manifest.json' as const;
export const CHARACTER_DEFAULT_APPEARANCE = ${JSON.stringify(defaultAppearance, null, 2)} as const;
export const CHARACTER_ATLAS_KEYS = ${JSON.stringify(manifest.atlases.map((a) => a.textureKey), null, 2)} as const;
export const CHARACTER_BASE_TEXTURES = ${JSON.stringify(manifest.bases, null, 2)} as const;
`;
  ensureDir(path.join(ROOT, 'src', 'game', 'characters', 'assets'));
  fs.writeFileSync(path.join(ROOT, 'src', 'game', 'characters', 'assets', 'generatedCharacterManifest.ts'), ts);

  console.log('\n--- Summary ---');
  console.log('accepted', audit.summary.accepted, 'rejected', audit.summary.rejected);
  console.log('out', OUT);
  if (errors.length) {
    console.error(`${errors.length} error(s)`);
    process.exit(1);
  }
  console.log('install-character-assets OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
