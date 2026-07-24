/**
 * Phase 8C — generates docs/rugtown-world-placement-manifest.json for the
 * compact 3600×2400 world from CANONICAL landmark anchors (WorldObjects.ts),
 * not terrain-art pixel measurements. This is the single authoritative
 * source for landmark geometry — placement is derived from it, never the
 * other way around.
 *
 * Uses the existing 108-asset library (already scaled/alpha-cleaned by
 * generate-world-asset-manifest.mjs) and its analyzed visual bounds
 * (world-asset-visual-bounds.json) so scale/anchor math uses real visible
 * pixel content, not raw canvas size.
 *
 * Geometry comes from scripts/lib/canonical-world.mjs (kept in sync with
 * src/game/world/WorldObjects.ts / RoadNetwork.ts) — the single shared
 * snapshot also used by travel-time-report.mjs and
 * generate-compact-world-prop-manifest.mjs.
 *
 * Run: node scripts/generate-compact-world-placement-manifest.mjs
 *      (then scripts/sync-world-assets.mjs propagates the output, as it
 *      already does automatically in predev/prebuild)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WORLD_W, WORLD_H, WORLD_OBJECTS_SNAPSHOT } from './lib/canonical-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'rugtown-world-placement-manifest.json');
const VISUAL_BOUNDS = join(ROOT, 'src', 'game', 'data', 'world-asset-visual-bounds.json');

// landmarkId -> { relativePath, districtId, targetW, targetH, ox, oy }
// targetW/H: desired visible-content footprint in the compact world (world px).
// ox/oy: small visual offset from the canonical anchor so the sprite doesn't
// sit dead-center on the road node (keeps the plaza/road approach clear).
const PLACEMENTS = {
  fountain: { relativePath: 'landmarks/spawn_fountain.png', district: 'spawn', targetW: 280, targetH: 280, ox: 0, oy: 0 },
  notice: { relativePath: 'landmarks/notice_board.png', district: 'spawn', targetW: 120, targetH: 100, ox: 0, oy: -55 },
  coffee: { relativePath: 'landmarks/coffee_shop.png', district: 'spawn', targetW: 200, targetH: 180, ox: -75, oy: 20 },
  fame: { relativePath: 'landmarks/hall_of_fame.png', district: 'fame', targetW: 300, targetH: 260, ox: 0, oy: 95 },
  government: { relativePath: 'landmarks/government_quarter.png', district: 'spawn', targetW: 240, targetH: 220, ox: 0, oy: 40 },
  trading_academy: { relativePath: 'landmarks/trading_academy.png', district: 'fame', targetW: 220, targetH: 200, ox: -30, oy: 0 },
  whale: { relativePath: 'landmarks/whale_tower.png', district: 'whale', targetW: 200, targetH: 360, ox: 95, oy: 0 },
  financial_office: { relativePath: 'landmarks/financial_office.png', district: 'whale', targetW: 240, targetH: 220, ox: 30, oy: 0 },
  holder_bank: { relativePath: 'landmarks/holder_bank.png', district: 'cashback', targetW: 240, targetH: 220, ox: 30, oy: 0 },
  research_observatory: { relativePath: 'landmarks/research_observatory.png', district: 'whale', targetW: 220, targetH: 220, ox: 0, oy: 30 },
  market: { relativePath: 'landmarks/meme_market_main_hall.png', district: 'market', targetW: 320, targetH: 240, ox: 0, oy: -90 },
  market_shop: { relativePath: 'landmarks/market_shop.png', district: 'market', targetW: 200, targetH: 190, ox: 0, oy: 30 },
  tournament_hall: { relativePath: 'landmarks/tournament_hall.png', district: 'arena', targetW: 280, targetH: 200, ox: 0, oy: 20 },
  arena: { relativePath: 'landmarks/arena.png', district: 'arena', targetW: 310, targetH: 250, ox: 0, oy: -25 },
  alpha: { relativePath: 'landmarks/alpha_lounge.png', district: 'market', targetW: 280, targetH: 220, ox: 0, oy: 75 },
  nft_gallery: { relativePath: 'landmarks/nft_gallery.png', district: 'market', targetW: 260, targetH: 240, ox: 0, oy: 30 },
  nft_creator_studio: { relativePath: 'landmarks/nft_creator_studio.png', district: 'market', targetW: 220, targetH: 220, ox: -20, oy: 20 },
  park: { relativePath: 'landmarks/park_entrance_gate.png', district: 'spawn', targetW: 240, targetH: 160, ox: 0, oy: 70 },
  bridge: { relativePath: 'landmarks/main_bridge.png', district: 'spawn', targetW: 360, targetH: 120, ox: 0, oy: -30 },
  cashback: { relativePath: 'landmarks/cashback_vault.png', district: 'cashback', targetW: 210, targetH: 170, ox: 0, oy: -30 },
};
// main_bridge.png actually lives under the "terrain" category, not "landmarks".
PLACEMENTS.bridge.relativePath = 'terrain/main_bridge.png';

const DOOR_GAP_IDS = new Set(['market', 'alpha', 'fame', 'coffee', 'cashback', 'arena']);
const NONE_COLLISION_IDS = new Set(['fountain', 'notice', 'bridge', 'park']);
function collisionFor(id) {
  if (NONE_COLLISION_IDS.has(id)) return 'none';
  if (DOOR_GAP_IDS.has(id)) return 'door-gap';
  return 'soft-block';
}

function depthFor(cy) {
  return Math.round((1.12 + (cy / WORLD_H) * 0.52) * 100) / 100;
}

function main() {
  const bounds = JSON.parse(readFileSync(VISUAL_BOUNDS, 'utf8'));
  const ids = Object.keys(WORLD_OBJECTS_SNAPSHOT);
  if (ids.length !== 20) throw new Error(`Expected 20 canonical landmarks, got ${ids.length}`);

  const placements = [];
  let assetIndex = 0;
  for (const id of ids) {
    const p = PLACEMENTS[id];
    if (!p) throw new Error(`No placement config for landmark "${id}"`);

    const key = 'world-' + p.relativePath
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const vb = bounds.assets[key];
    if (!vb || !vb.ok) throw new Error(`Missing/invalid visual bounds for "${key}" (landmark "${id}")`);

    const anchor = WORLD_OBJECTS_SNAPSHOT[id];
    const anchorX = Math.round(anchor.x * WORLD_W);
    const anchorY = Math.round(anchor.y * WORLD_H);

    // Letterbox-fit scale, floored so the rendered footprint never exceeds
    // the target box (avoids landmark-vs-landmark overlap at world edges).
    const rawScale = Math.min(p.targetW / vb.visibleWidth, p.targetH / vb.visibleHeight);
    const scale = Math.floor(rawScale * 100) / 100;
    const footprintW = Math.round(vb.visibleWidth * scale);
    const footprintH = Math.round(vb.visibleHeight * scale);

    const x = anchorX + p.ox;
    const y = anchorY + p.oy;

    assetIndex += 1;
    placements.push({
      assetId: `bld-${String(assetIndex).padStart(3, '0')}`,
      sourceImagePath: p.relativePath,
      district: p.district,
      x,
      y,
      scale,
      depth: depthFor(y),
      collisionType: collisionFor(id),
      notes: `Compact-world placement — anchored to WorldObjects "${id}" (${anchorX},${anchorY}), visual offset (${p.ox},${p.oy}).`,
      kind: 'building',
      placementType: 'landmark',
      footprintPx: { w: footprintW, h: footprintH },
      landmarkId: id,
    });

    // World-bounds safety check (Task 9 / success criteria). kind:'building'
    // is foundation-centroid anchored — WorldAssetLoader shifts y by
    // +footprintH/2 before rendering bottom-center, so true bounds are
    // y ± footprintH/2 (see WorldAssetLoader.footprintRect).
    const left = x - footprintW / 2;
    const right = x + footprintW / 2;
    const top = y - footprintH / 2;
    const bottom = y + footprintH / 2;
    if (left < 0 || right > WORLD_W || top < 0 || bottom > WORLD_H) {
      console.warn(`⚠️  ${id} footprint extends outside world bounds: [${left},${top}] - [${right},${bottom}]`);
    }
  }

  const manifest = {
    version: '3.0-compact-world',
    status: 'placed from canonical WorldObjects anchors — Phase 8C compact-world asset re-placement',
    generatedAt: new Date().toISOString(),
    worldSize: { width: WORLD_W, height: WORLD_H },
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    coordinateModel: 'canonical-landmark-relative',
    spawn: { x: Math.round(WORLD_OBJECTS_SNAPSHOT.fountain.x * WORLD_W), y: Math.round(WORLD_OBJECTS_SNAPSHOT.fountain.y * WORLD_H) },
    anchorConvention: 'foundation centroid (x,y) + bottom-center sprite anchor (0.5, 1)',
    coordinateSource: 'src/game/world/WorldObjects.ts fractions × 3600×2400 via scripts/generate-compact-world-placement-manifest.mjs — gameplay architecture is authoritative, not terrain-art measurement',
    roadClearance: {
      collisionLaneWidth: 88,
      visualLaneWidth: 128,
      marginPx: 20,
      rule: 'Road collision from RoadNetwork.ts only; placements anchored to canonical WorldObjects coordinates',
    },
    sources: {
      terrain: 'public/assets/world/RugTown_World_V1_Final.png',
      buildings: 'public/assets/world/landmarks/, public/assets/world/terrain/ (108-asset library)',
      visualBounds: 'src/game/data/world-asset-visual-bounds.json',
    },
    placements,
  };

  writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${placements.length} landmark placements → ${OUT}`);
  console.log(`Spawn / Spring Water: (${manifest.spawn.x}, ${manifest.spawn.y})`);
  for (const p of placements) {
    console.log(`  ${p.landmarkId.padEnd(22)} @ (${p.x},${p.y}) scale=${p.scale} footprint=${p.footprintPx.w}x${p.footprintPx.h} depth=${p.depth}`);
  }
}

main();
