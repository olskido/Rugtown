/**
 * WorldArchitectureOverlay.ts
 * ───────────────────────────
 * Phase 8A — F9 developer overlay for the world layout blueprint.
 * Visual validation only — no gameplay / collision side effects.
 */

import Phaser from 'phaser';
import {
  WORLD_LAYOUT_BLUEPRINT,
  WORLD_LAYOUT_WIDTH,
  WORLD_LAYOUT_HEIGHT,
  type NamedRectBlueprint,
  type RoadCorridorBlueprint,
  type WorldRect,
} from '../data/world-layout-blueprint';
import { buildWalkableRects } from '../world/RoadNetwork';

const DEPTH = 90;

const C = {
  world: 0xc8902a,
  district: 0x3ecf8e,
  districtFill: 0x3ecf8e,
  primaryRoad: 0xffcc66,
  secondaryRoad: 0x66aaff,
  landmark: 0xff6688,
  landmarkPad: 0xff6688,
  plaza: 0xe8b84b,
  residential: 0x88aacc,
  commercial: 0xcc8844,
  park: 0x44aa66,
  reserved: 0xaa66cc,
  spawn: 0xffffff,
  label: '#e8d5a3',
};

export class WorldArchitectureOverlay {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(DEPTH);
    this.root = scene.add.container(0, 0).setDepth(DEPTH + 0.1);
    this.root.add(this.gfx);
    this.root.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.setVisible(on);
    if (on) this.redraw();
    else this.clearLabels();
  }

  destroy(): void {
    this.clearLabels();
    this.root.destroy(true);
  }

  private clearLabels(): void {
    for (const t of this.labels) t.destroy();
    this.labels = [];
  }

  private addLabel(x: number, y: number, text: string, color = C.label, size = 14): void {
    const lbl = this.scene.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color,
        backgroundColor: 'rgba(8,12,16,0.75)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.2);
    this.labels.push(lbl);
    this.root.add(lbl);
  }

  private strokeRect(r: WorldRect, color: number, alpha: number, width = 2): void {
    this.gfx.lineStyle(width, color, alpha);
    this.gfx.strokeRect(r.x, r.y, r.width, r.height);
  }

  private fillRect(r: WorldRect, color: number, alpha: number): void {
    this.gfx.fillStyle(color, alpha);
    this.gfx.fillRect(r.x, r.y, r.width, r.height);
  }

  private drawNamedRects(
    list: NamedRectBlueprint[],
    color: number,
    fillAlpha: number,
    labelColor: string,
  ): void {
    for (const b of list) {
      this.fillRect(b.bounds, color, fillAlpha);
      this.strokeRect(b.bounds, color, 0.85, 1);
      this.addLabel(
        b.bounds.x + b.bounds.width / 2,
        b.bounds.y + 12,
        b.name,
        labelColor,
        11,
      );
    }
  }

  private drawCorridor(road: RoadCorridorBlueprint, color: number, width: number): void {
    if (road.points.length < 2) return;
    this.gfx.lineStyle(width, color, road.kind === 'primary' ? 0.95 : 0.7);
    this.gfx.beginPath();
    this.gfx.moveTo(road.points[0].x, road.points[0].y);
    for (let i = 1; i < road.points.length; i++) {
      this.gfx.lineTo(road.points[i].x, road.points[i].y);
    }
    this.gfx.strokePath();
    for (const p of road.points) {
      this.gfx.fillStyle(color, 0.9);
      this.gfx.fillCircle(p.x, p.y, road.kind === 'primary' ? 5 : 3);
    }
  }

  redraw(): void {
    this.gfx.clear();
    this.clearLabels();
    const bp = WORLD_LAYOUT_BLUEPRINT;

    // World boundary
    this.strokeRect(
      { x: 0, y: 0, width: WORLD_LAYOUT_WIDTH, height: WORLD_LAYOUT_HEIGHT },
      C.world,
      1,
      4,
    );
    this.addLabel(
      WORLD_LAYOUT_WIDTH / 2,
      36,
      `RUGTOWN ${WORLD_LAYOUT_WIDTH}×${WORLD_LAYOUT_HEIGHT} — Compact World Blueprint (F9)`,
      '#c8902a',
      18,
    );

    // Districts
    for (const d of bp.districts) {
      this.fillRect(d.bounds, C.districtFill, 0.06);
      this.strokeRect(d.bounds, C.district, 0.9, 2);
      this.addLabel(d.center.x, d.bounds.y + 22, d.name, '#7dffb0', 13);
      this.gfx.fillStyle(C.district, 1);
      this.gfx.fillCircle(d.center.x, d.center.y, 7);
      this.gfx.lineStyle(1, 0xffffff, 0.8);
      this.gfx.strokeCircle(d.center.x, d.center.y, 10);
    }

    // Blocks / zones under roads so corridors stay readable
    this.drawNamedRects(bp.parkZones, C.park, 0.12, '#88e0a8');
    this.drawNamedRects(bp.residentialBlocks, C.residential, 0.10, '#a8c8e8');
    this.drawNamedRects(bp.commercialBlocks, C.commercial, 0.12, '#e8c090');
    this.drawNamedRects(bp.plazas, C.plaza, 0.14, '#ffe08a');
    this.drawNamedRects(bp.reservedOpenSpaces, C.reserved, 0.05, '#d0a0e8');

    // Roads
    for (const r of bp.secondaryRoads) this.drawCorridor(r, C.secondaryRoad, 4);
    for (const r of bp.primaryRoads) this.drawCorridor(r, C.primaryRoad, 7);

    // Phase 8G — actual walkable collision rects (RoadNetwork.ts
    // buildWalkableRects) in a distinct cyan outline, so the visual road
    // layer (CompactRoadRenderer) can be checked against real collision
    // at a glance. Bright, unmistakable from the blueprint's own colors.
    this.gfx.lineStyle(1.5, 0x00ffcc, 0.55);
    for (const r of buildWalkableRects(WORLD_LAYOUT_WIDTH, WORLD_LAYOUT_HEIGHT)) {
      this.gfx.strokeRect(r.x, r.y, r.w, r.h);
    }

    // Landmark zones + anchors
    for (const z of bp.landmarkZones) {
      this.fillRect(z.zone, C.landmarkPad, 0.10);
      this.strokeRect(z.zone, C.landmarkPad, 0.7, 1);
      this.gfx.fillStyle(C.landmark, 1);
      this.gfx.fillCircle(z.anchor.x, z.anchor.y, z.hierarchy === 'primary' ? 8 : 5);
      this.gfx.lineStyle(1, 0xffffff, 0.85);
      this.gfx.strokeCircle(z.anchor.x, z.anchor.y, z.hierarchy === 'primary' ? 12 : 8);
      const lock = z.gameplayLocked ? '●' : '○';
      this.addLabel(z.anchor.x, z.anchor.y - 18, `${lock} ${z.displayName}`, '#ffb0c0', 11);
    }

    // Scene spawn vs gameplay fountain
    this.gfx.lineStyle(2, C.spawn, 0.9);
    this.gfx.strokeCircle(bp.sceneSpawn.x, bp.sceneSpawn.y, 16);
    this.addLabel(bp.sceneSpawn.x, bp.sceneSpawn.y + 28, 'Scene Spawn', '#ffffff', 12);
    this.gfx.lineStyle(1, 0xff6688, 0.6);
    this.gfx.lineBetween(bp.sceneSpawn.x, bp.sceneSpawn.y, bp.gameplayFountain.x, bp.gameplayFountain.y);

    this.addLabel(
      200,
      WORLD_LAYOUT_HEIGHT - 40,
      '● gameplay-locked landmark   ○ planned   gold=primary roads   blue=secondary   green=districts   cyan=actual walkable collision',
      '#a8b0bc',
      12,
    );
  }
}
