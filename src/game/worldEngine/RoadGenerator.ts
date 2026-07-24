/**
 * RoadGenerator.ts
 * ────────────────
 * World background + visual road paving for the full city (hub + south).
 * Minimap road rects are registered for every segment.
 */

import Phaser from 'phaser';
import { ROAD_NODES, ROAD_EDGES } from '../world/RoadNetwork';
import { C_GROUND_DARK, C_GROUND_ROAD, C_GROUND_MID } from './WorldPalette';
import { addMinimapRoad } from './WorldMinimapData';
import { TERRAIN_ART_ENABLED } from './WorldTerrainLayer';

function drawSidewalkBand(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
): void {
  g.fillStyle(C_GROUND_MID, 0.55);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, 0x1a2838, 0.3);
  for (let ox = x + 6; ox < x + w; ox += 12) {
    g.lineBetween(ox, y, ox, y + h);
  }
}

/** Half the visual road width (128 px total lane). */
const ROAD_HALF = 64;
const SIDEWALK = 14;

export class RoadGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generate(worldW: number, worldH: number): void {
    if (TERRAIN_ART_ENABLED) {
      this.registerMinimapRoads(worldW, worldH);
      return;
    }
    this.drawWorldBackground(worldW, worldH);
    this.drawHubRoadNetwork(worldW, worldH);
  }

  /** Minimap road rects only — collision uses RoadNetwork.ts, not these graphics. */
  private registerMinimapRoads(worldW: number, worldH: number): void {
    const half = ROAD_HALF;

    const nodeById = (id: string) => {
      const n = ROAD_NODES.find(nd => nd.id === id);
      if (!n) throw new Error(`RoadGenerator: unknown node "${id}"`);
      return n;
    };

    const px = (id: string) => nodeById(id).x * worldW;
    const py = (id: string) => nodeById(id).y * worldH;

    for (const n of ROAD_NODES) {
      const cx = n.x * worldW;
      const cy = n.y * worldH;
      const r = n.plaza;
      addMinimapRoad((cx - r) / worldW, (cy - r) / worldH, (r * 2) / worldW, (r * 2) / worldH);
    }

    for (const e of ROAD_EDGES) {
      const ax = px(e.a), ay = py(e.a);
      const bx = px(e.b), by = py(e.b);

      if ((e.corner ?? 'h') === 'h') {
        this.addMinimapHorizontalRoad(ax, ay, bx, ay, half, worldW, worldH);
        this.addMinimapVerticalRoad(bx, ay, bx, by, half, worldW, worldH);
      } else {
        this.addMinimapVerticalRoad(ax, ay, ax, by, half, worldW, worldH);
        this.addMinimapHorizontalRoad(ax, by, bx, by, half, worldW, worldH);
      }
    }
  }

  private addMinimapHorizontalRoad(
    x1: number, y1: number, x2: number, y2: number,
    half: number, worldW: number, worldH: number,
  ): void {
    const left = Math.min(x1, x2) - half;
    const right = Math.max(x1, x2) + half;
    const w = right - left;
    addMinimapRoad(left / worldW, (y1 - half) / worldH, w / worldW, (half * 2) / worldH);
  }

  private addMinimapVerticalRoad(
    x1: number, y1: number, x2: number, y2: number,
    half: number, worldW: number, worldH: number,
  ): void {
    const top = Math.min(y1, y2) - half;
    const bottom = Math.max(y1, y2) + half;
    const h = bottom - top;
    addMinimapRoad((x1 - half) / worldW, top / worldH, (half * 2) / worldW, h / worldH);
  }

  private drawWorldBackground(worldW: number, worldH: number): void {
    const g = this.scene.add.graphics().setDepth(-2);
    g.fillGradientStyle(C_GROUND_DARK, C_GROUND_DARK, 0x060c10, 0x060c10, 1);
    g.fillRect(0, 0, worldW, worldH);
    g.lineStyle(1, 0x111820, 0.18);
    const step = 220;
    for (let x = 0; x < worldW; x += step) g.lineBetween(x, 0, x, worldH);
    for (let y = 0; y < worldH; y += step) g.lineBetween(0, y, worldW, y);
  }

  private drawHubRoadNetwork(worldW: number, worldH: number): void {
    const g = this.scene.add.graphics().setDepth(-1);
    const half = ROAD_HALF;
    const sw = SIDEWALK;

    const nodeById = (id: string) => {
      const n = ROAD_NODES.find(nd => nd.id === id);
      if (!n) throw new Error(`RoadGenerator: unknown node "${id}"`);
      return n;
    };

    const px = (id: string) => nodeById(id).x * worldW;
    const py = (id: string) => nodeById(id).y * worldH;

    // Plaza paving at each node
    g.fillStyle(C_GROUND_ROAD, 0.92);
    for (const n of ROAD_NODES) {
      const cx = n.x * worldW;
      const cy = n.y * worldH;
      const r = n.plaza;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
      addMinimapRoad((cx - r) / worldW, (cy - r) / worldH, (r * 2) / worldW, (r * 2) / worldH);
    }

    // L-shaped road corridors
    g.fillStyle(C_GROUND_ROAD, 1);
    for (const e of ROAD_EDGES) {
      const ax = px(e.a), ay = py(e.a);
      const bx = px(e.b), by = py(e.b);

      if ((e.corner ?? 'h') === 'h') {
        this.fillHorizontalRoad(g, ax, ay, bx, ay, half, sw, worldW, worldH);
        this.fillVerticalRoad(g, bx, ay, bx, by, half, sw, worldW, worldH);
      } else {
        this.fillVerticalRoad(g, ax, ay, ax, by, half, sw, worldW, worldH);
        this.fillHorizontalRoad(g, ax, by, bx, by, half, sw, worldW, worldH);
      }
    }

    // Edge lines on hub segments
    g.lineStyle(2, 0x1c2c3c, 0.45);
    for (const e of ROAD_EDGES) {
      const ax = px(e.a), ay = py(e.a);
      const bx = px(e.b), by = py(e.b);
      if ((e.corner ?? 'h') === 'h') {
        g.lineBetween(ax - half, ay, bx + half, ay);
        g.lineBetween(bx, Math.min(ay, by), bx, Math.max(ay, by));
      } else {
        g.lineBetween(ax, Math.min(ay, by), ax, Math.max(ay, by));
        g.lineBetween(ax, by, bx, by);
      }
    }

    // Dashed centre on main south avenue (cashback ↔ arena)
    const cashX = px('cashback'), arenaX = px('arena'), cashY = py('cashback');
    g.lineStyle(1, 0x243040, 0.55);
    let dashX = cashX + half * 2;
    while (dashX < arenaX - half * 2) {
      g.lineBetween(dashX, cashY, dashX + 70, cashY);
      dashX += 150;
    }
  }

  private fillHorizontalRoad(
    g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    half: number, sw: number,
    worldW: number, worldH: number,
  ): void {
    const left = Math.min(x1, x2) - half;
    const right = Math.max(x1, x2) + half;
    const w = right - left;
    g.fillRect(left, y1 - half, w, half * 2);
    drawSidewalkBand(g, left, y1 - half - sw, w, sw);
    drawSidewalkBand(g, left, y1 + half, w, sw);
    addMinimapRoad(left / worldW, (y1 - half) / worldH, w / worldW, (half * 2) / worldH);
  }

  private fillVerticalRoad(
    g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    half: number, sw: number,
    worldW: number, worldH: number,
  ): void {
    const top = Math.min(y1, y2) - half;
    const bottom = Math.max(y1, y2) + half;
    const h = bottom - top;
    g.fillRect(x1 - half, top, half * 2, h);
    drawSidewalkBand(g, x1 - half - sw, top, sw, h);
    drawSidewalkBand(g, x1 + half, top, sw, h);
    addMinimapRoad((x1 - half) / worldW, top / worldH, (half * 2) / worldW, h / worldH);
  }
}
