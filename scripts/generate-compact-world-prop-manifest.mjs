/**
 * Phase 8D — appends deterministic environment-prop placements to
 * docs/rugtown-world-placement-manifest.json, alongside the 20 landmark
 * placements written by generate-compact-world-placement-manifest.mjs
 * (which MUST run first — this script reads and rewrites that file).
 *
 * Every prop position = canonical landmark anchor (scripts/lib/canonical-
 * world.mjs, same source as WorldObjects.ts) + a hand-authored offset
 * chosen to sit outside that landmark's plaza radius and clear of the
 * road(s) connecting to it. No Math.random — fully deterministic.
 *
 * Uses only real assets from the existing 108-asset library
 * (public/assets/world/{props,nature,park}/*.png), selected via their
 * already-analyzed visible bounds (world-asset-visual-bounds.json).
 *
 * Run: node scripts/generate-compact-world-prop-manifest.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WORLD_W, WORLD_H, landmarkPx, CANONICAL_LANDMARK_IDS } from './lib/canonical-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'rugtown-world-placement-manifest.json');
const VISUAL_BOUNDS = join(ROOT, 'src', 'game', 'data', 'world-asset-visual-bounds.json');

/* ─── Asset pools (real files from the 108-asset library) ─────────────── */
const LIGHT = ['props/street_lamp_01.png', 'props/street_lamp_02.png'];
const PARK_LAMP = ['park/park_lamp_01.png'];
const SEAT = ['park/bench_01.png', 'park/bench_02.png'];
const PARK_SEAT = ['park/park_bench_01.png', 'park/park_bench_02.png'];
const TREE = ['nature/tree_01.png', 'nature/tree_02.png', 'nature/tree_03.png', 'nature/tree_04.png', 'nature/tree_05.png', 'nature/tree_06.png', 'nature/tree_07.png', 'nature/tree_08.png', 'nature/tree_09.png'];
const BUSH = ['nature/bush_01.png', 'nature/bush_02.png', 'nature/bush_03.png', 'nature/bush_04.png', 'nature/bush_05.png'];
const CRATE = ['props/crate_01.png', 'props/crate_02.png', 'props/crate_big_01.png', 'props/crate_stack_01.png', 'props/crate_stack_02.png'];
const BARREL = ['props/barrel_01.png', 'props/barrel_02.png'];
const CART = ['props/cart_01.png'];
const STALL = ['props/market_stall_01.png', 'props/market_stall_02.png', 'props/market_stall_03.png'];
const STATUE = ['props/statue_01.png', 'props/statue_02.png'];
const SIGN = ['props/street_sign_01.png', 'props/street_sign_02.png'];
const FENCE = ['nature/fence_01.png'];
const FLOWER = ['nature/flower_fence.png', 'nature/hanging_vines.png'];
const PLANTER = ['nature/stone_platter_01.png', 'nature/stone_platter_02.png', 'nature/stone_platter_03.png', 'nature/stone_platter_04.png', 'nature/stone_platter_05.png', 'nature/stone_platter_06.png', 'nature/stone_platter_07.png'];
const MAILBOX = ['props/mailbox_01.png'];
const GAZEBO = ['park/park_gazebo_small.png'];

// Deterministic round-robin picker per pool — no Math.random.
function cycler(pool) {
  let i = 0;
  return () => pool[(i++) % pool.length];
}
const pick = {
  light: cycler(LIGHT), parkLamp: cycler(PARK_LAMP), seat: cycler(SEAT), parkSeat: cycler(PARK_SEAT),
  tree: cycler(TREE), bush: cycler(BUSH), crate: cycler(CRATE), barrel: cycler(BARREL),
  cart: cycler(CART), stall: cycler(STALL), statue: cycler(STATUE), sign: cycler(SIGN),
  fence: cycler(FENCE), flower: cycler(FLOWER), planter: cycler(PLANTER), mailbox: cycler(MAILBOX),
  gazebo: cycler(GAZEBO),
};

/** category -> target visible-content box (world px) for scaling. */
const TARGET_SIZE = {
  light: { w: 40, h: 170 }, parkLamp: { w: 40, h: 170 },
  seat: { w: 110, h: 110 }, parkSeat: { w: 130, h: 80 },
  tree: { w: 130, h: 170 }, bush: { w: 90, h: 50 },
  crate: { w: 70, h: 70 }, barrel: { w: 60, h: 60 },
  cart: { w: 140, h: 95 }, stall: { w: 130, h: 140 },
  statue: { w: 70, h: 140 }, sign: { w: 60, h: 160 },
  fence: { w: 160, h: 95 }, flower: { w: 150, h: 60 },
  planter: { w: 90, h: 90 }, mailbox: { w: 60, h: 60 },
  gazebo: { w: 180, h: 140 },
};

/**
 * Decoration clusters — one entry per landmark. Offsets (ox, oy) are
 * hand-placed to clear that landmark's plaza radius plus the road(s)
 * connecting to it (see RoadNetwork.ts ROAD_EDGES for topology); district
 * mood follows the Phase 8D brief (civic / market / financial / creative /
 * park / waterfront). District tiers set density: fountain/bridge = low
 * (keep spawn + bridge route clear), market/park = high, the rest medium.
 */
const CLUSTERS = {
  fountain: [
    { cat: 'statue', ox: 176, oy: 147 },
    { cat: 'planter', ox: -148, oy: 176 },
  ],
  notice: [
    { cat: 'light', ox: 150, oy: 0 },
    { cat: 'seat', ox: -150, oy: 0 },
    { cat: 'sign', ox: 0, oy: -140 },
  ],
  coffee: [
    { cat: 'seat', ox: 107, oy: 90 },
    { cat: 'planter', ox: -48, oy: 132 },
    { cat: 'mailbox', ox: 65, oy: -113 },
  ],
  fame: [
    { cat: 'statue', ox: -51, oy: -141 },
    { cat: 'statue', ox: 51, oy: -141 },
    { cat: 'flower', ox: 0, oy: -170 },
  ],
  government: [
    { cat: 'light', ox: 148, oy: 26 },
    { cat: 'light', ox: -148, oy: 26 },
    { cat: 'fence', ox: 0, oy: 140 },
  ],
  trading_academy: [
    { cat: 'seat', ox: -48, oy: -132 },
    { cat: 'planter', ox: -48, oy: 132 },
    { cat: 'sign', ox: -140, oy: 0 },
  ],
  whale: [
    { cat: 'light', ox: -51, oy: -141 },
    { cat: 'light', ox: 51, oy: -141 },
    { cat: 'statue', ox: 0, oy: -165 },
  ],
  financial_office: [
    { cat: 'light', ox: 0, oy: -140 },
    { cat: 'seat', ox: -44, oy: 122 },
    { cat: 'sign', ox: 90, oy: -90 },
  ],
  holder_bank: [
    { cat: 'planter', ox: 132, oy: -48 },
    { cat: 'seat', ox: 132, oy: 48 },
    { cat: 'sign', ox: 150, oy: 0 },
  ],
  research_observatory: [
    { cat: 'light', ox: 130, oy: 0 },
    { cat: 'light', ox: -130, oy: 0 },
    { cat: 'statue', ox: 0, oy: 130 },
  ],
  market: [
    { cat: 'cart', ox: 51, oy: -141 },
    { cat: 'stall', ox: 115, oy: -96 },
    { cat: 'stall', ox: 148, oy: -26 },
    { cat: 'crate', ox: -51, oy: -141 },
    { cat: 'barrel', ox: 0, oy: -150 },
    { cat: 'crate', ox: 30, oy: -167 },
    { cat: 'stall', ox: 152, oy: -88 },
  ],
  market_shop: [
    { cat: 'crate', ox: 122, oy: -44 },
    { cat: 'barrel', ox: 122, oy: 44 },
    { cat: 'cart', ox: 96, oy: -115 },
    { cat: 'stall', ox: -41, oy: 113 },
    { cat: 'light', ox: 0, oy: -120 },
  ],
  tournament_hall: [
    { cat: 'fence', ox: 132, oy: -48 },
    { cat: 'fence', ox: 132, oy: 48 },
    { cat: 'sign', ox: 170, oy: 0 },
    { cat: 'barrel', ox: 115, oy: -96 },
    { cat: 'crate', ox: 115, oy: 96 },
  ],
  arena: [
    { cat: 'fence', ox: 100, oy: 173 },
    { cat: 'fence', ox: -100, oy: 173 },
    { cat: 'statue', ox: 0, oy: 230 },
    { cat: 'barrel', ox: 187, oy: -33 },
    { cat: 'crate', ox: -187, oy: 33 },
  ],
  alpha: [
    { cat: 'light', ox: -51, oy: -141 },
    { cat: 'planter', ox: -130, oy: -75 },
    { cat: 'seat', ox: -150, oy: 0 },
  ],
  nft_gallery: [
    { cat: 'statue', ox: 140, oy: 0 },
    { cat: 'planter', ox: -44, oy: 122 },
    { cat: 'seat', ox: -132, oy: 48 },
  ],
  nft_creator_studio: [
    { cat: 'flower', ox: 23, oy: -128 },
    { cat: 'statue', ox: 0, oy: 130 },
    { cat: 'planter', ox: -84, oy: 100 },
  ],
  park: [
    { cat: 'tree', ox: 0, oy: -150 },
    { cat: 'tree', ox: -55, oy: -150 },
    { cat: 'bush', ox: 55, oy: -150 },
    { cat: 'parkSeat', ox: 0, oy: 150 },
    { cat: 'tree', ox: 55, oy: 150 },
    { cat: 'tree', ox: -55, oy: 150 },
    { cat: 'gazebo', ox: 153, oy: 129 },
    { cat: 'parkLamp', ox: 121, oy: -70 },
  ],
  bridge: [
    { cat: 'light', ox: 0, oy: -150 },
    { cat: 'barrel', ox: 0, oy: 140 },
  ],
  cashback: [
    { cat: 'fence', ox: 60, oy: 164 },
    { cat: 'fence', ox: -60, oy: 164 },
    { cat: 'statue', ox: 0, oy: 195 },
  ],
};

function assetKey(relativePath) {
  return 'world-' + relativePath
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function depthFor(cy) {
  return Math.round((1.12 + (cy / WORLD_H) * 0.52) * 100) / 100;
}

function main() {
  const manifest = JSON.parse(readFileSync(OUT, 'utf8'));
  const bounds = JSON.parse(readFileSync(VISUAL_BOUNDS, 'utf8'));

  const missingLandmarks = CANONICAL_LANDMARK_IDS.filter((id) => !CLUSTERS[id]);
  if (missingLandmarks.length) {
    throw new Error(`No decoration cluster defined for: ${missingLandmarks.join(', ')}`);
  }

  const propPlacements = [];
  let assetIndex = 0;

  for (const landmarkId of CANONICAL_LANDMARK_IDS) {
    const anchor = landmarkPx(landmarkId);
    for (const item of CLUSTERS[landmarkId]) {
      const relativePath = pick[item.cat]();
      const key = assetKey(relativePath);
      const vb = bounds.assets[key];
      if (!vb || !vb.ok) throw new Error(`Missing/invalid visual bounds for prop "${key}" (landmark "${landmarkId}")`);

      const target = TARGET_SIZE[item.cat];
      const rawScale = Math.min(target.w / vb.visibleWidth, target.h / vb.visibleHeight);
      const scale = Math.floor(rawScale * 100) / 100;
      const footprintW = Math.round(vb.visibleWidth * scale);
      const footprintH = Math.round(vb.visibleHeight * scale);

      const x = anchor.x + item.ox;
      const y = anchor.y + item.oy;

      // Clearance check — prop ground point must sit outside the
      // landmark's plaza radius (Task 6/11 exclusion zone requirement).
      const distFromAnchor = Math.hypot(item.ox, item.oy);
      if (distFromAnchor < anchor.plaza) {
        console.warn(`⚠️  ${landmarkId}/${item.cat} at offset (${item.ox},${item.oy}) is inside the plaza radius (${anchor.plaza}px)`);
      }

      assetIndex += 1;
      propPlacements.push({
        assetId: `prop-${String(assetIndex).padStart(3, '0')}`,
        sourceImagePath: relativePath,
        district: landmarkId,
        x,
        y,
        scale,
        depth: depthFor(y),
        collisionType: 'none',
        notes: `Compact-world prop cluster — anchored to WorldObjects "${landmarkId}" (${anchor.x},${anchor.y}), offset (${item.ox},${item.oy}), category "${item.cat}".`,
        kind: 'prop',
        placementType: 'prop',
        footprintPx: { w: footprintW, h: footprintH },
        landmarkId,
      });

      const left = x - footprintW / 2;
      const right = x + footprintW / 2;
      const top = y - footprintH;
      const bottom = y;
      if (left < 0 || right > WORLD_W || top < 0 || bottom > WORLD_H) {
        console.warn(`⚠️  ${landmarkId}/${item.cat} footprint extends outside world bounds: [${left},${top}] - [${right},${bottom}]`);
      }
    }
  }

  // Drop any previously-generated props (idempotent re-run), keep landmarks.
  const landmarkPlacements = manifest.placements.filter((p) => p.kind !== 'prop');
  manifest.placements = [...landmarkPlacements, ...propPlacements];
  manifest.version = '3.1-compact-decoration';
  manifest.status = 'Phase 8D — compact-world landmark + environment-prop placement, derived from canonical WorldObjects anchors';
  manifest.generatedAt = new Date().toISOString();
  manifest.worldWidth = WORLD_W;
  manifest.worldHeight = WORLD_H;
  manifest.coordinateModel = 'canonical-landmark-relative';

  writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${propPlacements.length} prop placements (+ ${landmarkPlacements.length} landmarks kept) → ${OUT}`);
  console.log(`Total placements: ${manifest.placements.length}`);
}

main();
