/**
 * HallOfFameDistrict.ts
 * ─────────────────────
 * Build 2 — Hall of Fame district art pass.
 * Legendary · prestigious · elite — dark obsidian, gold trim, warm lanterns.
 * Static Phaser Graphics only. No collision / gameplay changes.
 *
 * Landmark centre: (3034, 3607) · District bounds: 2800–3500 × 3200–3800
 * Door faces south toward (3034, 3753) — north approach stays on road network.
 */

import Phaser from 'phaser';
import { addMinimapBuilding, addMinimapDistrict } from '../WorldMinimapData';
import {
  C_LAMP_GLOW, C_METAL_DARK,
  C_LEAF_DARK, C_LEAF_MID, C_FLOWER_GOLD,
} from '../WorldPalette';

/* ─── Spec constants ──────────────────────────────────────────────────── */

export const HALL_OF_FAME = {
  cx: 3034,
  cy: 3607,
  w: 300,
  h: 260,
  ox: 0,
  oy: 95,
  bounds: { x: 2800, y: 3200, w: 700, h: 600 },
  door: { x: 3034, y: 3753 },
} as const;

/** Decorative prop positions — leaderboard statues use WorldScene offsets at centre. */
export const HOF_PROP_POSITIONS = {
  trees: [
    { x: 2840, y: 3260 }, { x: 3460, y: 3265 },
    { x: 2825, y: 3480 }, { x: 3475, y: 3475 },
    { x: 2910, y: 3785 }, { x: 3160, y: 3788 },
  ],
  flowerBeds: [
    { x: 2885, y: 3340, w: 70, h: 28 },
    { x: 3185, y: 3345, w: 75, h: 28 },
    { x: 2860, y: 3680, w: 65, h: 24 },
    { x: 3210, y: 3675, w: 68, h: 24 },
  ],
  lanterns: [
    { x: 2920, y: 3520 }, { x: 3148, y: 3520 },
    { x: 2875, y: 3640 }, { x: 3195, y: 3640 },
    { x: 2985, y: 3710 }, { x: 3083, y: 3710 },
    { x: 2850, y: 3410 }, { x: 3220, y: 3410 },
  ],
  benches: [
    { x: 2905, y: 3565 }, { x: 3165, y: 3565 },
    { x: 2880, y: 3740 }, { x: 3188, y: 3740 },
  ],
  heroStatues: [
    { x: 2895, y: 3595, variant: 'knight' as const },
    { x: 3173, y: 3595, variant: 'sage' as const },
    { x: 2968, y: 3718, variant: 'champion' as const },
    { x: 3100, y: 3718, variant: 'oracle' as const },
  ],
  trophies: [
    { x: 2928, y: 3788 }, { x: 3034, y: 3795 }, { x: 3140, y: 3788 },
  ],
  banners: [
    { x: 2945, y: 3660, side: 'left' as const },
    { x: 3123, y: 3660, side: 'right' as const },
    { x: 3034, y: 3625, side: 'center' as const },
  ],
} as const;

const DEPTH_TERRAIN     = -1.80;
const DEPTH_MARBLE      = -1.72;
const DEPTH_ROAD_ACC    = -0.94;
const DEPTH_SHADOW      = 1.06;
const DEPTH_PROPS       = 1.26;
const DEPTH_STRUCTURES  = 1.46;
const DEPTH_DETAIL      = 1.54;

const OBSIDIAN     = 0x080a0e;
const OBSIDIAN_MID = 0x101820;
const OBSIDIAN_LITE = 0x161e28;
const MARBLE       = 0x1c242c;
const MARBLE_LITE  = 0x283038;
const MARBLE_VEIN  = 0x343c44;
const GOLD         = 0xc8902a;
const GOLD_BRIGHT  = 0xe8b84b;
const GOLD_DEEP    = 0x907020;

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function shadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x000000, 0.24);
  g.fillEllipse(x, y + h * 0.45, w, h * 0.32);
}

/** Raised platform — pseudo-isometric top face + south drop shadow edge. */
function drawRaisedPlatform(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  rise: number, topColor: number, edgeColor: number,
): void {
  g.fillStyle(edgeColor, 1);
  g.fillRect(x, y + rise, w, h);
  g.fillStyle(topColor, 1);
  g.fillRect(x, y, w, h - rise);
  g.lineStyle(1, MARBLE_VEIN, 0.25);
  for (let lx = x + 12; lx < x + w - 8; lx += 36) {
    g.lineBetween(lx, y + 4, lx, y + h - rise - 4);
  }
  g.lineStyle(2, GOLD, 0.2);
  g.strokeRect(x, y, w, h - rise);
}

function drawMarbleTerrace(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
): void {
  drawRaisedPlatform(g, x, y, w, h, 6, MARBLE_LITE, MARBLE);
  g.lineStyle(1, MARBLE_VEIN, 0.35);
  const step = 44;
  for (let ox = x + step; ox < x + w; ox += step) {
    g.lineBetween(ox, y + 2, ox, y + h - 8);
  }
  for (let oy = y + step; oy < y + h - 6; oy += step) {
    g.lineBetween(x + 2, oy, x + w - 2, oy);
  }
}

function drawPillar(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number): void {
  g.fillStyle(OBSIDIAN_MID, 1);
  g.fillRect(x - 10, y - h, 20, h);
  g.fillStyle(GOLD, 0.55);
  g.fillRect(x - 12, y - h - 6, 24, 8);
  g.fillRect(x - 12, y - 8, 24, 8);
  g.fillStyle(OBSIDIAN_LITE, 0.5);
  g.fillRect(x - 3, y - h + 8, 6, h - 16);
}

function drawArch(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
): void {
  drawPillar(g, x - w / 2 + 10, y, h);
  drawPillar(g, x + w / 2 - 10, y, h);
  g.lineStyle(4, GOLD, 0.65);
  g.beginPath();
  g.arc(x, y - h + 8, w / 2 - 8, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(OBSIDIAN, 0.7);
  g.fillRect(x - w / 2 + 12, y - h + 12, w - 24, h - 20);
}

function drawLantern(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(C_METAL_DARK, 1);
  g.fillRect(x - 2, y - 38, 4, 38);
  g.fillStyle(GOLD_DEEP, 0.9);
  g.fillRect(x - 7, y - 42, 14, 10);
  g.fillStyle(C_LAMP_GLOW, 0.7);
  g.fillCircle(x, y - 48, 6);
  g.fillStyle(C_LAMP_GLOW, 0.1);
  g.fillCircle(x, y - 48, 18);
}

function drawStoneBench(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(MARBLE, 1);
  g.fillRect(x - 28, y - 8, 56, 16);
  g.lineStyle(1, GOLD, 0.35);
  g.strokeRect(x - 28, y - 8, 56, 16);
  g.fillStyle(OBSIDIAN_MID, 1);
  g.fillRect(x - 24, y + 8, 10, 12);
  g.fillRect(x + 14, y + 8, 10, 12);
}

function drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
  const s = scale;
  g.fillStyle(0x1a1410, 1);
  g.fillRect(x - 4 * s, y - 6 * s, 8 * s, 18 * s);
  g.fillStyle(C_LEAF_DARK, 0.95);
  g.fillCircle(x - 10 * s, y - 18 * s, 14 * s);
  g.fillCircle(x + 11 * s, y - 20 * s, 15 * s);
  g.fillCircle(x, y - 28 * s, 18 * s);
  g.fillStyle(C_LEAF_MID, 0.4);
  g.fillCircle(x - 4 * s, y - 22 * s, 10 * s);
}

function drawFlowerBed(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x141c18, 1);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, GOLD, 0.3);
  g.strokeRect(x, y, w, h);
  for (let i = 0; i < 8; i++) {
    const fx = x + 10 + (i % 4) * (w / 4);
    const fy = y + 8 + Math.floor(i / 4) * (h / 2);
    g.fillStyle(i % 2 === 0 ? C_FLOWER_GOLD : 0x8a6030, 0.75);
    g.fillCircle(fx, fy, 4);
  }
}

function drawDecorativeWall(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  capGold = true,
): void {
  g.fillStyle(OBSIDIAN, 0.92);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, OBSIDIAN_LITE, 0.4);
  for (let oy = y + 16; oy < y + h; oy += 28) {
    g.lineBetween(x + 4, oy, x + w - 4, oy);
  }
  if (capGold) {
    g.fillStyle(GOLD, 0.4);
    g.fillRect(x, y, w, 6);
  }
}

function drawGoldBanner(g: Phaser.GameObjects.Graphics, x: number, y: number, side: 'left' | 'right' | 'center'): void {
  const w = side === 'center' ? 22 : 18;
  const h = side === 'center' ? 52 : 44;
  const skew = side === 'left' ? -4 : side === 'right' ? 4 : 0;
  g.fillStyle(GOLD_DEEP, 0.85);
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.lineTo(x + w / 2 + skew, y);
  g.lineTo(x + w / 2, y + h);
  g.lineTo(x - w / 2 + skew, y + h);
  g.closePath();
  g.fillPath();
  g.lineStyle(2, GOLD_BRIGHT, 0.6);
  g.strokeRect(x - w / 2 + 2, y + 6, w - 4, h - 14);
  g.fillStyle(GOLD_BRIGHT, 0.35);
  g.fillCircle(x + skew * 0.5, y + h * 0.45, 5);
}

function drawTrophyDisplay(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(OBSIDIAN_MID, 1);
  g.fillRect(x - 18, y - 32, 36, 36);
  g.lineStyle(2, GOLD, 0.55);
  g.strokeRect(x - 18, y - 32, 36, 36);
  g.fillStyle(GOLD_BRIGHT, 0.8);
  g.fillRect(x - 8, y - 22, 16, 12);
  g.fillStyle(GOLD, 0.9);
  g.beginPath();
  g.moveTo(x - 12, y - 10);
  g.lineTo(x, y - 20);
  g.lineTo(x + 12, y - 10);
  g.closePath();
  g.fillPath();
  g.fillStyle(GOLD_DEEP, 1);
  g.fillRect(x - 6, y - 8, 12, 10);
}

function drawHeroStatue(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number,
  variant: 'knight' | 'sage' | 'champion' | 'oracle',
): void {
  shadow(g, x, y, 36, 40);
  g.fillStyle(MARBLE, 1);
  g.fillRect(x - 20, y - 4, 40, 14);
  g.fillStyle(GOLD, 0.5);
  g.fillRect(x - 20, y - 4, 40, 3);

  const bodyColor = 0x9a9ea8;
  const dark = 0x6a6e78;
  g.fillStyle(bodyColor, 1);
  switch (variant) {
    case 'knight':
      g.fillRoundedRect(x - 11, y - 28, 22, 24, 2);
      g.fillStyle(dark, 0.7);
      g.fillTriangle(x - 14, y - 30, x, y - 42, x + 14, y - 30);
      break;
    case 'sage':
      g.fillRoundedRect(x - 9, y - 26, 18, 22, 3);
      g.fillStyle(dark, 0.6);
      g.fillRect(x - 12, y - 18, 24, 4);
      g.fillCircle(x, y - 32, 8);
      break;
    case 'champion':
      g.fillRoundedRect(x - 12, y - 30, 24, 26, 2);
      g.fillStyle(GOLD, 0.4);
      g.fillRect(x - 4, y - 38, 8, 10);
      g.fillCircle(x, y - 34, 9);
      break;
    case 'oracle':
      g.fillRoundedRect(x - 10, y - 27, 20, 23, 4);
      g.fillStyle(GOLD_BRIGHT, 0.25);
      g.fillCircle(x, y - 34, 10);
      g.fillStyle(dark, 0.5);
      g.fillRect(x - 14, y - 22, 6, 16);
      g.fillRect(x + 8, y - 22, 6, 16);
      break;
  }
}

function drawGrandStaircase(g: Phaser.GameObjects.Graphics, cx: number, topY: number, bottomY: number, width: number): void {
  const steps = 7;
  const stepH = (bottomY - topY) / steps;
  for (let i = 0; i < steps; i++) {
    const sy = topY + i * stepH;
    const inset = i * 5;
    const sw = width - inset * 2;
    const shade = i % 2 === 0 ? MARBLE_LITE : MARBLE;
    g.fillStyle(shade, 1);
    g.fillRect(cx - sw / 2, sy, sw, stepH + 1);
    g.lineStyle(1, GOLD, 0.15);
    g.lineBetween(cx - sw / 2, sy, cx + sw / 2, sy);
  }
  g.lineStyle(2, GOLD, 0.35);
  g.lineBetween(cx - width / 2, topY, cx - width / 2 + 20, bottomY);
  g.lineBetween(cx + width / 2, topY, cx + width / 2 - 20, bottomY);
}

function drawGoldEntrance(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const archW = 88;
  const archH = 72;
  g.fillStyle(OBSIDIAN, 1);
  g.fillRect(cx - archW / 2 - 14, cy - archH, 14, archH + 8);
  g.fillRect(cx + archW / 2, cy - archH, 14, archH + 8);
  g.fillStyle(GOLD, 0.25);
  g.fillRect(cx - archW / 2 - 14, cy - archH - 8, archW + 28, 10);
  g.lineStyle(5, GOLD_BRIGHT, 0.85);
  g.beginPath();
  g.arc(cx, cy - archH + 12, archW / 2, Math.PI, 0, false);
  g.strokePath();
  g.lineStyle(3, GOLD, 0.7);
  g.strokeRect(cx - archW / 2 + 6, cy - archH + 20, archW - 12, archH - 12);
  g.fillStyle(0x06080c, 1);
  g.fillRect(cx - archW / 2 + 12, cy - 36, archW - 24, 52);
  g.fillStyle(GOLD_BRIGHT, 0.2);
  g.fillRect(cx - archW / 2 + 12, cy - 36, archW - 24, 8);
}

function drawMassiveHall(g: Phaser.GameObjects.Graphics, cx: number, baseY: number): void {
  const facadeW = 340;
  const facadeH = 118;
  const fx = cx - facadeW / 2;
  const fy = baseY - facadeH;

  // Main obsidian block — trapezoid hint (wider at base)
  g.fillStyle(OBSIDIAN, 1);
  g.fillRect(fx, fy, facadeW, facadeH);
  g.fillStyle(OBSIDIAN_MID, 1);
  g.beginPath();
  g.moveTo(fx + 20, fy);
  g.lineTo(fx + facadeW - 20, fy);
  g.lineTo(fx + facadeW, fy + facadeH);
  g.lineTo(fx, fy + facadeH);
  g.closePath();
  g.fillPath();

  // Pediment
  g.fillStyle(OBSIDIAN_LITE, 1);
  g.beginPath();
  g.moveTo(fx + 30, fy);
  g.lineTo(cx, fy - 38);
  g.lineTo(fx + facadeW - 30, fy);
  g.closePath();
  g.fillPath();
  g.lineStyle(3, GOLD, 0.75);
  g.beginPath();
  g.moveTo(fx + 30, fy);
  g.lineTo(cx, fy - 38);
  g.lineTo(fx + facadeW - 30, fy);
  g.strokePath();
  g.fillStyle(GOLD_BRIGHT, 0.45);
  g.fillCircle(cx, fy - 18, 12);

  // Colonnade
  for (let i = 0; i < 8; i++) {
    const px = fx + 28 + i * ((facadeW - 56) / 7);
    drawPillar(g, px, fy + facadeH, facadeH - 12);
  }

  // Gold band
  g.fillStyle(GOLD, 0.35);
  g.fillRect(fx + 16, fy + 28, facadeW - 32, 8);
  g.fillRect(fx + 16, fy + facadeH - 18, facadeW - 32, 6);

  drawGoldEntrance(g, cx, baseY - 8);

  // Side wings (stepped back — multi-level)
  const wingW = 72;
  const wingH = 64;
  g.fillStyle(OBSIDIAN_MID, 0.95);
  g.fillRect(fx - wingW - 10, fy + 36, wingW, wingH);
  g.fillRect(fx + facadeW + 10, fy + 36, wingW, wingH);
  g.lineStyle(2, GOLD, 0.3);
  g.strokeRect(fx - wingW - 10, fy + 36, wingW, wingH);
  g.strokeRect(fx + facadeW + 10, fy + 36, wingW, wingH);
}

function drawCourtyard(g: Phaser.GameObjects.Graphics, bounds: typeof HALL_OF_FAME.bounds): void {
  const { x, y, w, h } = bounds;
  g.fillStyle(OBSIDIAN, 0.65);
  g.fillRect(x, y, w, h);

  // Lower outer court (tier 0)
  drawRaisedPlatform(g, x + 40, y + 40, w - 80, 160, 4, OBSIDIAN_LITE, OBSIDIAN_MID);

  // Mid terrace (tier 1) — north courtyard
  drawMarbleTerrace(g, x + 70, y + 200, w - 140, 200);

  // Hero terrace (tier 2) — around landmark node
  drawMarbleTerrace(g, x + 100, y + 400, w - 200, 175);

  // Stair landing (tier 3)
  drawRaisedPlatform(g, x + 130, y + 565, w - 260, 28, 8, MARBLE_LITE, MARBLE);
}

function drawRoadApproach(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const half = 64;
  g.fillStyle(0x0a0e12, 0.4);
  g.fillRect(cx - half, cy - half - 80, half * 2, 80);
  g.lineStyle(2, 0x1a2838, 0.55);
  g.lineBetween(cx - half, cy - half, cx + half, cy - half);
  g.fillStyle(MARBLE, 0.45);
  g.fillRect(cx - half - 10, cy - half - 12, 10, half * 2 + 24);
  g.fillRect(cx + half, cy - half - 12, 10, half * 2 + 24);
  g.fillStyle(GOLD_BRIGHT, 0.45);
  for (let dy = cy - half - 60; dy < cy + half; dy += 48) {
    g.fillCircle(cx - half - 5, dy, 2);
    g.fillCircle(cx + half + 5, dy, 2);
  }
}

/* ─── Main entry ──────────────────────────────────────────────────────── */

export function generateHallOfFameDistrict(scene: Phaser.Scene, worldW: number, worldH: number): void {
  const gTerrain = scene.add.graphics().setDepth(DEPTH_TERRAIN);
  const gMarble  = scene.add.graphics().setDepth(DEPTH_MARBLE);
  const gRoad    = scene.add.graphics().setDepth(DEPTH_ROAD_ACC);
  const gShadow  = scene.add.graphics().setDepth(DEPTH_SHADOW);
  const gProps   = scene.add.graphics().setDepth(DEPTH_PROPS);
  const gStruct  = scene.add.graphics().setDepth(DEPTH_STRUCTURES);
  const gDetail  = scene.add.graphics().setDepth(DEPTH_DETAIL);

  const { cx, cy, bounds } = HALL_OF_FAME;

  drawCourtyard(gTerrain, bounds);
  drawRoadApproach(gRoad, cx, cy);

  // Decorative perimeter walls
  drawDecorativeWall(gStruct, bounds.x + 12, bounds.y + 20, 18, bounds.h - 40);
  drawDecorativeWall(gStruct, bounds.x + bounds.w - 30, bounds.y + 20, 18, bounds.h - 40);

  // Entry arches (north approach)
  drawArch(gStruct, cx - 120, cy - 40, 70, 58);
  drawArch(gStruct, cx + 120, cy - 40, 70, 58);

  // Trees at district edges
  for (const t of HOF_PROP_POSITIONS.trees) {
    shadow(gShadow, t.x, t.y, 36, 40);
    drawTree(gProps, t.x, t.y, t.y > 3700 ? 0.9 : 1.05);
  }

  // Flower beds
  for (const f of HOF_PROP_POSITIONS.flowerBeds) {
    drawFlowerBed(gProps, f.x, f.y, f.w, f.h);
  }

  // Lanterns
  for (const l of HOF_PROP_POSITIONS.lanterns) {
    shadow(gShadow, l.x, l.y, 14, 40);
    drawLantern(gProps, l.x, l.y);
  }

  // Stone benches
  for (const b of HOF_PROP_POSITIONS.benches) {
    shadow(gShadow, b.x, b.y, 56, 20);
    drawStoneBench(gProps, b.x, b.y);
  }

  // Decorative hero statues (not leaderboard interactives)
  for (const s of HOF_PROP_POSITIONS.heroStatues) {
    drawHeroStatue(gDetail, s.x, s.y, s.variant);
  }

  // Grand staircase + massive hall
  const stairTop = cy + 55;
  const stairBottom = cy + 145;
  drawGrandStaircase(gMarble, cx, stairTop, stairBottom, 200);
  drawMassiveHall(gStruct, cx, bounds.y + bounds.h - 28);

  // Trophy alcoves along hall base
  for (const t of HOF_PROP_POSITIONS.trophies) {
    drawTrophyDisplay(gDetail, t.x, t.y);
  }

  // Gold banners
  for (const b of HOF_PROP_POSITIONS.banners) {
    drawGoldBanner(gDetail, b.x, b.y, b.side);
  }

  // Minimap
  const b = bounds;
  addMinimapDistrict('fame', b.x / worldW, b.y / worldH, b.w / worldW, b.h / worldH);
  const fx = cx + HALL_OF_FAME.ox - HALL_OF_FAME.w / 2;
  const fy = cy + HALL_OF_FAME.oy - HALL_OF_FAME.h / 2;
  addMinimapBuilding(fx / worldW, fy / worldH, HALL_OF_FAME.w / worldW, HALL_OF_FAME.h / worldH, 'fame');
}
