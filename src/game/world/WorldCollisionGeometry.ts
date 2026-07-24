/**
 * WorldCollisionGeometry.ts
 * ──────────────────────────
 * Phase 10A — solid blockers for main_rugtown.png.
 *
 * Source: V4 building collision reference / overlay red regions extracted
 * as conservative AABB cores (4px inward inset for road comfort — NOT a
 * blanket 30% shrink; V4 was already redesigned for road preservation).
 *
 * Movement model: open terrain minus blockers (Option B). Roads stay
 * walkable unless a building solid covers them.
 *
 * Coordinates authored in IMAGE pixels; converted via WorldMapScale.
 */

import type { DistrictId } from './WorldDistricts';
import {
  imageToWorldH, imageToWorldW, imageToWorldX, imageToWorldY,
  WORLD_HEIGHT, WORLD_WIDTH,
} from './WorldMapScale';

export type CollisionPurpose = 'building' | 'water' | 'fountain' | 'edge' | 'barrier';

export type CollisionShape =
  | {
      id: string;
      purpose: CollisionPurpose;
      districtId?: DistrictId;
      shape: 'rect';
      /** Image-space AABB */
      ix: number; iy: number; iw: number; ih: number;
      debugLabel: string;
    }
  | {
      id: string;
      purpose: CollisionPurpose;
      districtId?: DistrictId;
      shape: 'circle';
      ix: number; iy: number; ir: number;
      debugLabel: string;
    }
  | {
      id: string;
      purpose: CollisionPurpose;
      districtId?: DistrictId;
      shape: 'poly';
      /** Image-space polygon vertices */
      ipoints: { x: number; y: number }[];
      debugLabel: string;
    };

export interface WorldSolid {
  id: string;
  purpose: CollisionPurpose;
  districtId?: DistrictId;
  kind: 'rect' | 'circle' | 'poly';
  /** World-space */
  x: number; y: number; w?: number; h?: number; r?: number;
  points?: { x: number; y: number }[];
  debugLabel: string;
}

function rect(
  id: string,
  ix: number, iy: number, iw: number, ih: number,
  purpose: CollisionPurpose,
  districtId?: DistrictId,
): CollisionShape {
  return {
    id, purpose, districtId, shape: 'rect',
    ix, iy, iw, ih,
    debugLabel: id,
  };
}

function circle(
  id: string,
  ix: number, iy: number, ir: number,
  purpose: CollisionPurpose,
  districtId?: DistrictId,
): CollisionShape {
  return {
    id, purpose, districtId, shape: 'circle',
    ix, iy, ir,
    debugLabel: id,
  };
}

/** Fountain basin — small blocked circle at Spring Water. */
const FOUNTAIN_SOLID = circle('fountain_basin', 757, 318, 28, 'fountain', 'spring_core');

/**
 * River water east of Financial Quarter — segmented so Main Bridge deck
 * (approx image y 329–474, x 1820–1980) stays open.
 */
const RIVER_SOLIDS: CollisionShape[] = [
  rect('river_n', 1825, 20, 140, 300, 'water', 'arena_grounds'),
  rect('river_s', 1825, 480, 140, 220, 'water', 'arena_grounds'),
  // Narrow bank strips beside bridge deck (rail / deep water), not the deck
  rect('river_bridge_w_bank', 1810, 330, 18, 145, 'water', 'financial'),
  rect('river_bridge_e_bank', 1965, 330, 18, 145, 'water', 'arena_grounds'),
];

/**
 * Building solids from V4 red overlay components (same 2172×724 space as
 * main_rugtown.png). One oversized plaza-overlapping blob was replaced by
 * tighter manual south-core rects so Spring Water remains open.
 */
const BUILDING_SOLIDS: CollisionShape[] = [
  rect('bldg_2086_242', 2004, 152, 164, 180, 'building', 'arena_grounds'),
  rect('bldg_738_126', 648, 72, 180, 108, 'building', 'spring_core'),
  rect('bldg_1636_176', 1596, 92, 80, 168, 'building', 'financial'),
  rect('bldg_108_434', 48, 376, 120, 116, 'building', 'west'),
  rect('bldg_240_270', 188, 212, 104, 116, 'building', 'west'),
  rect('bldg_1254_240', 1192, 196, 124, 88, 'building', 'east'),
  rect('bldg_2012_414', 1952, 380, 120, 68, 'building', 'arena_grounds'),
  rect('bldg_340_134', 288, 92, 104, 84, 'building', 'west'),
  rect('bldg_686_248', 648, 196, 76, 104, 'building', 'spring_core'),
  rect('bldg_80_166', 36, 120, 88, 92, 'building', 'west'),
  rect('bldg_1642_376', 1600, 336, 84, 80, 'building', 'financial'),
  rect('bldg_444_164', 404, 120, 80, 88, 'building', 'west'),
  rect('bldg_392_256', 352, 216, 80, 80, 'building', 'west'),
  rect('bldg_1344_308', 1308, 272, 72, 72, 'building', 'east'),
  rect('bldg_1210_474', 1180, 432, 60, 84, 'building', 'east'),
  rect('bldg_1436_250', 1416, 196, 40, 108, 'building', 'east'),
  rect('bldg_1928_98', 1888, 60, 80, 76, 'building', 'arena_grounds'),
  rect('bldg_298_440', 264, 396, 68, 88, 'building', 'west'),
  rect('bldg_1322_148', 1284, 116, 76, 64, 'building', 'east'),
  rect('bldg_254_548', 220, 504, 68, 88, 'building', 'west'),
  rect('bldg_392_404', 356, 364, 72, 80, 'building', 'west'),
  rect('bldg_846_258', 812, 220, 68, 76, 'building', 'spring_core'),
  rect('bldg_892_168', 856, 132, 72, 72, 'building', 'spring_core'),
  rect('bldg_1440_444', 1424, 380, 32, 128, 'building', 'east'),
  rect('bldg_336_564', 304, 528, 64, 72, 'building', 'west'),
  rect('bldg_1580_536', 1560, 496, 40, 80, 'building', 'financial'),
  rect('bldg_402_502', 372, 460, 60, 84, 'building', 'west'),
  rect('bldg_1906_204', 1884, 168, 44, 72, 'building', 'arena_grounds'),
  rect('bldg_1434_118', 1412, 84, 44, 68, 'building', 'east'),
  rect('bldg_670_378', 648, 336, 44, 84, 'building', 'spring_core'),
  rect('bldg_782_232', 760, 200, 44, 64, 'building', 'spring_core'),
  rect('bldg_228_388', 204, 360, 48, 56, 'building', 'west'),
  rect('bldg_1124_528', 1104, 500, 40, 56, 'building', 'east'),
  rect('bldg_1378_244', 1360, 212, 36, 64, 'building', 'east'),
  rect('bldg_330_232', 308, 208, 44, 48, 'building', 'west'),
  rect('bldg_1146_270', 1120, 248, 52, 44, 'building', 'east'),
  rect('bldg_462_434', 444, 408, 36, 52, 'building', 'west'),
  rect('bldg_1100_406', 1084, 380, 32, 52, 'building', 'east'),
  rect('bldg_1724_198', 1708, 168, 32, 60, 'building', 'financial'),
  rect('bldg_1096_276', 1080, 252, 32, 48, 'building', 'east'),
  rect('bldg_1380_486', 1364, 464, 32, 44, 'building', 'east'),
  rect('bldg_1340_444', 1324, 424, 32, 40, 'building', 'east'),
  rect('bldg_1246_546', 1232, 524, 28, 44, 'building', 'east'),
  rect('bldg_1950_544', 1928, 524, 44, 40, 'building', 'arena_grounds'),
  rect('bldg_942_482', 928, 460, 28, 44, 'building', 'spring_core'),
  rect('bldg_1126_128', 1112, 104, 28, 48, 'building', 'east'),
  rect('bldg_908_440', 896, 420, 24, 40, 'building', 'spring_core'),
  rect('bldg_1210_126', 1196, 100, 28, 52, 'building', 'east'),
  rect('bldg_620_548', 608, 528, 24, 40, 'building', 'spring_core'),
  rect('bldg_888_384', 872, 364, 32, 40, 'building', 'spring_core'),
  rect('bldg_1524_220', 1512, 200, 24, 40, 'building', 'financial'),
  rect('bldg_1062_548', 1048, 528, 28, 40, 'building', 'east'),
  rect('bldg_1698_124', 1688, 104, 20, 40, 'building', 'financial'),
  rect('bldg_484_312', 468, 296, 32, 32, 'building', 'west'),
  rect('bldg_1076_150', 1064, 132, 24, 36, 'building', 'east'),
  rect('bldg_1546_406', 1532, 388, 28, 36, 'building', 'financial'),
  rect('bldg_944_308', 928, 292, 32, 32, 'building', 'spring_core'),
  rect('bldg_1502_394', 1492, 376, 20, 36, 'building', 'financial'),
  // Manual replacements for oversized south-core blob
  rect('alpha_core', 650, 360, 55, 70, 'building', 'spring_core'),
  rect('south_core_a', 740, 380, 50, 60, 'building', 'spring_core'),
  rect('south_core_b', 800, 400, 55, 70, 'building', 'spring_core'),
  rect('south_core_c', 770, 480, 70, 55, 'building', 'spring_core'),
];

export const COLLISION_SHAPES: CollisionShape[] = [
  FOUNTAIN_SOLID,
  ...RIVER_SOLIDS,
  ...BUILDING_SOLIDS,
];

export function toWorldSolid(shape: CollisionShape): WorldSolid {
  if (shape.shape === 'rect') {
    return {
      id: shape.id,
      purpose: shape.purpose,
      districtId: shape.districtId,
      kind: 'rect',
      x: imageToWorldX(shape.ix),
      y: imageToWorldY(shape.iy),
      w: imageToWorldW(shape.iw),
      h: imageToWorldH(shape.ih),
      debugLabel: shape.debugLabel,
    };
  }
  if (shape.shape === 'circle') {
    return {
      id: shape.id,
      purpose: shape.purpose,
      districtId: shape.districtId,
      kind: 'circle',
      x: imageToWorldX(shape.ix),
      y: imageToWorldY(shape.iy),
      r: imageToWorldW(shape.ir),
      debugLabel: shape.debugLabel,
    };
  }
  return {
    id: shape.id,
    purpose: shape.purpose,
    districtId: shape.districtId,
    kind: 'poly',
    x: 0,
    y: 0,
    points: shape.ipoints.map((p) => ({ x: imageToWorldX(p.x), y: imageToWorldY(p.y) })),
    debugLabel: shape.debugLabel,
  };
}

export function buildWorldSolids(): WorldSolid[] {
  return COLLISION_SHAPES.map(toWorldSolid);
}

/** Point-in-solid test (world space). */
export function pointHitsSolid(solid: WorldSolid, x: number, y: number): boolean {
  if (solid.kind === 'rect' && solid.w != null && solid.h != null) {
    return x >= solid.x && x <= solid.x + solid.w && y >= solid.y && y <= solid.y + solid.h;
  }
  if (solid.kind === 'circle' && solid.r != null) {
    const dx = x - solid.x;
    const dy = y - solid.y;
    return dx * dx + dy * dy <= solid.r * solid.r;
  }
  if (solid.kind === 'poly' && solid.points && solid.points.length >= 3) {
    // Ray-cast
    let inside = false;
    const pts = solid.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect =
        ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  return false;
}

export function pointHitsAnySolid(solids: readonly WorldSolid[], x: number, y: number): boolean {
  for (const s of solids) {
    if (pointHitsSolid(s, x, y)) return true;
  }
  return false;
}

export function isInsideWorldBounds(x: number, y: number, margin = 8): boolean {
  return x >= margin && y >= margin && x <= WORLD_WIDTH - margin && y <= WORLD_HEIGHT - margin;
}

/**
 * Primary navigation corridors — used for NPC home sampling and
 * reachability validation. Not required for player movement (Option B).
 */
export interface NavCorridor {
  id: string;
  ix: number; iy: number; iw: number; ih: number;
}

export const NAV_CORRIDORS: NavCorridor[] = [
  // East–west spine through all districts
  { id: 'spine', ix: 80, iy: 300, iw: 2000, ih: 48 },
  // Spring Water plaza ring pieces
  { id: 'spring_plaza', ix: 680, iy: 280, iw: 160, ih: 90 },
  // West plaza
  { id: 'west_plaza', ix: 180, iy: 240, iw: 280, ih: 100 },
  // East market plaza
  { id: 'east_plaza', ix: 1050, iy: 280, iw: 280, ih: 80 },
  // Financial plaza
  { id: 'fin_plaza', ix: 1500, iy: 240, iw: 220, ih: 100 },
  // Main Bridge deck
  { id: 'bridge_deck', ix: 1830, iy: 340, iw: 140, ih: 120 },
  // Arena apron
  { id: 'arena_apron', ix: 1980, iy: 300, iw: 120, ih: 100 },
];

export const COLLISION_GEOMETRY_COUNT = COLLISION_SHAPES.length;
