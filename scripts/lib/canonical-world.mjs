/**
 * canonical-world.mjs
 * ────────────────────
 * Shared snapshot of the compact-world gameplay geometry for Node tooling
 * scripts (which cannot cleanly import .ts sources without a build step).
 *
 * SOURCE OF TRUTH: src/game/world/WorldObjects.ts and
 * src/game/world/RoadNetwork.ts. If either changes, update this file too.
 * Consumers: travel-time-report.mjs, generate-compact-world-placement-
 * manifest.mjs, generate-compact-world-prop-manifest.mjs.
 */

export const WORLD_W = 3600;
export const WORLD_H = 2400;
export const PLAYER_SPEED = 252; // px/s cardinal — WorldScene.ts
export const ROAD_WIDTH = 88; // RoadNetwork.ts

// landmarkId -> { x, y, plaza } — fractional position + plaza half-extent (px).
export const WORLD_OBJECTS_SNAPSHOT = {
  fountain: { x: 0.500, y: 0.500, plaza: 165 },
  notice: { x: 0.500, y: 0.342, plaza: 92 },
  coffee: { x: 0.409, y: 0.421, plaza: 92 },
  fame: { x: 0.394, y: 0.160, plaza: 116 },
  government: { x: 0.372, y: 0.308, plaza: 90 },
  trading_academy: { x: 0.193, y: 0.178, plaza: 85 },
  whale: { x: 0.643, y: 0.193, plaza: 112 },
  financial_office: { x: 0.745, y: 0.192, plaza: 95 },
  holder_bank: { x: 0.840, y: 0.263, plaza: 95 },
  research_observatory: { x: 0.840, y: 0.392, plaza: 85 },
  market: { x: 0.750, y: 0.513, plaza: 112 },
  market_shop: { x: 0.810, y: 0.616, plaza: 85 },
  tournament_hall: { x: 0.849, y: 0.756, plaza: 90 },
  arena: { x: 0.811, y: 0.864, plaza: 160 },
  alpha: { x: 0.259, y: 0.597, plaza: 104 },
  nft_gallery: { x: 0.227, y: 0.787, plaza: 100 },
  nft_creator_studio: { x: 0.254, y: 0.868, plaza: 85 },
  park: { x: 0.389, y: 0.859, plaza: 104 },
  bridge: { x: 0.518, y: 0.811, plaza: 100 },
  cashback: { x: 0.459, y: 0.849, plaza: 140 },
};

// [a, b, corner] — corner matches RoadNetwork.ts ROAD_EDGES exactly ('h'
// bends at (bx, ay); 'v' bends at (ax, by)), needed to reconstruct the same
// L-shaped walkable segments buildWalkableRects() draws.
export const ROAD_EDGES = [
  ['fountain', 'notice', 'h'], ['fountain', 'coffee', 'h'], ['fountain', 'fame', 'v'],
  ['fountain', 'whale', 'v'], ['fountain', 'market', 'h'], ['fountain', 'alpha', 'h'],
  ['fountain', 'bridge', 'v'],
  ['notice', 'whale', 'h'], ['whale', 'market', 'v'], ['market', 'arena', 'v'],
  ['arena', 'bridge', 'h'], ['bridge', 'cashback', 'h'], ['cashback', 'park', 'h'],
  ['park', 'alpha', 'v'], ['alpha', 'coffee', 'v'], ['coffee', 'fame', 'v'], ['fame', 'notice', 'h'],
  ['fame', 'government', 'v'], ['fame', 'trading_academy', 'h'],
  ['whale', 'financial_office', 'h'], ['financial_office', 'holder_bank', 'v'],
  ['holder_bank', 'research_observatory', 'v'],
  ['market', 'market_shop', 'v'], ['market_shop', 'tournament_hall', 'v'],
  ['tournament_hall', 'arena', 'h'],
  ['alpha', 'nft_gallery', 'v'], ['nft_gallery', 'nft_creator_studio', 'h'],
  ['park', 'nft_creator_studio', 'h'],
];

export function landmarkPx(id) {
  const n = WORLD_OBJECTS_SNAPSHOT[id];
  if (!n) throw new Error(`canonical-world: unknown landmark "${id}"`);
  return { x: Math.round(n.x * WORLD_W), y: Math.round(n.y * WORLD_H), plaza: n.plaza };
}

export const CANONICAL_LANDMARK_IDS = Object.keys(WORLD_OBJECTS_SNAPSHOT);

/** Axis-aligned road segments (mirrors RoadNetwork.ts buildWalkableRects'
 *  L-shaped corridors) — [x1, y1, x2, y2] pairs, each purely horizontal or
 *  vertical, in world px. */
export function buildRoadSegments() {
  const segs = [];
  for (const [aId, bId, corner] of ROAD_EDGES) {
    const a = landmarkPx(aId);
    const b = landmarkPx(bId);
    const mid = corner === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    segs.push([a.x, a.y, mid.x, mid.y]);
    segs.push([mid.x, mid.y, b.x, b.y]);
  }
  return segs;
}

/** Perpendicular distance from (x,y) to the nearest point on an
 *  axis-aligned segment (clamped to the segment's extent). */
function distToSegment(x, y, x1, y1, x2, y2) {
  const cx = Math.max(Math.min(x, Math.max(x1, x2)), Math.min(x1, x2));
  const cy = Math.max(Math.min(y, Math.max(y1, y2)), Math.min(y1, y2));
  return Math.hypot(x - cx, y - cy);
}

/** Minimum distance from (x,y) to any road segment's centerline. */
export function distanceToNearestRoad(x, y, segments = buildRoadSegments()) {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of segments) {
    const d = distToSegment(x, y, x1, y1, x2, y2);
    if (d < best) best = d;
  }
  return best;
}

/** Same L-shaped decomposition as buildRoadSegments(), but with edge/
 *  orientation metadata attached — used by the ground-geometry generator
 *  (Task 21) so segment provenance is traceable back to ROAD_EDGES. */
export function buildLabeledRoadSegments() {
  const out = [];
  ROAD_EDGES.forEach(([aId, bId, corner], edgeIndex) => {
    const a = landmarkPx(aId);
    const b = landmarkPx(bId);
    const mid = corner === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    if (corner === 'h') {
      out.push({ edgeIndex, a: aId, b: bId, orientation: 'h', x1: a.x, y1: a.y, x2: mid.x, y2: mid.y });
      out.push({ edgeIndex, a: aId, b: bId, orientation: 'v', x1: mid.x, y1: mid.y, x2: b.x, y2: b.y });
    } else {
      out.push({ edgeIndex, a: aId, b: bId, orientation: 'v', x1: a.x, y1: a.y, x2: mid.x, y2: mid.y });
      out.push({ edgeIndex, a: aId, b: bId, orientation: 'h', x1: mid.x, y1: mid.y, x2: b.x, y2: b.y });
    }
  });
  return out;
}
