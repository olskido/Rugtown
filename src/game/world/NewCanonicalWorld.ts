/**
 * NewCanonicalWorld.ts
 * ─────────────────────
 * Phase 10A — world geometry facade for main_rugtown.png.
 *
 * Scale constants live in WorldMapScale.ts.
 * Districts live in WorldDistricts.ts.
 * Solid blockers live in WorldCollisionGeometry.ts.
 *
 * This module keeps the familiar FOUNTAIN / SPAWN / LANDMARK exports
 * used by WorldScene and related systems.
 */

export {
  WORLD_IMAGE_WIDTH as SOURCE_IMAGE_W,
  WORLD_IMAGE_HEIGHT as SOURCE_IMAGE_H,
  WORLD_SCALE,
  WORLD_WIDTH as WORLD_W,
  WORLD_HEIGHT as WORLD_H,
  WORLD_IMAGE_WIDTH as BACKGROUND_WIDTH,
  WORLD_IMAGE_HEIGHT as BACKGROUND_HEIGHT,
  WORLD_SCALE_X,
  WORLD_SCALE_Y,
  WORLD_OFFSET_X,
  WORLD_OFFSET_Y,
  imageToWorldX,
  imageToWorldY,
  worldToImageX,
  worldToImageY,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_MAX,
  CAMERA_FOLLOW_LERP,
  WORLD_COLLISION_ENABLED,
  PLAYER_SPEED,
} from './WorldMapScale';

import {
  imageToWorldX, imageToWorldY, imageToWorldW, imageToWorldH,
} from './WorldMapScale';
import { NAV_CORRIDORS } from './WorldCollisionGeometry';

export interface WalkRect {
  x: number; y: number; w: number; h: number; kind: 'plaza' | 'road';
}

/** Spring Water fountain centre — sampled from main_rugtown.png + V4. */
export const FOUNTAIN_IMAGE_X = 757;
export const FOUNTAIN_IMAGE_Y = 318;
export const FOUNTAIN_X = imageToWorldX(FOUNTAIN_IMAGE_X);
export const FOUNTAIN_Y = imageToWorldY(FOUNTAIN_IMAGE_Y);

/**
 * Spawn zone — open plaza paving south/slightly east of the basin.
 * Image-space AABB for multi-player offsets.
 */
export const SPAWN_ZONE_IMAGE = {
  x: 730,
  y: 330,
  w: 60,
  h: 45,
} as const;

/** Canonical single-player spawn (zone centre). */
export const SPAWN_IMAGE_X = SPAWN_ZONE_IMAGE.x + SPAWN_ZONE_IMAGE.w / 2;
export const SPAWN_IMAGE_Y = SPAWN_ZONE_IMAGE.y + SPAWN_ZONE_IMAGE.h / 2;
export const SPAWN_X = imageToWorldX(SPAWN_IMAGE_X);
export const SPAWN_Y = imageToWorldY(SPAWN_IMAGE_Y);

export const SPAWN_ZONE_WORLD = {
  x: imageToWorldX(SPAWN_ZONE_IMAGE.x),
  y: imageToWorldY(SPAWN_ZONE_IMAGE.y),
  w: imageToWorldX(SPAWN_ZONE_IMAGE.w) - imageToWorldX(0),
  h: imageToWorldY(SPAWN_ZONE_IMAGE.h) - imageToWorldY(0),
};

/** Deterministic multi-player spawn offsets inside the verified zone. */
export function spawnPointForSlot(slot: number): { x: number; y: number } {
  const cols = 3;
  const col = ((slot % cols) + cols) % cols;
  const row = Math.floor(Math.abs(slot) / cols) % 3;
  const ix = SPAWN_ZONE_IMAGE.x + 12 + col * 18;
  const iy = SPAWN_ZONE_IMAGE.y + 10 + row * 14;
  return { x: imageToWorldX(ix), y: imageToWorldY(iy) };
}

export const CANONICAL_LANDMARK_IDS = [
  'fountain', 'fame', 'government', 'market', 'market_shop', 'trading_academy',
  'alpha', 'nft_gallery', 'nft_creator_studio', 'whale', 'financial_office',
  'research_observatory', 'cashback', 'holder_bank', 'arena', 'tournament_hall',
  'coffee', 'notice', 'park', 'bridge',
] as const;

export type CanonicalLandmarkId = (typeof CANONICAL_LANDMARK_IDS)[number];

/**
 * V4 landmark assignments → image-pixel anchors (interaction centres on
 * reachable ground near each labeled structure).
 */
export const LANDMARK_ANCHORS: Record<CanonicalLandmarkId, { ix: number; iy: number }> = {
  fountain:             { ix: 757, iy: 318 },
  research_observatory: { ix: 80,  iy: 160 },
  government:           { ix: 340, iy: 140 },
  fame:                 { ix: 240, iy: 280 },
  trading_academy:      { ix: 480, iy: 310 },
  notice:               { ix: 280, iy: 470 },
  market:               { ix: 1180, iy: 240 },
  market_shop:          { ix: 1320, iy: 260 },
  alpha:                { ix: 680, iy: 400 },
  coffee:               { ix: 900, iy: 430 },
  nft_gallery:          { ix: 1210, iy: 480 },
  whale:                { ix: 1520, iy: 150 },
  financial_office:     { ix: 1580, iy: 280 },
  cashback:             { ix: 1580, iy: 530 },
  holder_bank:          { ix: 1720, iy: 260 },
  bridge:               { ix: 1900, iy: 380 },
  arena:                { ix: 2080, iy: 280 },
  tournament_hall:      { ix: 2050, iy: 120 },
  nft_creator_studio:   { ix: 2040, iy: 450 },
  park:                 { ix: 2100, iy: 620 },
};

export function landmarkWorldPos(id: CanonicalLandmarkId): { x: number; y: number } {
  const a = LANDMARK_ANCHORS[id];
  return { x: imageToWorldX(a.ix), y: imageToWorldY(a.iy) };
}

/** @deprecated empty — Phase 9C test plots removed. */
export interface CanonicalBuildingPlot {
  id: string;
  assignedBuildingId: string;
  imageX: number; imageY: number; imageWidth: number; imageHeight: number;
  worldX: number; worldY: number; worldWidth: number; worldHeight: number;
  entranceImageX: number; entranceImageY: number;
  entranceWorldX: number; entranceWorldY: number;
  scaleOverride: number; verticalOffset: number; horizontalOffset: number;
}

export const FIVE_BUILDING_PLOTS: CanonicalBuildingPlot[] = [];
export const FIVE_BUILDING_TEST_IDS = ['fame', 'market', 'whale', 'coffee', 'arena'] as const;
export const FIVE_BUILDING_CALIBRATION: Record<string, { scaleOverride: number; horizontalOffset: number; verticalOffset: number }> = {};
export function getPlotForBuilding(_id: string): CanonicalBuildingPlot | undefined { return undefined; }

/**
 * Nav corridors as walkable rects — used for NPC home sampling / debug.
 * Player movement uses Option B (open − solids) via CollisionSystem.
 */
export function buildWalkableRects(
  _worldW?: number,
  _worldH?: number,
): WalkRect[] {
  return NAV_CORRIDORS.map((c) => ({
    x: imageToWorldX(c.ix),
    y: imageToWorldY(c.iy),
    w: imageToWorldW(c.iw),
    h: imageToWorldH(c.ih),
    kind: (c.id.includes('plaza') ? 'plaza' : 'road') as 'plaza' | 'road',
  }));
}

export function isWalkablePoint(
  rects: { x: number; y: number; w: number; h: number }[],
  x: number,
  y: number,
): boolean {
  for (const r of rects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

/** Debug-only zone overlays (legacy F9 fields). */
export const PARK_ZONES = [
  { id: 'park_gate', x: imageToWorldX(2050), y: imageToWorldY(580), width: imageToWorldX(100) - imageToWorldX(0), height: imageToWorldY(80) - imageToWorldY(0) },
];
export const WATER_ZONES = [
  { id: 'river', x: imageToWorldX(1825), y: imageToWorldY(20), width: imageToWorldX(140) - imageToWorldX(0), height: imageToWorldY(680) - imageToWorldY(0) },
];
export const BRIDGE_ZONE = {
  id: 'main_bridge',
  x: imageToWorldX(1830),
  y: imageToWorldY(340),
  width: imageToWorldX(140) - imageToWorldX(0),
  height: imageToWorldY(120) - imageToWorldY(0),
};
