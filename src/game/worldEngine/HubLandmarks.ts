/**
 * HubLandmarks.ts
 * ───────────────
 * Handcrafted dark/gold placeholder silhouettes for hub + expansion landmarks.
 * Positions and sizes follow docs/MAP_MEASUREMENT_DESIGN_SPEC.md.
 * Visual only — collision remains the road network.
 */

import Phaser from 'phaser';
import { addMinimapBuilding } from './WorldMinimapData';
import {
  C_BUILDING_A, C_BUILDING_B, C_BUILDING_WIN, C_BORDER_DIM, C_BORDER_GOLD,
  C_DOOR_DARK, C_DOOR_FRAME, C_GROUND_MID, C_LAMP_GLOW, C_VAULT_FACE, C_VAULT_GOLD,
  C_LOCK_METAL, C_ARENA_FACE, C_ARENA_ACCENT, C_FENCE_LINE, C_METAL_DARK,
} from './WorldPalette';

export interface HubLandmarkSpec {
  id: string;
  label: string;
  /** World-pixel centre (from spec). */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Draw offset from centre so roads stay visually clear. */
  ox: number;
  oy: number;
  minimapTint: string;
}

/** Landmark layout at 3600×2400 — Phase 8B compact radial world. */
export const HUB_LANDMARK_SPECS: HubLandmarkSpec[] = [
  { id: 'fountain',       label: 'Spring Water',          cx: 1800, cy: 1200, w: 280, h: 280, ox: 0,    oy: 0,    minimapTint: 'fountain' },
  { id: 'notice',         label: 'Notice Board',          cx: 1800, cy: 820,  w: 120, h: 100, ox: 0,    oy: -55,  minimapTint: 'notice' },
  { id: 'market',         label: 'Meme Market',           cx: 2700, cy: 1231, w: 320, h: 240, ox: 0,    oy: -90,  minimapTint: 'market' },
  { id: 'bridge',         label: 'Bridge',                cx: 1865, cy: 1947, w: 360, h: 120, ox: 0,    oy: -30,  minimapTint: 'bridge' },
  { id: 'alpha',          label: 'Alpha Lounge',          cx: 931,  cy: 1433, w: 280, h: 220, ox: 0,    oy: 75,   minimapTint: 'alpha' },
  { id: 'whale',          label: 'Whale Tower',           cx: 2316, cy: 463,  w: 200, h: 360, ox: 95,   oy: 0,    minimapTint: 'whale' },
  { id: 'fame',           label: 'Hall of Fame',          cx: 1420, cy: 384,  w: 300, h: 260, ox: 0,    oy: 95,   minimapTint: 'fame' },
  { id: 'coffee',         label: 'Coffee Shop',           cx: 1471, cy: 1010, w: 200, h: 180, ox: -75,  oy: 20,   minimapTint: 'coffee' },
  { id: 'park',           label: 'Park Entrance',         cx: 1399, cy: 2061, w: 240, h: 160, ox: 0,    oy: 70,   minimapTint: 'park' },
  { id: 'cashback',       label: 'Holder Cashback Vault',  cx: 1652, cy: 2037, w: 210, h: 170, ox: 0,    oy: -30,  minimapTint: 'cashback' },
  { id: 'arena',          label: 'Future Arena',          cx: 2919, cy: 2074, w: 310, h: 250, ox: 0,    oy: -25,  minimapTint: 'arena' },
];

/** No landmarks are handled by dedicated district modules in Phase 8B —
 *  SpawnPlazaDistrict / HallOfFameDistrict are not invoked (old-world
 *  pixel coordinates, see world-layout-blueprint.ts `conflicts`), so
 *  every id above draws its own placeholder silhouette. */
const DISTRICT_ART_IDS = new Set<string>();

function bx(s: HubLandmarkSpec): number { return s.cx + s.ox - s.w / 2; }
function by(s: HubLandmarkSpec): number { return s.cy + s.oy - s.h / 2; }

function registerFootprint(s: HubLandmarkSpec, worldW: number, worldH: number): void {
  const x = bx(s), y = by(s);
  addMinimapBuilding(x / worldW, y / worldH, s.w / worldW, s.h / worldH, s.minimapTint);
}

function lampPost(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(C_METAL_DARK, 1);
  g.fillRect(x - 2, y - 28, 4, 28);
  g.fillStyle(C_LAMP_GLOW, 0.55);
  g.fillCircle(x, y - 30, 5);
}

function drawFountain(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const cx = s.cx, cy = s.cy;
  g.fillStyle(C_GROUND_MID, 0.35);
  g.fillCircle(cx, cy, 140);
  g.lineStyle(2, C_BORDER_GOLD, 0.45);
  g.strokeCircle(cx, cy, 140);
  for (const [lx, ly] of [[-100, -80], [100, -80], [-100, 90], [100, 90]] as const) {
    lampPost(g, cx + lx, cy + ly);
  }
  g.fillStyle(0x0c1014, 1);
  g.fillCircle(cx, cy, 95);
  g.lineStyle(3, C_BORDER_GOLD, 0.7);
  g.strokeCircle(cx, cy, 95);
  g.fillStyle(0x0a0e12, 1);
  g.fillCircle(cx, cy, 70);
  g.fillStyle(0x1a3040, 0.85);
  g.fillCircle(cx, cy, 48);
  g.fillStyle(C_BORDER_GOLD, 0.35);
  g.fillCircle(cx, cy, 48);
  g.fillStyle(C_LAMP_GLOW, 0.2);
  g.fillCircle(cx, cy - 8, 22);
}

function drawNoticeBoard(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(0x2a1e12, 1);
  g.fillRect(x + 18, y + h - 8, 6, 28);
  g.fillRect(x + w - 24, y + h - 8, 6, 28);
  g.fillStyle(C_BUILDING_B, 1);
  g.fillRect(x + 8, y + 12, w - 16, h - 28);
  g.lineStyle(2, C_BORDER_GOLD, 0.75);
  g.strokeRect(x + 8, y + 12, w - 16, h - 28);
  g.fillStyle(C_BUILDING_WIN, 0.25);
  for (let i = 0; i < 3; i++) {
    g.fillRect(x + 18, y + 22 + i * 18, w - 36, 10);
  }
  g.fillStyle(C_BORDER_GOLD, 0.5);
  g.fillCircle(x + w - 22, y + 20, 4);
}

function drawMemeMarket(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(C_BUILDING_A, 1);
  g.fillRect(x + 20, y + 50, w - 40, h - 70);
  g.lineStyle(2, C_BORDER_DIM, 0.6);
  g.strokeRect(x + 20, y + 50, w - 40, h - 70);
  g.fillStyle(C_BORDER_GOLD, 0.4);
  g.beginPath();
  g.moveTo(x + 10, y + 55);
  g.lineTo(x + w / 2, y + 18);
  g.lineTo(x + w - 10, y + 55);
  g.closePath();
  g.fillPath();
  for (let i = 0; i < 4; i++) {
    const sx = x + 35 + i * 68;
    g.fillStyle(i % 2 === 0 ? C_BUILDING_B : C_BUILDING_A, 1);
    g.fillTriangle(sx, y + h - 30, sx + 28, y + h - 30, sx + 14, y + h - 55);
    g.fillStyle(C_BUILDING_WIN, 0.2);
    g.fillRect(sx + 4, y + h - 28, 20, 14);
  }
  g.fillStyle(C_DOOR_FRAME, 0.65);
  g.fillRect(s.cx - 24, y + h - 48, 48, 38);
  g.fillStyle(C_DOOR_DARK, 1);
  g.fillRect(s.cx - 18, y + h - 44, 36, 32);
}

function drawHallOfFame(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(C_GROUND_MID, 0.4);
  g.fillRect(x + 30, y + h - 28, w - 60, 24);
  g.fillStyle(C_BUILDING_A, 1);
  g.fillRect(x + 40, y + 40, w - 80, h - 68);
  g.fillStyle(C_BORDER_GOLD, 0.45);
  g.beginPath();
  g.moveTo(x + 35, y + 42);
  g.lineTo(x + w / 2, y + 8);
  g.lineTo(x + w - 35, y + 42);
  g.closePath();
  g.fillPath();
  for (const px of [x + 58, x + w - 72]) {
    g.fillStyle(C_BORDER_GOLD, 0.35);
    g.fillRect(px, y + 48, 14, h - 76);
    g.fillStyle(0x0a1014, 0.6);
    g.fillRect(px + 3, y + 52, 8, h - 84);
  }
  g.fillStyle(C_BUILDING_WIN, 0.3);
  g.fillRect(x + w / 2 - 40, y + 62, 80, 28);
  g.lineStyle(1, C_BORDER_GOLD, 0.5);
  g.strokeRect(x + w / 2 - 40, y + 62, 80, 28);
}

function drawAlphaLounge(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(C_BUILDING_B, 1);
  g.fillRect(x + 25, y + 20, w - 50, h - 45);
  g.lineStyle(2, C_BORDER_GOLD, 0.35);
  g.strokeRect(x + 25, y + 20, w - 50, h - 45);
  g.fillStyle(C_BORDER_GOLD, 0.25);
  g.fillEllipse(s.cx, y + 18, w - 40, 28);
  g.fillStyle(C_BUILDING_WIN, 0.18);
  g.fillRect(x + 50, y + 45, 55, 35);
  g.fillRect(x + w - 105, y + 45, 55, 35);
  g.fillStyle(C_LAMP_GLOW, 0.35);
  g.fillCircle(x + 38, y + 32, 6);
  g.fillStyle(C_DOOR_DARK, 1);
  g.fillRect(s.cx - 22, y + h - 52, 44, 36);
  g.fillStyle(C_BORDER_GOLD, 0.6);
  g.fillRect(s.cx - 30, y + 8, 60, 12);
}

function drawWhaleTower(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(C_BUILDING_A, 1);
  g.fillRect(x + 55, y + 40, w - 110, h - 60);
  g.lineStyle(2, C_BORDER_DIM, 0.55);
  g.strokeRect(x + 55, y + 40, w - 110, h - 60);
  g.fillStyle(C_BORDER_GOLD, 0.3);
  for (let row = 0; row < 5; row++) {
    g.fillRect(x + 68, y + 55 + row * 52, 16, 22);
    g.fillRect(x + w - 84, y + 55 + row * 52, 16, 22);
  }
  g.fillStyle(C_BUILDING_WIN, 0.22);
  g.fillCircle(x + w / 2, y + 28, 22);
  g.lineStyle(2, C_BORDER_GOLD, 0.5);
  g.strokeCircle(x + w / 2, y + 28, 22);
  g.lineStyle(3, C_BORDER_GOLD, 0.6);
  g.lineBetween(x + w / 2, y + 6, x + w / 2 + 18, y - 18);
  g.fillStyle(C_LAMP_GLOW, 0.4);
  g.fillTriangle(x + w / 2 + 14, y - 22, x + w / 2 + 22, y - 14, x + w / 2 + 10, y - 10);
}

function drawCoffeeShop(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(C_BUILDING_B, 1);
  g.fillRect(x + 20, y + 35, w - 40, h - 50);
  g.lineStyle(2, C_BORDER_DIM, 0.5);
  g.strokeRect(x + 20, y + 35, w - 40, h - 50);
  g.fillStyle(0x1a1410, 1);
  g.fillRect(x + w - 38, y + 8, 14, 32);
  g.fillStyle(C_LAMP_GLOW, 0.15);
  g.fillRect(x + 38, y + 55, 42, 30);
  g.fillRect(x + 100, y + 55, 42, 30);
  g.fillStyle(C_BORDER_GOLD, 0.55);
  g.fillCircle(x + 32, y + 48, 18);
  g.lineStyle(2, C_BORDER_GOLD, 0.6);
  g.strokeCircle(x + 32, y + 48, 18);
  g.fillStyle(C_DOOR_DARK, 1);
  g.fillRect(x + w / 2 - 18, y + h - 48, 36, 32);
}

function drawParkEntrance(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(0x0a1810, 0.5);
  g.fillRect(x + 40, y + 20, w - 80, h - 35);
  g.lineStyle(3, C_BORDER_GOLD, 0.45);
  g.beginPath();
  g.arc(s.cx, y + h - 25, w / 2 - 30, Math.PI, 0, false);
  g.strokePath();
  g.lineStyle(4, C_FENCE_LINE, 0.7);
  g.lineBetween(x + 42, y + h - 25, x + 42, y + 30);
  g.lineBetween(x + w - 42, y + h - 25, x + w - 42, y + 30);
  g.fillStyle(0x142218, 0.8);
  g.fillCircle(x + 55, y + h - 20, 18);
  g.fillCircle(x + w - 55, y + h - 20, 18);
}

function drawBridge(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  const waterY = y + h - 20;
  g.fillStyle(0x060a10, 1);
  g.fillRect(x, waterY, w, 28);
  g.fillStyle(0x0a1420, 0.5);
  g.fillRect(x + 20, waterY + 4, w - 40, 8);
  const deckY = y + 35;
  g.lineStyle(4, C_BUILDING_A, 1);
  g.lineBetween(x + 20, deckY, x + 130, deckY);
  g.lineBetween(x + w - 130, deckY, x + w - 20, deckY);
  for (const ax of [x + 55, x + w - 55]) {
    g.lineStyle(3, C_BORDER_GOLD, 0.55);
    g.beginPath();
    g.arc(ax, deckY, 38, Math.PI, 0, false);
    g.strokePath();
    lampPost(g, ax, deckY - 8);
  }
}

function drawCashbackVault(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.fillStyle(C_VAULT_FACE, 1);
  g.fillRect(x, y, w, h);
  g.lineStyle(3, C_VAULT_GOLD, 0.82);
  g.strokeRect(x, y, w, h);
  g.fillStyle(C_VAULT_GOLD, 0.5);
  g.fillRect(x - 6, y - 8, w + 12, 10);
  for (const px of [x + 22, x + w - 22]) {
    g.fillStyle(C_VAULT_GOLD, 0.35);
    g.fillRect(px - 6, y - 4, 12, h + 8);
  }
  g.fillStyle(C_DOOR_DARK, 1);
  g.fillRect(s.cx - 24, y + h - 68, 48, 68);
  g.fillStyle(C_LOCK_METAL, 1);
  g.fillRect(s.cx - 12, y + h / 2 - 8, 24, 18);
  g.lineStyle(4, C_LOCK_METAL, 1);
  g.beginPath();
  g.arc(s.cx, y + h / 2 - 8, 9, Math.PI, 0, false);
  g.strokePath();
}

function drawArena(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  const cut = 36;
  g.fillStyle(C_ARENA_FACE, 1);
  g.fillRect(x + cut, y, w - cut * 2, h);
  g.fillRect(x, y + cut, w, h - cut * 2);
  g.lineStyle(3, C_ARENA_ACCENT, 0.78);
  g.strokeRect(x + cut, y, w - cut * 2, h);
  g.fillStyle(C_ARENA_ACCENT, 0.45);
  g.fillRect(x + cut - 4, y - 9, w - cut * 2 + 8, 11);
  for (let i = 0; i < 5; i++) {
    const px = x + cut + 12 + i * ((w - cut * 2 - 24) / 4);
    g.fillStyle(C_ARENA_ACCENT, 0.25);
    g.fillRect(px - 3, y - 7, 6, h + 9);
  }
  g.fillStyle(C_DOOR_DARK, 1);
  g.fillRect(s.cx - 34, y + h - 86, 68, 86);
  g.fillStyle(C_ARENA_ACCENT, 0.55);
  g.fillRect(s.cx - 50, y + 12, 100, 14);
}

function drawNftShop(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.lineStyle(2, C_FENCE_LINE, 0.65);
  g.strokeRect(x - 8, y - 8, w + 16, h + 16);
  g.fillStyle(C_BUILDING_A, 1);
  g.fillRect(x, y + 40, w * 0.55, h - 55);
  g.fillStyle(C_BUILDING_B, 1);
  g.fillRect(x + w * 0.48, y, w * 0.52, h * 0.65);
  g.lineStyle(2, C_BORDER_GOLD, 0.4);
  g.strokeRect(x, y + 40, w * 0.55, h - 55);
  g.strokeRect(x + w * 0.48, y, w * 0.52, h * 0.65);
  g.fillStyle(C_BORDER_GOLD, 0.35);
  g.fillRect(x + w * 0.48 - 4, y + 8, 8, h * 0.55);
  g.fillStyle(C_BUILDING_WIN, 0.2);
  g.fillRect(x + 20, y + 60, 40, 30);
  g.fillRect(x + w - 70, y + 25, 45, 35);
  g.fillStyle(C_LOCK_METAL, 0.7);
  g.fillRect(s.cx - 14, y + h - 38, 28, 22);
}

function drawLockedPad(g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec): void {
  const x = bx(s), y = by(s), w = s.w, h = s.h;
  g.lineStyle(2, C_FENCE_LINE, 0.75);
  g.strokeRect(x - 6, y - 6, w + 12, h + 12);
  g.fillStyle(C_BUILDING_A, 0.85);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, C_BORDER_DIM, 0.45);
  g.strokeRect(x, y, w, h);
  g.lineStyle(3, C_BORDER_GOLD, 0.35);
  g.lineBetween(x + 20, y + 20, x + w - 20, y + h - 20);
  g.lineBetween(x + w - 20, y + 20, x + 20, y + h - 20);
  g.fillStyle(C_LOCK_METAL, 0.8);
  g.fillCircle(s.cx, s.cy, 14);
}

const DRAWERS: Record<string, (g: Phaser.GameObjects.Graphics, s: HubLandmarkSpec) => void> = {
  fountain: drawFountain,
  notice: drawNoticeBoard,
  market: drawMemeMarket,
  bridge: drawBridge,
  alpha: drawAlphaLounge,
  whale: drawWhaleTower,
  fame: drawHallOfFame,
  coffee: drawCoffeeShop,
  park: drawParkEntrance,
  cashback: drawCashbackVault,
  arena: drawArena,
  'nft-shop': drawNftShop,
  'locked-east-1': drawLockedPad,
  'locked-north-1': drawLockedPad,
  'locked-west-1': drawLockedPad,
};

/** Draw every hub landmark placeholder and register minimap footprints. */
export function drawHubLandmarks(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
): HubLandmarkSpec[] {
  const g = scene.add.graphics().setDepth(1);
  for (const spec of HUB_LANDMARK_SPECS) {
    if (DISTRICT_ART_IDS.has(spec.id)) continue;
    const draw = DRAWERS[spec.id];
    if (draw) draw(g, spec);
    registerFootprint(spec, worldW, worldH);
  }
  return HUB_LANDMARK_SPECS;
}

/** Minimap footprints only — used when WorldAssetLoader renders building sprites. */
export function registerHubLandmarksMinimap(worldW: number, worldH: number): void {
  for (const spec of HUB_LANDMARK_SPECS) {
    registerFootprint(spec, worldW, worldH);
  }
}

/** Extra proximity-only labels (expansion pads not in WorldObjects).
 *  Phase 8B: empty — the nine new landmark ids now live in WorldObjects
 *  directly (see BuildingSystem.ts label list) instead of as generic
 *  placeholder pads. */
export const PROXIMITY_ONLY_LABELS: { id: string; label: string; icon: string; cx: number; cy: number }[] = [];
