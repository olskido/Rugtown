/**
 * CollisionSystem.ts
 * ──────────────────
 * Phase 10A.1 — authoritative foot-collider collision for Option B
 * (open terrain minus solid blockers).
 *
 * ROOT CAUSE (10A): local player movement never called resolveWalk —
 * it only clamped to world edges. Geometry existed but was unused.
 *
 * This revision:
 * - tests a compact FOOT AABB (not the full visual sprite)
 * - axis-slides with substeps to prevent tunnelling
 * - shared by local player and NPC movement
 */

import Phaser from 'phaser';
import {
  buildWalkableRects as buildRoadNetworkWalkableRects,
  isWalkablePoint,
  type WalkRect,
} from '../world/RoadNetwork';
import {
  buildWorldSolids,
  isInsideWorldBounds,
  pointHitsSolid,
  type WorldSolid,
} from '../world/WorldCollisionGeometry';
import {
  WORLD_COLLISION_ENABLED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../world/WorldMapScale';

export type CollisionMode = 'allowlist' | 'blocklist';

/** Compact foot collider in WORLD pixels — independent of visual scale. */
export const FOOT_COLLIDER_W = 20;
export const FOOT_COLLIDER_H = 12;
/** Feet sit below the humanoid Graphics origin (character centre). */
export const FOOT_OFFSET_Y = 12;

const MAX_STEP_PX = 8;

export interface CollisionInitOptions {
  mode?: CollisionMode;
  walkableRects?: WalkRect[];
  solids?: WorldSolid[];
}

export interface FootResolveResult {
  x: number;
  y: number;
  hit: boolean;
  hitId: string | null;
  solidsChecked: number;
  rejected: boolean;
}

export class CollisionSystem {
  private scene: Phaser.Scene;
  private walkableRects: WalkRect[] = [];
  private solids: WorldSolid[] = [];
  private mode: CollisionMode = 'blocklist';
  private worldW = WORLD_WIDTH;
  private worldH = WORLD_HEIGHT;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private debugVisible = false;
  /** Last solid the player foot overlapped (for F9 highlight). */
  lastHitId: string | null = null;
  lastProposedX = 0;
  lastProposedY = 0;
  lastResolvedX = 0;
  lastResolvedY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init(worldW: number, worldH: number, rectsOrOpts?: WalkRect[] | CollisionInitOptions): void {
    this.worldW = worldW;
    this.worldH = worldH;

    if (Array.isArray(rectsOrOpts)) {
      this.walkableRects = rectsOrOpts;
      this.solids = buildWorldSolids();
      this.mode = 'blocklist';
    } else if (rectsOrOpts) {
      this.mode = rectsOrOpts.mode ?? 'blocklist';
      this.walkableRects = rectsOrOpts.walkableRects ?? [];
      this.solids = rectsOrOpts.solids ?? (this.mode === 'blocklist' ? buildWorldSolids() : []);
      if (this.mode === 'allowlist' && this.walkableRects.length === 0) {
        this.walkableRects = buildRoadNetworkWalkableRects(worldW, worldH);
      }
    } else {
      this.mode = 'blocklist';
      this.solids = buildWorldSolids();
      this.walkableRects = [];
    }

    this.debugGraphics = this.scene.add.graphics().setDepth(50).setVisible(false);
    this.redrawDebug();
  }

  private redrawDebug(): void {
    if (!this.debugGraphics) return;
    this.debugGraphics.clear();
    for (const r of this.walkableRects) {
      const colour = r.kind === 'plaza' ? 0x38f0a0 : 0x4bd4ff;
      this.debugGraphics.fillStyle(colour, 0.10);
      this.debugGraphics.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const s of this.solids) {
      const colour =
        s.purpose === 'water' ? 0x3388cc :
        s.purpose === 'fountain' ? 0x66ccff :
        0xff4455;
      if (s.kind === 'rect' && s.w != null && s.h != null) {
        this.debugGraphics.fillStyle(colour, 0.22);
        this.debugGraphics.fillRect(s.x, s.y, s.w, s.h);
        this.debugGraphics.lineStyle(1, colour, 0.8);
        this.debugGraphics.strokeRect(s.x, s.y, s.w, s.h);
      } else if (s.kind === 'circle' && s.r != null) {
        this.debugGraphics.fillStyle(colour, 0.22);
        this.debugGraphics.fillCircle(s.x, s.y, s.r);
        this.debugGraphics.lineStyle(1, colour, 0.8);
        this.debugGraphics.strokeCircle(s.x, s.y, s.r);
      }
    }
  }

  getFootCenter(bodyX: number, bodyY: number): { x: number; y: number } {
    return { x: bodyX, y: bodyY + FOOT_OFFSET_Y };
  }

  /** Foot AABB corners for a body-origin position. */
  footBounds(bodyX: number, bodyY: number): { x: number; y: number; w: number; h: number } {
    const f = this.getFootCenter(bodyX, bodyY);
    return {
      x: f.x - FOOT_COLLIDER_W / 2,
      y: f.y - FOOT_COLLIDER_H / 2,
      w: FOOT_COLLIDER_W,
      h: FOOT_COLLIDER_H,
    };
  }

  private aabbHitsSolid(
    bx: number, by: number, bw: number, bh: number,
    solid: WorldSolid,
  ): boolean {
    if (solid.kind === 'rect' && solid.w != null && solid.h != null) {
      return !(
        bx + bw < solid.x ||
        bx > solid.x + solid.w ||
        by + bh < solid.y ||
        by > solid.y + solid.h
      );
    }
    if (solid.kind === 'circle' && solid.r != null) {
      // Closest point on AABB to circle centre
      const cx = Phaser.Math.Clamp(solid.x, bx, bx + bw);
      const cy = Phaser.Math.Clamp(solid.y, by, by + bh);
      const dx = solid.x - cx;
      const dy = solid.y - cy;
      return dx * dx + dy * dy <= solid.r * solid.r;
    }
    if (solid.kind === 'poly' && solid.points) {
      // Sample foot corners + centre against poly (cheap approximation)
      const samples = [
        { x: bx, y: by },
        { x: bx + bw, y: by },
        { x: bx, y: by + bh },
        { x: bx + bw, y: by + bh },
        { x: bx + bw / 2, y: by + bh / 2 },
      ];
      for (const p of samples) {
        if (pointHitsSolid(solid, p.x, p.y)) return true;
      }
    }
    return false;
  }

  /** True if the foot collider at body origin is free. */
  isBodyWalkable(bodyX: number, bodyY: number): boolean {
    const foot = this.footBounds(bodyX, bodyY);
    const fx = foot.x + foot.w / 2;
    const fy = foot.y + foot.h / 2;
    if (!isInsideWorldBounds(fx, fy, 6)) return false;
    if (foot.x < 2 || foot.y < 2 || foot.x + foot.w > this.worldW - 2 || foot.y + foot.h > this.worldH - 2) {
      return false;
    }

    /* Phase 10B — solids dormant; only world-edge / allowlist geometry matter. */
    if (!WORLD_COLLISION_ENABLED) {
      if (this.mode === 'allowlist') {
        return isWalkablePoint(this.walkableRects, fx, fy);
      }
      return true;
    }

    if (this.mode === 'allowlist') {
      return isWalkablePoint(this.walkableRects, fx, fy);
    }

    for (const s of this.solids) {
      if (this.aabbHitsSolid(foot.x, foot.y, foot.w, foot.h, s)) return false;
    }
    return true;
  }

  /** Point test (legacy / NPC target checks) — uses foot point, not full body. */
  isWalkable(x: number, y: number): boolean {
    return this.isBodyWalkable(x, y);
  }

  findHitSolid(bodyX: number, bodyY: number): WorldSolid | null {
    const foot = this.footBounds(bodyX, bodyY);
    for (const s of this.solids) {
      if (this.aabbHitsSolid(foot.x, foot.y, foot.w, foot.h, s)) return s;
    }
    return null;
  }

  /**
   * Authoritative movement: substeps + axis slide.
   * Input (px,py) is body origin; output is resolved body origin.
   */
  resolveWalk(
    px: number, py: number,
    vx: number, vy: number,
    dt: number,
  ): FootResolveResult {
    const dx = vx * dt;
    const dy = vy * dt;
    const proposedX = px + dx;
    const proposedY = py + dy;
    this.lastProposedX = proposedX;
    this.lastProposedY = proposedY;

    /* Phase 10B — flag off: apply free delta (world-edge clamp is caller's job). */
    if (!WORLD_COLLISION_ENABLED) {
      this.lastHitId = null;
      this.lastResolvedX = proposedX;
      this.lastResolvedY = proposedY;
      return {
        x: proposedX,
        y: proposedY,
        hit: false,
        hitId: null,
        solidsChecked: 0,
        rejected: false,
      };
    }

    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / MAX_STEP_PX));
    const sdt = dt / steps;

    let x = px;
    let y = py;
    let hitId: string | null = null;
    let hit = false;
    let rejected = false;
    const solidsChecked = this.solids.length;

    for (let i = 0; i < steps; i++) {
      const nx = x + vx * sdt;
      const ny = y + vy * sdt;

      if (this.isBodyWalkable(nx, ny)) {
        x = nx;
        y = ny;
        continue;
      }

      hit = true;
      const solid = this.findHitSolid(nx, ny) ?? this.findHitSolid(nx, y) ?? this.findHitSolid(x, ny);
      if (solid) hitId = solid.id;

      let slid = false;
      if (vx !== 0 && this.isBodyWalkable(nx, y)) {
        x = nx;
        slid = true;
      }
      if (vy !== 0 && this.isBodyWalkable(x, ny)) {
        y = ny;
        slid = true;
      }
      if (!slid) {
        rejected = true;
        break;
      }
    }

    this.lastHitId = hitId;
    this.lastResolvedX = x;
    this.lastResolvedY = y;

    return { x, y, hit, hitId, solidsChecked, rejected };
  }

  snapToNearest(x: number, y: number): { x: number; y: number } {
    if (this.isBodyWalkable(x, y)) return { x, y };

    if (this.mode === 'allowlist' && this.walkableRects.length > 0) {
      let best = { x, y };
      let bestD = Infinity;
      for (const r of this.walkableRects) {
        const cx = Phaser.Math.Clamp(x, r.x, r.x + r.w);
        const cy = Phaser.Math.Clamp(y, r.y, r.y + r.h);
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
      }
      return best;
    }

    for (let radius = 4; radius <= 280; radius += 4) {
      for (let a = 0; a < 20; a++) {
        const ang = (a / 20) * Math.PI * 2;
        const nx = x + Math.cos(ang) * radius;
        const ny = y + Math.sin(ang) * radius;
        if (this.isBodyWalkable(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  randomWalkablePoint(): { wx: number; wy: number } {
    if (this.walkableRects.length > 0) {
      const rects = this.walkableRects;
      let total = 0;
      for (const r of rects) total += r.w * r.h;
      let pick = Math.random() * total;
      let chosen = rects[0];
      for (const r of rects) {
        pick -= r.w * r.h;
        if (pick <= 0) { chosen = r; break; }
      }
      const pad = 14;
      for (let attempt = 0; attempt < 50; attempt++) {
        const wx = Phaser.Math.Between(chosen.x + pad, chosen.x + chosen.w - pad);
        const wy = Phaser.Math.Between(chosen.y + pad, chosen.y + chosen.h - pad);
        if (this.isBodyWalkable(wx, wy)) return { wx, wy };
      }
    }

    for (let attempt = 0; attempt < 100; attempt++) {
      const wx = Phaser.Math.Between(40, this.worldW - 40);
      const wy = Phaser.Math.Between(40, this.worldH - 40);
      if (this.isBodyWalkable(wx, wy)) return { wx, wy };
    }
    return { wx: this.worldW / 2, wy: this.worldH / 2 };
  }

  getRects(): readonly WalkRect[] {
    return this.walkableRects;
  }

  getSolids(): readonly WorldSolid[] {
    return this.solids;
  }

  getSolidCount(): number {
    return this.solids.length;
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.debugGraphics?.setVisible(visible);
    this.scene.registry.set('collisionDebug', visible);
  }

  get isDebugVisible(): boolean {
    return this.debugVisible;
  }
}
