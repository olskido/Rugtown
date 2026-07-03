/*
  RoadNetwork.ts
  ──────────────
  Single source of truth for RugTown's WALKABLE geometry — the road / plaza
  / bridge network the player and citizens are allowed to stand on.

  Design (road-only movement, à la Pokémon / Stardew / Habbo):
  The world is BLOCKED by default (buildings, rivers, walls, gardens and any
  decorative area). Only the rectangles produced here — plazas around every
  landmark plus the road corridors that connect them — are walkable. This is
  the inverse of the old "walk everywhere, block a few boxes" model.

  The network is anchored to the game's existing layout (the WORLD_OBJECTS
  landmark coordinates), so every landmark is guaranteed to sit on walkable
  ground and be reachable from spawn, and every edge forms a real path
  between two landmarks. Corridors are axis-aligned L-shapes (a horizontal
  segment + a vertical segment sharing a corner), giving the tidy grid-town
  street feel of the reference games.

  Pure data + a builder — no Phaser import, same convention as
  WorldObjects.ts / CollisionZones.ts. Coordinates are fractions (0–1) of
  world width/height; call buildWalkableRects() once the real worldW/worldH
  are known to get pixel rectangles.
*/

export interface RoadNode {
  id: string;
  /** Fraction of world width, 0–1 */
  x: number;
  /** Fraction of world height, 0–1 */
  y: number;
  /** Plaza radius in world PIXELS (square half-extent) around this node. */
  plaza: number;
}

/** 'h' → horizontal segment first (corner at bx,ay); 'v' → vertical first. */
type EdgeCorner = 'h' | 'v';

export interface RoadEdge {
  a: string;
  b: string;
  corner?: EdgeCorner;
}

/** A walkable rectangle in world pixels. */
export interface WalkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'plaza' | 'road';
}

/** Width of every road corridor, in world pixels. Generous so movement
 *  feels open (wide streets) and the character never feels threaded. */
export const ROAD_WIDTH = 88;

/* ─── Nodes ───
   Positions mirror WORLD_OBJECTS so landmarks are always on walkable
   plazas. Plaza sizes are hand-tuned: the Spawn Fountain is the big
   central square; the rest are smaller junctions. */
export const ROAD_NODES: RoadNode[] = [
  { id: 'fountain', x: 0.38, y: 0.58, plaza: 165 },
  { id: 'notice',   x: 0.42, y: 0.40, plaza: 92  },
  { id: 'market',   x: 0.62, y: 0.28, plaza: 112 },
  { id: 'bridge',   x: 0.55, y: 0.46, plaza: 100 },
  { id: 'alpha',    x: 0.75, y: 0.48, plaza: 104 },
  { id: 'whale',    x: 0.55, y: 0.70, plaza: 112 },
  { id: 'fame',     x: 0.22, y: 0.80, plaza: 116 },
  { id: 'coffee',   x: 0.30, y: 0.68, plaza: 92  },
  { id: 'park',     x: 0.78, y: 0.68, plaza: 104 },
];

/* ─── Edges ───
   A connected network (with a couple of loops so players can go around
   rather than only back-and-forth). Every node is reachable from every
   other node, which guarantees spawn → any landmark is walkable. */
export const ROAD_EDGES: RoadEdge[] = [
  { a: 'fountain', b: 'notice', corner: 'h' },
  { a: 'fountain', b: 'bridge', corner: 'h' },
  { a: 'fountain', b: 'coffee', corner: 'h' },
  { a: 'fountain', b: 'whale',  corner: 'h' },
  { a: 'notice',   b: 'market', corner: 'h' },
  { a: 'notice',   b: 'bridge', corner: 'h' },
  { a: 'bridge',   b: 'alpha',  corner: 'h' },
  { a: 'bridge',   b: 'whale',  corner: 'v' },
  { a: 'whale',    b: 'park',   corner: 'h' },
  { a: 'coffee',   b: 'fame',   corner: 'h' },
  { a: 'alpha',    b: 'park',   corner: 'v' },
  { a: 'market',   b: 'alpha',  corner: 'h' },
];

function nodeById(id: string): RoadNode {
  const n = ROAD_NODES.find(n => n.id === id);
  if (!n) throw new Error(`RoadNetwork: unknown node "${id}"`);
  return n;
}

/** Axis-aligned rect spanning two pixel points, thickened to ROAD_WIDTH on
 *  its thin axis (the segment is either horizontal or vertical). */
function segmentRect(x1: number, y1: number, x2: number, y2: number): WalkRect {
  const half = ROAD_WIDTH / 2;
  if (y1 === y2) {
    // Horizontal
    const left = Math.min(x1, x2) - half;
    const right = Math.max(x1, x2) + half;
    return { x: left, y: y1 - half, w: right - left, h: ROAD_WIDTH, kind: 'road' };
  }
  // Vertical
  const top = Math.min(y1, y2) - half;
  const bottom = Math.max(y1, y2) + half;
  return { x: x1 - half, y: top, w: ROAD_WIDTH, h: bottom - top, kind: 'road' };
}

/**
 * Build every walkable rectangle in world pixels: one plaza per node plus
 * two road segments (an L) per edge. Overlaps are fine — walkability is a
 * simple point-in-any-rect test, so overlapping rects just union together.
 */
export function buildWalkableRects(worldW: number, worldH: number): WalkRect[] {
  const rects: WalkRect[] = [];

  // Plazas
  for (const n of ROAD_NODES) {
    const cx = n.x * worldW;
    const cy = n.y * worldH;
    rects.push({
      x: cx - n.plaza,
      y: cy - n.plaza,
      w: n.plaza * 2,
      h: n.plaza * 2,
      kind: 'plaza',
    });
  }

  // Road corridors (L-shaped)
  for (const e of ROAD_EDGES) {
    const a = nodeById(e.a);
    const b = nodeById(e.b);
    const ax = a.x * worldW, ay = a.y * worldH;
    const bx = b.x * worldW, by = b.y * worldH;

    if ((e.corner ?? 'h') === 'h') {
      // Horizontal from a to the corner (bx, ay), then vertical to b.
      rects.push(segmentRect(ax, ay, bx, ay));
      rects.push(segmentRect(bx, ay, bx, by));
    } else {
      // Vertical from a to the corner (ax, by), then horizontal to b.
      rects.push(segmentRect(ax, ay, ax, by));
      rects.push(segmentRect(ax, by, bx, by));
    }
  }

  return rects;
}

/** Point-in-any-rect walkability test. */
export function isWalkablePoint(rects: WalkRect[], x: number, y: number): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}
