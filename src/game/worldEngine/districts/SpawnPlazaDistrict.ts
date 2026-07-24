/**
 * SpawnPlazaDistrict.ts
 * ─────────────────────
 * Build 1 — polished handcrafted Spawn Plaza art pass.
 * Static Phaser Graphics only. No collision changes.
 *
 * Source: MAP_MEASUREMENT_DESIGN_SPEC · art blueprint
 * Boundary: x 3200–4100, y 2850–3400
 * Spawn: (3648, 3132)
 */

import Phaser from 'phaser';
import { addMinimapBuilding, addMinimapDistrict } from '../WorldMinimapData';
import {
  C_BORDER_GOLD, C_BORDER_DIM, C_GROUND_MID,
  C_LAMP_GLOW, C_METAL_DARK, C_BENCH_WOOD, C_LEAF_DARK, C_FENCE_LINE,
} from '../WorldPalette';

/* ─── District constants (spec) ───────────────────────────────────────── */

export const SPAWN_PLAZA = {
  cx: 3648,
  cy: 3132,
  plazaRadius: 240,
  bounds: { x: 3200, y: 2850, w: 900, h: 550 },
} as const;

export const NOTICE_BOARD = {
  cx: 3802,
  cy: 2743,
  w: 120,
  h: 100,
  ox: 0,
  oy: -55,
} as const;

export const FOUNTAIN = {
  cx: 3648,
  cy: 3132,
  w: 280,
  h: 280,
} as const;

/** Prop positions used in this pass — for design docs / debugging. */
export const SPAWN_PLAZA_PROP_POSITIONS = {
  benches: [
    { x: 3410, y: 3040, label: 'bench-nw' },
    { x: 3885, y: 3045, label: 'bench-ne' },
    { x: 3465, y: 3275, label: 'bench-sw' },
    { x: 3825, y: 3270, label: 'bench-se' },
  ],
  lamps: [
    { x: 3380, y: 2920, label: 'lamp-nw' },
    { x: 3915, y: 2925, label: 'lamp-ne' },
    { x: 3285, y: 3180, label: 'lamp-w' },
    { x: 4005, y: 3175, label: 'lamp-e' },
    { x: 3520, y: 3360, label: 'lamp-sw' },
    { x: 3775, y: 3355, label: 'lamp-se' },
    { x: 3845, y: 2685, label: 'lamp-notice' },
  ],
  fountainLamps: [
    { x: 3548, y: 3052, label: 'fountain-lamp-nw' },
    { x: 3748, y: 3052, label: 'fountain-lamp-ne' },
    { x: 3548, y: 3212, label: 'fountain-lamp-sw' },
    { x: 3748, y: 3212, label: 'fountain-lamp-se' },
  ],
  planters: [
    { x: 3260, y: 3080, label: 'planter-w' },
    { x: 4035, y: 3070, label: 'planter-e' },
    { x: 3580, y: 2895, label: 'bush-n' },
    { x: 3710, y: 2890, label: 'bush-n2' },
    { x: 3340, y: 3320, label: 'bush-sw' },
  ],
  memorialStones: [
    { x: 3320, y: 3165, label: 'memorial-w' },
    { x: 3970, y: 3160, label: 'memorial-e' },
  ],
  crates: [
    { x: 4010, y: 2975, label: 'crate-market-1' },
    { x: 4065, y: 3010, label: 'crate-market-2' },
  ],
} as const;

const DEPTH_GROUND     = -1.88;
const DEPTH_PLAZA      = -1.74;
const DEPTH_ROAD_ACC   = -0.94;
const DEPTH_SHADOW     = 1.08;
const DEPTH_PROPS      = 1.28;
const DEPTH_STRUCTURES = 1.42;

const STONE_DARK  = 0x0e1418;
const STONE_MID   = 0x141c22;
const STONE_LIGHT = 0x1a242c;
const ASPHALT     = 0x0a0e12;
const ASPHALT_WEAR = 0x121820;
const WATER_DARK  = 0x142430;
const GOLD        = 0xc8902a;
const GOLD_BRIGHT = 0xe8b84b;
const WOOD_DARK   = 0x2a1e12;

/* ─── Draw helpers ────────────────────────────────────────────────────── */

function drawPropShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(x, y + h * 0.5, w, h * 0.35);
}

export function drawLamp(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
  const h = 32 * scale;
  g.fillStyle(C_METAL_DARK, 1);
  g.fillRect(x - 2 * scale, y - h, 4 * scale, h);
  g.fillStyle(GOLD_DARK(), 0.85);
  g.fillRect(x - 5 * scale, y - h + 4 * scale, 10 * scale, 6 * scale);
  g.fillStyle(C_LAMP_GLOW, 0.65);
  g.fillCircle(x, y - h - 4 * scale, 5 * scale);
  g.fillStyle(C_LAMP_GLOW, 0.12);
  g.fillCircle(x, y - h - 4 * scale, 14 * scale);
}

function GOLD_DARK(): number { return 0xa07028; }

export function drawBench(g: Phaser.GameObjects.Graphics, x: number, y: number, facing: 'h' | 'v' = 'h'): void {
  const bw = facing === 'h' ? 44 : 22;
  const bh = facing === 'h' ? 16 : 40;
  g.fillStyle(C_BENCH_WOOD, 1);
  g.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  g.lineStyle(1, GOLD, 0.35);
  g.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
  g.fillStyle(C_METAL_DARK, 1);
  if (facing === 'h') {
    g.fillRect(x - bw / 2 + 4, y + bh / 2 - 2, 5, 8);
    g.fillRect(x + bw / 2 - 9, y + bh / 2 - 2, 5, 8);
  } else {
    g.fillRect(x - bw / 2 - 2, y - bh / 2 + 4, 8, 5);
    g.fillRect(x - bw / 2 - 2, y + bh / 2 - 9, 8, 5);
  }
}

export function drawPlanter(g: Phaser.GameObjects.Graphics, x: number, y: number, bush = true): void {
  g.fillStyle(STONE_MID, 1);
  g.fillRect(x - 14, y - 6, 28, 16);
  g.lineStyle(1, C_BORDER_DIM, 0.5);
  g.strokeRect(x - 14, y - 6, 28, 16);
  if (bush) {
    g.fillStyle(C_LEAF_DARK, 0.9);
    g.fillCircle(x - 6, y - 14, 10);
    g.fillCircle(x + 7, y - 16, 11);
    g.fillCircle(x, y - 20, 12);
  }
}

export function drawStonePaving(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, radius: number,
): void {
  g.fillStyle(STONE_DARK, 0.92);
  g.fillCircle(cx, cy, radius);

  // Radial tile segments
  g.lineStyle(1, STONE_LIGHT, 0.22);
  const segments = 16;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    g.lineBetween(cx, cy, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  // Concentric rings
  for (const r of [radius * 0.35, radius * 0.62, radius * 0.88]) {
    g.strokeCircle(cx, cy, r);
  }

  // Worn outer edge
  g.lineStyle(5, 0x080c10, 0.45);
  g.strokeCircle(cx, cy, radius - 2);
  g.lineStyle(3, GOLD, 0.42);
  g.strokeCircle(cx, cy, radius - 6);

  // Subtle inner tile blocks
  g.lineStyle(1, STONE_LIGHT, 0.15);
  const step = 28;
  for (let ox = -radius + 14; ox < radius; ox += step) {
    for (let oy = -radius + 14; oy < radius; oy += step) {
      if (ox * ox + oy * oy < (radius - 18) ** 2) {
        g.strokeRect(cx + ox, cy + oy, step - 2, step - 2);
      }
    }
  }
}

export function drawFountain(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // Stone base platform
  g.fillStyle(STONE_MID, 1);
  g.fillCircle(cx, cy, 108);
  g.lineStyle(2, C_BORDER_DIM, 0.55);
  g.strokeCircle(cx, cy, 108);

  // Outer basin
  g.fillStyle(STONE_DARK, 1);
  g.fillCircle(cx, cy, 98);
  g.lineStyle(4, GOLD, 0.78);
  g.strokeCircle(cx, cy, 98);

  // Basin lip
  g.fillStyle(STONE_MID, 0.9);
  g.fillCircle(cx, cy, 82);
  g.lineStyle(2, GOLD_BRIGHT, 0.55);
  g.strokeCircle(cx, cy, 82);

  // Water (dark cyan shadow only)
  g.fillStyle(WATER_DARK, 0.88);
  g.fillCircle(cx, cy, 68);
  g.fillStyle(0x0c1820, 0.6);
  g.fillCircle(cx, cy, 52);

  // Inner raised basin
  g.fillStyle(STONE_LIGHT, 1);
  g.fillCircle(cx, cy, 38);
  g.lineStyle(2, GOLD, 0.7);
  g.strokeCircle(cx, cy, 38);

  // Coin glow centre (gold dominant)
  g.fillStyle(GOLD_BRIGHT, 0.35);
  g.fillCircle(cx, cy - 4, 18);
  g.fillStyle(GOLD_BRIGHT, 0.75);
  g.fillCircle(cx, cy - 4, 8);
  g.fillStyle(0xfff0c0, 0.5);
  g.fillCircle(cx, cy - 6, 3);

  // 4 fountain lamp posts
  for (const lp of SPAWN_PLAZA_PROP_POSITIONS.fountainLamps) {
    drawLamp(g, lp.x, lp.y, 0.95);
  }
}

export function drawNoticeBoard(g: Phaser.GameObjects.Graphics): void {
  const nb = NOTICE_BOARD;
  const x = nb.cx + nb.ox - nb.w / 2;
  const y = nb.cy + nb.oy - nb.h / 2;
  const w = nb.w;
  const h = nb.h;

  drawPropShadow(g, nb.cx, y + h, w, 18);

  // Posts
  g.fillStyle(WOOD_DARK, 1);
  g.fillRect(x + 14, y + h - 10, 7, 32);
  g.fillRect(x + w - 21, y + h - 10, 7, 32);

  // Board body
  g.fillStyle(0x121820, 1);
  g.fillRect(x + 6, y + 10, w - 12, h - 28);
  g.lineStyle(3, GOLD, 0.82);
  g.strokeRect(x + 6, y + 10, w - 12, h - 28);
  g.lineStyle(1, GOLD_BRIGHT, 0.35);
  g.strokeRect(x + 10, y + 14, w - 20, h - 36);

  // Pinned notes (abstract rectangles, no readable text)
  const noteColors = [0x1a2430, 0x222c38, 0x182028];
  for (let i = 0; i < 4; i++) {
    g.fillStyle(noteColors[i % 3], 1);
    const nx = x + 14 + (i % 2) * 38;
    const ny = y + 20 + Math.floor(i / 2) * 22;
    g.fillRect(nx, ny, 32, 16);
    g.fillStyle(GOLD, 0.7);
    g.fillCircle(nx + 4, ny + 4, 3);
  }

  // Side lamp
  drawLamp(g, SPAWN_PLAZA_PROP_POSITIONS.lamps[6].x, SPAWN_PLAZA_PROP_POSITIONS.lamps[6].y, 0.85);
}

function drawMemorialStone(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(STONE_MID, 1);
  g.fillRect(x - 16, y - 22, 32, 28);
  g.lineStyle(1, C_BORDER_DIM, 0.5);
  g.strokeRect(x - 16, y - 22, 32, 28);
  g.fillStyle(GOLD, 0.25);
  g.fillRect(x - 12, y - 18, 24, 6);
  g.fillStyle(STONE_LIGHT, 0.6);
  g.fillRect(x - 10, y - 8, 20, 10);
}

function drawCrate(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(C_BENCH_WOOD, 1);
  g.fillRect(x - 14, y - 12, 28, 24);
  g.lineStyle(1, GOLD, 0.3);
  g.strokeRect(x - 14, y - 12, 28, 24);
  g.lineBetween(x - 14, y, x + 14, y);
  g.lineBetween(x, y - 12, x, y + 12);
}

function drawDistrictGround(g: Phaser.GameObjects.Graphics, bounds: typeof SPAWN_PLAZA.bounds): void {
  const { x, y, w, h } = bounds;
  g.fillStyle(STONE_DARK, 0.55);
  g.fillRect(x, y, w, h);

  // Subtle ground texture
  g.lineStyle(1, STONE_MID, 0.12);
  const step = 48;
  for (let gx = x + 12; gx < x + w; gx += step) {
    g.lineBetween(gx, y, gx, y + h);
  }
  for (let gy = y + 12; gy < y + h; gy += step) {
    g.lineBetween(x, gy, x + w, gy);
  }

  // Low boundary walls / fences on edges away from roads
  g.fillStyle(0x0a1014, 0.85);
  g.fillRect(x, y, w, 14);
  g.fillRect(x, y + h - 14, w, 14);
  g.lineStyle(2, C_FENCE_LINE, 0.45);
  g.lineBetween(x + 20, y + 14, x + w - 20, y + 14);
  g.lineBetween(x + 20, y + h - 14, x + w - 20, y + h - 14);

  // Corner stone posts
  for (const [cx, cy] of [[x + 24, y + 24], [x + w - 24, y + 24], [x + 24, y + h - 24], [x + w - 24, y + h - 24]]) {
    g.fillStyle(STONE_MID, 1);
    g.fillRect(cx - 10, cy - 10, 20, 20);
    g.lineStyle(1, GOLD, 0.35);
    g.strokeRect(cx - 10, cy - 10, 20, 20);
  }
}

function drawGoldFloorMarkings(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  g.lineStyle(2, GOLD, 0.22);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r0 = 155;
    const r1 = 175;
    g.lineBetween(
      cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
      cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
    );
  }
  g.lineStyle(1, GOLD_BRIGHT, 0.18);
  g.strokeCircle(cx, cy, 128);
}

/** Road edge wear + lamp dots on spawn-connected lanes (visual only). */
function drawSpawnRoadAccents(g: Phaser.GameObjects.Graphics): void {
  const { cx, cy } = SPAWN_PLAZA;
  const half = 64;

  type Segment = { x1: number; y1: number; x2: number; y2: number };
  const segments: Segment[] = [
    { x1: cx, y1: cy, x2: 3802, y2: cy },       // toward notice (horizontal part)
    { x1: 3802, y1: cy, x2: 3802, y2: 2743 },   // notice vertical
    { x1: cx, y1: cy, x2: 4301, y2: cy },       // toward bridge
    { x1: 4301, y1: cy, x2: 4301, y2: 2873 },
    { x1: cx, y1: cy, x2: 3341, y2: cy },       // toward coffee
    { x1: 3341, y1: cy, x2: 3341, y2: 3348 },
    { x1: cx, y1: cy, x2: 4301, y2: cy },       // toward whale (shared east)
    { x1: 4301, y1: cy, x2: 4301, y2: 3391 },
  ];

  g.fillStyle(ASPHALT, 0.35);
  for (const s of segments) {
    if (s.y1 === s.y2) {
      const left = Math.min(s.x1, s.x2) - half;
      const w = Math.abs(s.x2 - s.x1) + half * 2;
      g.fillRect(left, s.y1 - half, w, half * 2);
      g.lineStyle(2, ASPHALT_WEAR, 0.5);
      g.lineBetween(left, s.y1 - half, left + w, s.y1 - half);
      g.lineBetween(left, s.y1 + half, left + w, s.y1 + half);
    } else {
      const top = Math.min(s.y1, s.y2) - half;
      const h = Math.abs(s.y2 - s.y1) + half * 2;
      g.fillRect(s.x1 - half, top, half * 2, h);
      g.lineStyle(2, ASPHALT_WEAR, 0.5);
      g.lineBetween(s.x1 - half, top, s.x1 - half, top + h);
      g.lineBetween(s.x1 + half, top, s.x1 + half, top + h);
    }
  }

  // Sidewalk stone borders at plaza exits
  g.fillStyle(C_GROUND_MID, 0.5);
  const sw = 12;
  g.fillRect(cx - half - sw, cy - half - sw, half * 2 + sw * 2, sw);
  g.fillRect(cx - half - sw, cy + half, half * 2 + sw * 2, sw);
  g.fillRect(cx - half - sw, cy - half, sw, half * 2);
  g.fillRect(cx + half, cy - half, sw, half * 2);

  // Gold lamp dots along east exit toward market
  g.fillStyle(GOLD_BRIGHT, 0.55);
  for (let dx = cx + 80; dx < 4050; dx += 70) {
    g.fillCircle(dx, cy - half - 6, 2.5);
    g.fillCircle(dx, cy + half + 6, 2.5);
  }
}

/* ─── Main entry ──────────────────────────────────────────────────────── */

export function generateSpawnPlazaDistrict(scene: Phaser.Scene, worldW: number, worldH: number): void {
  void worldW;
  void worldH;

  const gGround = scene.add.graphics().setDepth(DEPTH_GROUND);
  const gPlaza  = scene.add.graphics().setDepth(DEPTH_PLAZA);
  const gRoad   = scene.add.graphics().setDepth(DEPTH_ROAD_ACC);
  const gShadow = scene.add.graphics().setDepth(DEPTH_SHADOW);
  const gProps  = scene.add.graphics().setDepth(DEPTH_PROPS);
  const gStruct = scene.add.graphics().setDepth(DEPTH_STRUCTURES);

  const { cx, cy, plazaRadius, bounds } = SPAWN_PLAZA;

  drawDistrictGround(gGround, bounds);
  drawStonePaving(gPlaza, cx, cy, plazaRadius);
  drawGoldFloorMarkings(gPlaza, cx, cy);
  drawSpawnRoadAccents(gRoad);

  // Props with shadows
  for (const b of SPAWN_PLAZA_PROP_POSITIONS.benches) {
    drawPropShadow(gShadow, b.x, b.y, 48, 20);
    drawBench(gProps, b.x, b.y, b.label.includes('n') ? 'h' : 'h');
  }
  for (const l of SPAWN_PLAZA_PROP_POSITIONS.lamps) {
    if (l.label === 'lamp-notice') continue;
    drawPropShadow(gShadow, l.x, l.y, 12, 36);
    drawLamp(gProps, l.x, l.y);
  }
  for (const p of SPAWN_PLAZA_PROP_POSITIONS.planters) {
    drawPropShadow(gShadow, p.x, p.y, 28, 24);
    drawPlanter(gProps, p.x, p.y, p.label.startsWith('bush'));
  }
  for (const m of SPAWN_PLAZA_PROP_POSITIONS.memorialStones) {
    drawPropShadow(gShadow, m.x, m.y, 32, 28);
    drawMemorialStone(gProps, m.x, m.y);
  }
  for (const c of SPAWN_PLAZA_PROP_POSITIONS.crates) {
    drawPropShadow(gShadow, c.x, c.y, 28, 24);
    drawCrate(gProps, c.x, c.y);
  }

  drawFountain(gStruct, FOUNTAIN.cx, FOUNTAIN.cy);
  drawNoticeBoard(gStruct);

  // Minimap
  const b = bounds;
  addMinimapDistrict('spawn', b.x / worldW, b.y / worldH, b.w / worldW, b.h / worldH);
  addMinimapBuilding(
    (FOUNTAIN.cx - FOUNTAIN.w / 2) / worldW,
    (FOUNTAIN.cy - FOUNTAIN.h / 2) / worldH,
    FOUNTAIN.w / worldW,
    FOUNTAIN.h / worldH,
    'fountain',
  );
  const nx = NOTICE_BOARD.cx + NOTICE_BOARD.ox - NOTICE_BOARD.w / 2;
  const ny = NOTICE_BOARD.cy + NOTICE_BOARD.oy - NOTICE_BOARD.h / 2;
  addMinimapBuilding(nx / worldW, ny / worldH, NOTICE_BOARD.w / worldW, NOTICE_BOARD.h / worldH, 'notice');
}
