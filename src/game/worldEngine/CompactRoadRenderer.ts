/**
 * CompactRoadRenderer.ts
 * ───────────────────────
 * Phase 8G — visual ground layer for the compact 3600×2400 ring-and-spoke
 * road network, derived directly from RoadNetwork.ts (ROAD_NODES /
 * ROAD_EDGES / ROAD_WIDTH) — the exact same geometry the player's
 * collision uses. No second hand-maintained road coordinate system.
 *
 * Why graphics, not the terrain/road_* library assets: those pieces are
 * fixed-perspective diorama art (baked shadows, a specific camera angle,
 * torn non-rectangular silhouettes, one-off architectural details like
 * gate posts) — not modular tiles. They cannot be rotated/stretched to
 * match 28 road edges running in many different directions without
 * visible seams. Phaser Graphics fills reproduce the exact L-shaped
 * collision geometry at any angle with zero distortion (Task 5, Method C).
 *
 * Renders once at scene creation (static, no per-frame work, no gameplay
 * objects) at depth 0.2–0.5 — above the Midjourney terrain background
 * (depth 0) and below every building/prop/filler (depth ~1.1+) and the
 * player (depth 10). Semi-transparent by design (Task 13): the baked
 * background shows through rather than being fully replaced, since the
 * background art was not built around this specific road layout.
 */

import Phaser from 'phaser';
import { ROAD_NODES, ROAD_EDGES, ROAD_WIDTH, type RoadEdge } from '../world/RoadNetwork';

const CORE_HALF = ROAD_WIDTH / 2; // 44 — matches the walkable collision lane exactly
const SHOULDER = 9; // Task 6: 4-12px soft shoulder outside the collision lane

const ROAD_FILL_COLOR = 0x362c1c;
const ROAD_FILL_ALPHA = 0.46;
const ROAD_BORDER_COLOR = 0x1c160c;
const ROAD_BORDER_ALPHA = 0.4;
const SHOULDER_COLOR = 0xc8a860;
const SHOULDER_ALPHA = 0.09;

const PLAZA_ALPHA = 0.28;
const PLAZA_BORDER_ALPHA = 0.5;

/** Task 12 — subtle per-district plaza tint. Roads stay a neutral warm
 *  stone tone throughout for continuity; only plazas vary. */
const DISTRICT_TINT: Record<string, number> = {
  fountain: 0xf0dca0, notice: 0xf0dca0, coffee: 0xf0dca0,
  fame: 0xc0b8a8, government: 0xc0b8a8, trading_academy: 0xc0b8a8,
  market: 0xe0b060, market_shop: 0xe0b060,
  whale: 0xaab4bc, financial_office: 0xaab4bc, holder_bank: 0xaab4bc,
  research_observatory: 0xaab4bc, alpha: 0xaab4bc,
  nft_gallery: 0xd8c0a0, nft_creator_studio: 0xd8c0a0,
  arena: 0xd08858, tournament_hall: 0xd08858,
  park: 0x8fa070,
  bridge: 0x8fb0c0, cashback: 0x8fb0c0,
};

export class CompactRoadRenderer {
  private scene: Phaser.Scene;
  private shoulderGfx: Phaser.GameObjects.Graphics | null = null;
  private roadGfx: Phaser.GameObjects.Graphics | null = null;
  private plazaGfx: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Build the static ground layer once. Call after the terrain background
   *  is created and before/independent of buildings — depth ordering, not
   *  call order, controls stacking. */
  create(worldW: number, worldH: number): void {
    const nodeById = (id: string) => {
      const n = ROAD_NODES.find((nd) => nd.id === id);
      if (!n) throw new Error(`CompactRoadRenderer: unknown node "${id}"`);
      return n;
    };
    const px = (id: string) => nodeById(id).x * worldW;
    const py = (id: string) => nodeById(id).y * worldH;

    this.shoulderGfx = this.scene.add.graphics().setDepth(0.2);
    this.roadGfx = this.scene.add.graphics().setDepth(0.35);
    this.plazaGfx = this.scene.add.graphics().setDepth(0.45);

    // Shoulders first (soft blend layer, drawn beneath the paved fill).
    for (const e of ROAD_EDGES) {
      this.drawEdge(this.shoulderGfx, e, px, py, CORE_HALF + SHOULDER, SHOULDER_COLOR, SHOULDER_ALPHA, false);
    }

    // Paved road fill + subtle border.
    for (const e of ROAD_EDGES) {
      this.drawEdge(this.roadGfx, e, px, py, CORE_HALF, ROAD_FILL_COLOR, ROAD_FILL_ALPHA, true);
    }

    // Plazas — exact collision-square footprint (Task 6 alignment) with a
    // district-tinted wash and soft border ring.
    for (const n of ROAD_NODES) {
      const cx = n.x * worldW;
      const cy = n.y * worldH;
      const r = n.plaza;
      const tint = DISTRICT_TINT[n.id] ?? 0xd8c8a0;

      this.plazaGfx.fillStyle(tint, PLAZA_ALPHA);
      this.plazaGfx.fillRect(cx - r, cy - r, r * 2, r * 2);
      this.plazaGfx.lineStyle(2, tint, PLAZA_BORDER_ALPHA);
      this.plazaGfx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      // Soft inner highlight ring — reads as an intentional plaza, not a box.
      this.plazaGfx.lineStyle(1, 0xffffff, 0.08);
      this.plazaGfx.strokeCircle(cx, cy, r * 0.82);
    }
  }

  /** Draw one L-shaped edge as two orthogonal filled rects, each extended
   *  ±half past its own axis so the corner overlaps cleanly (Task 7 — no
   *  gaps, no doubled seams, matches RoadGenerator.ts's proven approach). */
  private drawEdge(
    g: Phaser.GameObjects.Graphics,
    e: RoadEdge,
    px: (id: string) => number,
    py: (id: string) => number,
    half: number,
    color: number,
    alpha: number,
    withBorder: boolean,
  ): void {
    const ax = px(e.a), ay = py(e.a);
    const bx = px(e.b), by = py(e.b);

    if ((e.corner ?? 'h') === 'h') {
      this.fillHSeg(g, ax, ay, bx, half, color, alpha, withBorder);
      this.fillVSeg(g, bx, ay, by, half, color, alpha, withBorder);
    } else {
      this.fillVSeg(g, ax, ay, by, half, color, alpha, withBorder);
      this.fillHSeg(g, ax, by, bx, half, color, alpha, withBorder);
    }
  }

  private fillHSeg(
    g: Phaser.GameObjects.Graphics,
    x1: number, y: number, x2: number,
    half: number, color: number, alpha: number, withBorder: boolean,
  ): void {
    const left = Math.min(x1, x2) - half;
    const right = Math.max(x1, x2) + half;
    g.fillStyle(color, alpha);
    g.fillRect(left, y - half, right - left, half * 2);
    if (withBorder) {
      g.lineStyle(1, ROAD_BORDER_COLOR, ROAD_BORDER_ALPHA);
      g.lineBetween(left, y - half, right, y - half);
      g.lineBetween(left, y + half, right, y + half);
    }
  }

  private fillVSeg(
    g: Phaser.GameObjects.Graphics,
    x: number, y1: number, y2: number,
    half: number, color: number, alpha: number, withBorder: boolean,
  ): void {
    const top = Math.min(y1, y2) - half;
    const bottom = Math.max(y1, y2) + half;
    g.fillStyle(color, alpha);
    g.fillRect(x - half, top, half * 2, bottom - top);
    if (withBorder) {
      g.lineStyle(1, ROAD_BORDER_COLOR, ROAD_BORDER_ALPHA);
      g.lineBetween(x - half, top, x - half, bottom);
      g.lineBetween(x + half, top, x + half, bottom);
    }
  }

  destroy(): void {
    this.shoulderGfx?.destroy();
    this.roadGfx?.destroy();
    this.plazaGfx?.destroy();
    this.shoulderGfx = null;
    this.roadGfx = null;
    this.plazaGfx = null;
  }
}
