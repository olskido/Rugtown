/**
 * Phase 8C/8D/8F — lightweight validation for
 * docs/rugtown-world-placement-manifest.json (landmark buildings, Phase 8D
 * environment props, Phase 8F decorative filler buildings). No browser
 * required. Fails the build (non-zero exit) on any error.
 *
 * Checks:
 *  - manifest world size is exactly 3600×2400
 *  - every placement has a valid `placementType` and a known landmark id
 *    where applicable
 *  - all 20 canonical landmarks have exactly one building placement
 *  - no duplicate landmark BUILDING assignments (props/fillers may
 *    legitimately share a landmarkId/district — not a gameplay identity)
 *  - no duplicate assetId or placementId across the whole manifest
 *  - filler buildings never carry a landmarkId and never reuse a
 *    canonical landmark id as their placementId
 *  - every sourceImagePath resolves to a known, valid asset in the
 *    108-asset library's analyzed visual bounds
 *  - resolved footprint stays inside world bounds (kind-aware: 'building'
 *    entries are foundation-centroid anchored, 'prop' entries are
 *    ground-point anchored — see WorldAssetLoader.footprintRect)
 *  - spawn clearance, per-landmark plaza clearance are respected
 *  - filler buildings keep clear of every landmark's plaza, of each
 *    other, and of the road network centerline (approximate)
 *  - scale / coordinates are finite, non-NaN, positive
 *
 * Run: node scripts/validate-world-assets.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  WORLD_W, WORLD_H, ROAD_WIDTH, WORLD_OBJECTS_SNAPSHOT, CANONICAL_LANDMARK_IDS,
  landmarkPx, buildRoadSegments, distanceToNearestRoad,
} from './lib/canonical-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST = join(ROOT, 'docs', 'rugtown-world-placement-manifest.json');
const VISUAL_BOUNDS = join(ROOT, 'src', 'game', 'data', 'world-asset-visual-bounds.json');

const VALID_PLACEMENT_TYPES = new Set(['landmark', 'prop', 'filler_building']);

// Spring Water must stay visually clear — nothing may sit closer than its
// own plaza radius (per Task 6: exclusion zone around the spawn point).
const SPAWN_CLEARANCE_PX = WORLD_OBJECTS_SNAPSHOT.fountain.plaza;
const FILLER_CLEARANCE_MARGIN = 20; // slightly looser than the generator's own 30px (rounding tolerance)

function assetKey(relativePath) {
  return 'world-' + relativePath
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const bounds = JSON.parse(readFileSync(VISUAL_BOUNDS, 'utf8'));
  const worldW = manifest.worldSize?.width ?? manifest.worldWidth;
  const worldH = manifest.worldSize?.height ?? manifest.worldHeight;
  const errors = [];
  const warnings = [];

  if (worldW !== WORLD_W || worldH !== WORLD_H) {
    errors.push(`Expected world size ${WORLD_W}×${WORLD_H}, manifest declares ${worldW}×${worldH}`);
  }

  const landmarkPositions = CANONICAL_LANDMARK_IDS.map((id) => ({ id, ...landmarkPx(id) }));
  const roadSegments = buildRoadSegments();

  const seenAssetIds = new Set();
  const seenPlacementIds = new Set();
  const seenBuildingLandmarks = new Map();
  const propCounts = {};
  const fillers = []; // { tag, x, y, halfW }

  for (const p of manifest.placements) {
    const tag = `${p.assetId} (${p.landmarkId ?? p.placementId ?? 'no-id'})`;

    if (seenAssetIds.has(p.assetId)) errors.push(`Duplicate assetId "${p.assetId}"`);
    seenAssetIds.add(p.assetId);

    if (!p.placementType || !VALID_PLACEMENT_TYPES.has(p.placementType)) {
      errors.push(`${tag}: invalid or missing placementType "${p.placementType}"`);
    }

    if (p.landmarkId && !CANONICAL_LANDMARK_IDS.includes(p.landmarkId)) {
      errors.push(`Unknown landmark id "${p.landmarkId}" (${p.assetId})`);
    }

    if (p.placementType === 'landmark') {
      if (!p.landmarkId) {
        errors.push(`Landmark placement "${p.assetId}" has no landmarkId`);
      } else if (seenBuildingLandmarks.has(p.landmarkId)) {
        errors.push(`Duplicate BUILDING assignment for landmark "${p.landmarkId}": ${seenBuildingLandmarks.get(p.landmarkId)} and ${p.assetId}`);
      } else {
        seenBuildingLandmarks.set(p.landmarkId, p.assetId);
      }
    } else if (p.placementType === 'prop') {
      if (p.landmarkId) propCounts[p.landmarkId] = (propCounts[p.landmarkId] ?? 0) + 1;
    } else if (p.placementType === 'filler_building') {
      if (p.landmarkId) {
        errors.push(`${tag}: filler buildings must not carry a landmarkId (found "${p.landmarkId}")`);
      }
      if (!p.placementId || !/^filler_[a-z0-9_]+$/.test(p.placementId)) {
        errors.push(`${tag}: filler building has an invalid/missing placementId "${p.placementId}"`);
      } else {
        if (CANONICAL_LANDMARK_IDS.includes(p.placementId)) {
          errors.push(`${tag}: filler placementId "${p.placementId}" collides with a canonical landmark id`);
        }
        if (seenPlacementIds.has(p.placementId)) {
          errors.push(`Duplicate filler placementId "${p.placementId}"`);
        }
        seenPlacementIds.add(p.placementId);
      }
    }

    const key = assetKey(p.sourceImagePath);
    const vb = bounds.assets[key];
    if (!vb || vb.ok === false) {
      errors.push(`${tag}: sourceImagePath "${p.sourceImagePath}" has no valid entry in world-asset-visual-bounds.json (key "${key}")`);
    }

    for (const [field, val] of [['x', p.x], ['y', p.y], ['scale', p.scale]]) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        errors.push(`${tag}: field "${field}" is not a finite number (${val})`);
      }
    }
    if (typeof p.scale === 'number' && p.scale <= 0) {
      errors.push(`${tag}: scale must be positive (${p.scale})`);
    }

    let footprintW = 0, footprintH = 0, hasFootprint = false;
    if (p.footprintPx) {
      const { w, h } = p.footprintPx;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        errors.push(`${tag}: invalid footprintPx (${w}x${h})`);
      } else if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        hasFootprint = true;
        footprintW = w;
        footprintH = h;
        // kind:'building' is foundation-centroid anchored (loader shifts y
        // by +h/2 before rendering bottom-center); kind:'prop' anchors the
        // ground point directly at y. See WorldAssetLoader.footprintRect.
        const top = p.kind === 'building' ? p.y - h / 2 : p.y - h;
        const bottom = p.kind === 'building' ? p.y + h / 2 : p.y;
        const left = p.x - w / 2;
        const right = p.x + w / 2;
        if (left < 0 || right > worldW || top < 0 || bottom > worldH) {
          warnings.push(`${tag}: footprint [${left.toFixed(0)},${top.toFixed(0)}]–[${right.toFixed(0)},${bottom.toFixed(0)}] extends outside world bounds 0..${worldW} x 0..${worldH}`);
        }
      }
    }

    // Exclusion zones: nothing but the fountain's own building may sit
    // inside Spring Water's plaza clearance.
    if (p.assetId !== seenBuildingLandmarks.get('fountain') && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const fountain = landmarkPx('fountain');
      const distFromSpawn = Math.hypot(p.x - fountain.x, p.y - fountain.y);
      if (distFromSpawn < SPAWN_CLEARANCE_PX) {
        errors.push(`${tag}: sits ${distFromSpawn.toFixed(0)}px from Spring Water — inside the ${SPAWN_CLEARANCE_PX}px spawn clearance`);
      }
    }

    // Props must clear their own landmark's plaza radius.
    if (p.placementType === 'prop' && p.landmarkId && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const anchor = landmarkPx(p.landmarkId);
      const dist = Math.hypot(p.x - anchor.x, p.y - anchor.y);
      if (dist < anchor.plaza) {
        errors.push(`${tag}: sits ${dist.toFixed(0)}px from "${p.landmarkId}" — inside its ${anchor.plaza}px plaza radius`);
      }
    }

    // Filler buildings: track for pairwise + road checks below, and check
    // clearance against EVERY landmark's plaza (not just one owner).
    if (p.placementType === 'filler_building' && hasFootprint && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const halfW = footprintW / 2;
      for (const lm of landmarkPositions) {
        const dist = Math.hypot(p.x - lm.x, p.y - lm.y);
        const needed = lm.plaza + halfW + FILLER_CLEARANCE_MARGIN;
        if (dist < needed) {
          errors.push(`${tag}: only ${dist.toFixed(0)}px from landmark "${lm.id}" plaza (need ${needed.toFixed(0)}px)`);
        }
      }
      const roadDist = distanceToNearestRoad(p.x, p.y, roadSegments);
      const roadNeeded = ROAD_WIDTH / 2 + halfW * 0.6 + FILLER_CLEARANCE_MARGIN;
      if (roadDist < roadNeeded) {
        warnings.push(`${tag}: only ${roadDist.toFixed(0)}px from a road centerline (need ~${roadNeeded.toFixed(0)}px)`);
      }
      fillers.push({ tag, x: p.x, y: p.y, halfW });
    }
  }

  for (let i = 0; i < fillers.length; i++) {
    for (let j = i + 1; j < fillers.length; j++) {
      const a = fillers[i], b = fillers[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const needed = a.halfW + b.halfW + FILLER_CLEARANCE_MARGIN;
      if (dist < needed) {
        errors.push(`Filler overlap: "${a.tag}" and "${b.tag}" are ${dist.toFixed(0)}px apart (need ${needed.toFixed(0)}px)`);
      }
    }
  }

  const missingBuildings = CANONICAL_LANDMARK_IDS.filter((id) => !seenBuildingLandmarks.has(id));
  if (missingBuildings.length) {
    errors.push(`Missing canonical landmark buildings in placement manifest: ${missingBuildings.join(', ')}`);
  }
  if (seenBuildingLandmarks.size !== 20) {
    errors.push(`Expected exactly 20 canonical landmarks, found ${seenBuildingLandmarks.size}`);
  }

  const propTotal = Object.values(propCounts).reduce((a, b) => a + b, 0);
  if (propTotal > 0 && (propTotal < 40 || propTotal > 150)) {
    warnings.push(`Prop count ${propTotal} is outside the recommended ~70-120 range (performance / density guidance).`);
  }
  if (fillers.length > 0 && (fillers.length < 18 || fillers.length > 32)) {
    warnings.push(`Filler building count ${fillers.length} is outside the recommended ~18-32 range.`);
  }

  for (const w of warnings) console.warn('⚠️  ' + w);
  if (errors.length) {
    console.error(`\n❌ world-asset placement validation FAILED (${errors.length} error(s)):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  console.log(`✅ world-asset placement validation passed — ${manifest.placements.length} placements (${seenBuildingLandmarks.size} landmarks, ${propTotal} props, ${fillers.length} filler buildings), world ${worldW}×${worldH}.`);
}

main();
