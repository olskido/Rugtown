/*
  RoadNetwork.ts
  ──────────────
  Single source of truth for RugTown's WALKABLE geometry — the road / plaza
  / bridge network the player and citizens are allowed to stand on.

  Design (road-only movement, à la Pokémon / Stardew / Habbo):
  The world is BLOCKED by default (buildings, rivers, walls, gardens and any
  decorative area). Only the rectangles produced here — plazas around every
  landmark plus the road corridors that connect them — are walkable.

  Phase 8B — Compact Social World Rebalance: world is now 3600×2400 with
  Spring Water (fountain) as the exact centre (0.5, 0.5) and canonical
  spawn. The graph is a central plaza with 7 direct spokes to the primary
  landmark of each sector, a 10-node ring connecting those primaries, and
  short spurs out to each sector's secondary/support landmarks — no path
  from Spring Water to any landmark exceeds ~10s at PLAYER_SPEED (252px/s
  cardinal, see WorldScene.ts). Nine new nodes serve the expanded
  108-asset landmark library.

  Coordinates are fractions (0–1) of world width/height; call
  buildWalkableRects() once worldW/worldH are known to get pixel rectangles.
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

/** Width of every road corridor, in world pixels. */
export const ROAD_WIDTH = 88;

/* ─── Nodes ───
   Fractional positions in the 3600×2400 compact world. Spring Water
   (fountain) sits at the exact centre (0.5, 0.5). */
export const ROAD_NODES: RoadNode[] = [
  // ── Centre ──
  { id: 'fountain', x: 0.500, y: 0.500, plaza: 165 },
  { id: 'notice',   x: 0.500, y: 0.342, plaza: 92  },
  { id: 'coffee',   x: 0.409, y: 0.421, plaza: 92  },
  // ── North / Northwest ──
  { id: 'fame',              x: 0.394, y: 0.160, plaza: 116 },
  { id: 'government',        x: 0.372, y: 0.308, plaza: 90  },
  { id: 'trading_academy',   x: 0.193, y: 0.178, plaza: 85  },
  // ── Northeast ──
  { id: 'whale',              x: 0.643, y: 0.193, plaza: 112 },
  { id: 'financial_office',   x: 0.745, y: 0.192, plaza: 95  },
  { id: 'holder_bank',        x: 0.840, y: 0.263, plaza: 95  },
  { id: 'research_observatory', x: 0.840, y: 0.392, plaza: 85 },
  // ── East / Southeast ──
  { id: 'market',          x: 0.750, y: 0.513, plaza: 112 },
  { id: 'market_shop',     x: 0.810, y: 0.616, plaza: 85  },
  { id: 'tournament_hall', x: 0.849, y: 0.756, plaza: 90  },
  { id: 'arena',           x: 0.811, y: 0.864, plaza: 160 },
  // ── West / Southwest ──
  { id: 'alpha',              x: 0.259, y: 0.597, plaza: 104 },
  { id: 'nft_gallery',        x: 0.227, y: 0.787, plaza: 100 },
  { id: 'nft_creator_studio', x: 0.254, y: 0.868, plaza: 85  },
  { id: 'park',               x: 0.389, y: 0.859, plaza: 104 },
  // ── Outer southern edge ──
  { id: 'bridge',   x: 0.518, y: 0.811, plaza: 100 },
  { id: 'cashback', x: 0.459, y: 0.849, plaza: 140 },
];

/* ─── Edges ───
   Central plaza with 7 direct spokes to each sector's primary landmark,
   a ring connecting those primaries (secondary loop, no dead corridors),
   and short spurs out to each sector's secondary/support landmarks.
   Every node is reachable from Spring Water, guaranteed. */
export const ROAD_EDGES: RoadEdge[] = [
  // ── Spring Water spokes (short radial routes) ──
  { a: 'fountain', b: 'notice',  corner: 'h' },
  { a: 'fountain', b: 'coffee',  corner: 'h' },
  { a: 'fountain', b: 'fame',    corner: 'v' },
  { a: 'fountain', b: 'whale',   corner: 'v' },
  { a: 'fountain', b: 'market',  corner: 'h' },
  { a: 'fountain', b: 'alpha',   corner: 'h' },
  { a: 'fountain', b: 'bridge',  corner: 'v' },
  // ── Ring around Spring Water (primary landmarks, secondary loop) ──
  { a: 'notice', b: 'whale',   corner: 'h' },
  { a: 'whale',  b: 'market',  corner: 'v' },
  { a: 'market', b: 'arena',   corner: 'v' },
  { a: 'arena',  b: 'bridge',  corner: 'h' },
  { a: 'bridge', b: 'cashback', corner: 'h' },
  { a: 'cashback', b: 'park',  corner: 'h' },
  { a: 'park',   b: 'alpha',   corner: 'v' },
  { a: 'alpha',  b: 'coffee',  corner: 'v' },
  { a: 'coffee', b: 'fame',    corner: 'v' },
  { a: 'fame',   b: 'notice',  corner: 'h' },
  // ── N/NW spurs ──
  { a: 'fame', b: 'government',      corner: 'v' },
  { a: 'fame', b: 'trading_academy', corner: 'h' },
  // ── NE spurs (chained, radius increases with each hop) ──
  { a: 'whale',            b: 'financial_office',     corner: 'h' },
  { a: 'financial_office', b: 'holder_bank',          corner: 'v' },
  { a: 'holder_bank',      b: 'research_observatory', corner: 'v' },
  // ── E/SE spurs (chained toward Arena) ──
  { a: 'market',      b: 'market_shop',     corner: 'v' },
  { a: 'market_shop', b: 'tournament_hall', corner: 'v' },
  { a: 'tournament_hall', b: 'arena',       corner: 'h' },
  // ── W/SW spurs ──
  { a: 'alpha',       b: 'nft_gallery',        corner: 'v' },
  { a: 'nft_gallery', b: 'nft_creator_studio', corner: 'h' },
  { a: 'park',        b: 'nft_creator_studio', corner: 'h' },
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
