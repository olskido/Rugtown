/**
 * Phase 8F — appends deterministic decorative "filler building" placements
 * (unused residential/commercial structures from the 108-asset library) to
 * docs/rugtown-world-placement-manifest.json, alongside the 20 landmark
 * buildings and 73 environment props. Run AFTER generate-compact-world-
 * placement-manifest.mjs and generate-compact-world-prop-manifest.mjs —
 * this script reads and rewrites that same file.
 *
 * Filler buildings are visual city fabric, NOT gameplay objects: they get
 * no landmarkId, no road node, no interaction, no interior. They render
 * through the same WorldAssetLoader pipeline as landmarks (kind:'building'
 * for correct foundation-centroid anchoring) but are tagged
 * placementType:'filler_building' so every landmarkId-keyed system
 * (interaction, minimap, missions, NPC anchoring) ignores them automatically.
 *
 * Every slot is landmark-relative (offset from a canonical WorldObjects
 * anchor) or, for the two world-edge slots, an explicit absolute position
 * chosen with clearance already checked against every landmark. No
 * Math.random — fully deterministic. Positions are validated against
 * every landmark's plaza radius, the live road-segment geometry, other
 * filler slots, and (loosely) existing props before being written.
 *
 * Run: node scripts/generate-compact-world-filler-buildings.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  WORLD_W, WORLD_H, ROAD_WIDTH, WORLD_OBJECTS_SNAPSHOT, CANONICAL_LANDMARK_IDS,
  landmarkPx, buildRoadSegments, distanceToNearestRoad,
} from './lib/canonical-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'rugtown-world-placement-manifest.json');
const VISUAL_BOUNDS = join(ROOT, 'src', 'game', 'data', 'world-asset-visual-bounds.json');

/* ─── Asset pools (real, currently-unused files from the 108-asset library) */
const RESIDENTIAL = Array.from({ length: 10 }, (_, i) => `residential/residential_tall_${String(i + 1).padStart(2, '0')}.png`);
const COMMERCIAL = Array.from({ length: 12 }, (_, i) => `commercial/commercial_small_${String(i + 1).padStart(2, '0')}.png`);

function cycler(pool) {
  let i = 0;
  return () => pool[(i++) % pool.length];
}
const nextResidential = cycler(RESIDENTIAL);
const nextCommercial = cycler(COMMERCIAL);

/** tier -> target visible-content footprint (world px) + asset pool. */
const TIERS = {
  small: { w: 160, h: 200, pick: nextCommercial },
  medium: { w: 180, h: 300, pick: nextResidential },
  tall: { w: 200, h: 400, pick: nextResidential },
};

function polar(anchor, bearingDeg, radius) {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: Math.round(anchor.x + radius * Math.sin(rad)), y: Math.round(anchor.y - radius * Math.cos(rad)) };
}

/**
 * Slots — hand-authored district composition (Task 6/9/10/11). Each slot
 * is landmark-relative (anchorId + bearing + radius, chosen away from that
 * landmark's known road approach — see RoadNetwork.ts ROAD_EDGES) except
 * the two world-edge slots, which use absolute positions.
 */
const SLOTS = [
  // ── Central Plaza — LOW density, kept well clear of spawn. Anchored off
  //    Spring Water itself, in the gap between the market and bridge
  //    spokes, well outside the ring roads. ──
  { id: 'filler_plaza_se_01', anchorId: 'fountain', bearing: 145, radius: 480, tier: 'medium' },

  // ── Government Quarter — MEDIUM, orderly ──
  { id: 'filler_government_east_01', anchorId: 'fame', bearing: 55, radius: 300, tier: 'medium' },
  { id: 'filler_government_west_01', anchorId: 'government', bearing: 270, radius: 260, tier: 'medium' },
  { id: 'filler_government_south_01', anchorId: 'trading_academy', bearing: 180, radius: 250, tier: 'medium' },

  // ── Meme Market — HIGH density, small commercial shops ──
  { id: 'filler_market_north_01', anchorId: 'market', bearing: 340, radius: 270, tier: 'small' },
  { id: 'filler_market_northeast_01', anchorId: 'market', bearing: 25, radius: 270, tier: 'small' },
  { id: 'filler_market_east_01', anchorId: 'market', bearing: 85, radius: 330, tier: 'small' },
  { id: 'filler_market_shop_north_01', anchorId: 'market_shop', bearing: 75, radius: 260, tier: 'small' },
  { id: 'filler_market_shop_east_01', anchorId: 'market_shop', bearing: 120, radius: 270, tier: 'small' },

  // ── Financial / Trading — MEDIUM-HIGH, taller skyline ──
  { id: 'filler_financial_whale_north_01', anchorId: 'whale', bearing: 310, radius: 300, tier: 'tall' },
  { id: 'filler_financial_office_north_01', anchorId: 'financial_office', bearing: 320, radius: 300, tier: 'tall' },
  { id: 'filler_financial_holder_east_01', anchorId: 'holder_bank', bearing: 70, radius: 280, tier: 'tall' },
  { id: 'filler_financial_observatory_east_01', anchorId: 'research_observatory', bearing: 90, radius: 280, tier: 'tall' },
  { id: 'filler_financial_alpha_west_01', anchorId: 'alpha', bearing: 280, radius: 280, tier: 'medium' },

  // ── NFT / Creator District — MEDIUM ──
  { id: 'filler_nft_gallery_east_01', anchorId: 'nft_gallery', bearing: 90, radius: 270, tier: 'medium' },
  { id: 'filler_nft_studio_south_01', anchorId: 'nft_creator_studio', bearing: 180, radius: 210, tier: 'small' },
  { id: 'filler_nft_studio_west_01', anchorId: 'nft_creator_studio', bearing: 250, radius: 260, tier: 'medium' },

  // ── Arena / Tournament — MEDIUM-LOW, support buildings set back from the
  //    (deliberately wide) entrance approach. ──
  { id: 'filler_arena_east_01', anchorId: 'arena', bearing: 90, radius: 300, tier: 'small' },
  { id: 'filler_tournament_north_01', anchorId: 'tournament_hall', bearing: 80, radius: 300, tier: 'small' },

  // ── Park — VERY LOW, vegetation stays dominant ──
  { id: 'filler_park_edge_01', anchorId: 'park', bearing: 220, radius: 250, tier: 'small' },

  // ── Bridge / Waterfront — LOW, route stays open ──
  { id: 'filler_waterfront_bridge_north_01', anchorId: 'bridge', bearing: 60, radius: 260, tier: 'small' },
  { id: 'filler_waterfront_cashback_south_01', anchorId: 'cashback', bearing: 160, radius: 280, tier: 'small' },

  // ── World Edges — MEDIUM, "the city continues" background silhouettes ──
  { id: 'filler_edge_northwest_01', absolute: { x: 350, y: 900 }, tier: 'tall' },
  { id: 'filler_edge_southeast_01', absolute: { x: 3460, y: 2100 }, tier: 'tall' },
];

const CLEARANCE_MARGIN = 30;

function main() {
  const manifest = JSON.parse(readFileSync(OUT, 'utf8'));
  const bounds = JSON.parse(readFileSync(VISUAL_BOUNDS, 'utf8'));
  const roadSegments = buildRoadSegments();

  const landmarkPositions = CANONICAL_LANDMARK_IDS.map((id) => ({ id, ...landmarkPx(id) }));
  const existingProps = manifest.placements.filter((p) => p.placementType === 'prop' || p.kind === 'prop');
  const placedFillers = []; // { x, y, halfW, halfH }

  const fillerPlacements = [];
  let index = 0;

  for (const slot of SLOTS) {
    const tier = TIERS[slot.tier];
    if (!tier) throw new Error(`Unknown tier "${slot.tier}" for slot "${slot.id}"`);

    if (!/^filler_[a-z0-9_]+$/.test(slot.id)) {
      throw new Error(`Invalid filler placement id "${slot.id}"`);
    }
    if (CANONICAL_LANDMARK_IDS.includes(slot.id)) {
      throw new Error(`Filler id "${slot.id}" collides with a canonical landmark id`);
    }

    const relativePath = tier.pick();
    const key = 'world-' + relativePath.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const vb = bounds.assets[key];
    if (!vb || !vb.ok) throw new Error(`Missing/invalid visual bounds for filler asset "${key}" (slot "${slot.id}")`);

    let pos;
    if (slot.absolute) {
      pos = { x: slot.absolute.x, y: slot.absolute.y };
    } else {
      const anchor = landmarkPx(slot.anchorId);
      pos = polar(anchor, slot.bearing, slot.radius);
    }

    const rawScale = Math.min(tier.w / vb.visibleWidth, tier.h / vb.visibleHeight);
    const scale = Math.floor(rawScale * 100) / 100;
    const footprintW = Math.round(vb.visibleWidth * scale);
    const footprintH = Math.round(vb.visibleHeight * scale);
    const halfW = footprintW / 2;

    // ── Validation (Task 3/4/5) ──
    for (const lm of landmarkPositions) {
      const dist = Math.hypot(pos.x - lm.x, pos.y - lm.y);
      const needed = lm.plaza + halfW + CLEARANCE_MARGIN;
      if (dist < needed) {
        console.warn(`⚠️  ${slot.id}: only ${dist.toFixed(0)}px from landmark "${lm.id ?? '?'}" (need ${needed.toFixed(0)}px) — position (${pos.x},${pos.y})`);
      }
    }
    const roadDist = distanceToNearestRoad(pos.x, pos.y, roadSegments);
    const roadNeeded = ROAD_WIDTH / 2 + halfW * 0.6 + CLEARANCE_MARGIN;
    if (roadDist < roadNeeded) {
      console.warn(`⚠️  ${slot.id}: only ${roadDist.toFixed(0)}px from a road centerline (need ${roadNeeded.toFixed(0)}px)`);
    }
    for (const other of placedFillers) {
      const dist = Math.hypot(pos.x - other.x, pos.y - other.y);
      const needed = halfW + other.halfW + CLEARANCE_MARGIN;
      if (dist < needed) {
        console.warn(`⚠️  ${slot.id}: only ${dist.toFixed(0)}px from filler "${other.id}" (need ${needed.toFixed(0)}px)`);
      }
    }
    for (const prop of existingProps) {
      const dist = Math.hypot(pos.x - prop.x, pos.y - prop.y);
      const propHalfW = (prop.footprintPx?.w ?? 40) / 2;
      const needed = halfW + propHalfW; // props may sit close to a building base; no extra margin
      if (dist < needed * 0.6) { // only flag SIGNIFICANT overlap, per Task 5
        console.warn(`⚠️  ${slot.id}: significant overlap with prop "${prop.assetId}" (${dist.toFixed(0)}px, need ~${needed.toFixed(0)}px)`);
      }
    }
    // kind:'building' entries are foundation-centroid anchored — the
    // loader shifts y by +footprintH/2 before rendering bottom-center, so
    // true bounds are y ± footprintH/2 (see WorldAssetLoader.footprintRect).
    const left = pos.x - footprintW / 2, right = pos.x + footprintW / 2;
    const top = pos.y - footprintH / 2, bottom = pos.y + footprintH / 2;
    if (left < 0 || right > WORLD_W || top < 0 || bottom > WORLD_H) {
      console.warn(`⚠️  ${slot.id}: footprint extends outside world bounds: [${left},${top}] - [${right},${bottom}]`);
    }

    placedFillers.push({ id: slot.id, x: pos.x, y: pos.y, halfW });

    index += 1;
    fillerPlacements.push({
      assetId: `flr-${String(index).padStart(3, '0')}`,
      placementId: slot.id,
      sourceImagePath: relativePath,
      district: slot.anchorId ?? 'edge',
      x: pos.x,
      y: pos.y,
      scale,
      depth: Math.round((1.12 + (pos.y / WORLD_H) * 0.52) * 100) / 100,
      collisionType: 'none',
      notes: `Phase 8F filler building — ${slot.anchorId ? `offset from WorldObjects "${slot.anchorId}" (bearing ${slot.bearing}°, radius ${slot.radius}px)` : 'world-edge absolute position'}, tier "${slot.tier}". Decorative only — no landmarkId, no gameplay identity.`,
      kind: 'building',
      placementType: 'filler_building',
      footprintPx: { w: footprintW, h: footprintH },
      // Intentionally no landmarkId — filler buildings are invisible to
      // every landmarkId-keyed gameplay system.
    });
  }

  // Idempotent re-run: drop any previously-generated fillers, keep landmarks + props.
  const kept = manifest.placements.filter((p) => p.placementType !== 'filler_building');
  manifest.placements = [...kept, ...fillerPlacements];
  manifest.version = '3.2-compact-street-density';
  manifest.status = 'Phase 8F — compact-world landmarks + props + decorative filler buildings, all derived from canonical WorldObjects anchors';
  manifest.generatedAt = new Date().toISOString();
  manifest.landmarkCount = kept.filter((p) => p.placementType === 'landmark').length;
  manifest.propCount = kept.filter((p) => p.placementType === 'prop').length;
  manifest.fillerBuildingCount = fillerPlacements.length;
  manifest.totalPlacementCount = manifest.placements.length;

  writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${fillerPlacements.length} filler buildings (+ ${kept.length} kept) → ${OUT}`);
  console.log(`landmarks=${manifest.landmarkCount} props=${manifest.propCount} filler=${manifest.fillerBuildingCount} total=${manifest.totalPlacementCount}`);
}

main();
