/**
 * NewWorldDebugOverlay.ts
 * ───────────────────────
 * Phase 10A.1 — F9 overlay with runtime solids, foot colliders, and
 * proposed/resolved player positions.
 */

import Phaser from 'phaser';
import {
  PARK_ZONES, WATER_ZONES, BRIDGE_ZONE,
  buildWalkableRects,
  LANDMARK_ANCHORS,
  landmarkWorldPos,
  SPAWN_ZONE_WORLD,
  type CanonicalLandmarkId,
  type CanonicalBuildingPlot,
} from '../world/NewCanonicalWorld';
import { WORLD_DISTRICTS } from '../world/WorldDistricts';
import { buildWorldSolids, type WorldSolid } from '../world/WorldCollisionGeometry';
import { WORLD_COLLISION_ENABLED, worldToImageX, worldToImageY } from '../world/WorldMapScale';
import {
  FOOT_COLLIDER_W, FOOT_COLLIDER_H, FOOT_OFFSET_Y,
  type CollisionSystem,
} from '../systems/CollisionSystem';
import type { CameraMode } from '../camera/WorldCameraController';

export interface CameraDebugInfo {
  cameraMode: CameraMode;
  scrollX: number;
  scrollY: number;
  zoom: number;
  targetZoom: number;
  distToPlayer: number;
  worldCollisionEnabled: boolean;
  playerSpeed: number;
}

const DEPTH = 90;

const C = {
  worldBounds: 0xc8902a,
  district: 0xe8c86a,
  landmark: 0xff6688,
  door: 0xffaa44,
  interact: 0x88aaff,
  plaza: 0x3ecf8e,
  road: 0x4bd4ff,
  park: 0x44aa66,
  water: 0x3388cc,
  building: 0xff4455,
  fountain: 0x66ccff,
  bridge: 0x55ee88,
  spawn: 0xffffff,
  foot: 0xffff00,
  proposed: 0xff00ff,
  hit: 0xffffff,
  label: '#e8d5a3',
};

export interface TestBuildingSpriteDebugInfo {
  plot: CanonicalBuildingPlot;
  anchorX: number;
  anchorY: number;
}

export interface DebugDoorZone {
  id: string;
  wx: number;
  wy: number;
  radius: number;
}

export interface DebugInteractZone {
  id: string;
  wx: number;
  wy: number;
  radius: number;
}

export interface DebugNpcFoot {
  x: number;
  y: number;
}

export class NewWorldDebugOverlay {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private cursorText: Phaser.GameObjects.Text | null = null;
  private visible = false;
  private doors: DebugDoorZone[] = [];
  private interacts: DebugInteractZone[] = [];
  private solids: WorldSolid[] = [];
  private collision: CollisionSystem | null = null;
  private npcFeet: DebugNpcFoot[] = [];
  private playerX = 0;
  private playerY = 0;
  private camInfo: CameraDebugInfo | null = null;
  private refreshTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(DEPTH);
    this.root = scene.add.container(0, 0).setDepth(DEPTH + 0.1);
    this.root.add(this.gfx);
    this.root.setVisible(false);
  }

  setDoorZones(doors: DebugDoorZone[]): void { this.doors = doors; }
  setInteractZones(zones: DebugInteractZone[]): void { this.interacts = zones; }
  setCollisionSystem(c: CollisionSystem): void { this.collision = c; }
  setNpcFeet(feet: DebugNpcFoot[]): void { this.npcFeet = feet; }

  isVisible(): boolean { return this.visible; }

  toggle(
    worldW: number, worldH: number, spawnX: number, spawnY: number,
    sprites: TestBuildingSpriteDebugInfo[] = [],
  ): void {
    this.setVisible(!this.visible, worldW, worldH, spawnX, spawnY, sprites);
  }

  setVisible(
    on: boolean, worldW: number, worldH: number, spawnX: number, spawnY: number,
    _sprites: TestBuildingSpriteDebugInfo[] = [],
  ): void {
    this.visible = on;
    this.root.setVisible(on);
    this.playerX = spawnX;
    this.playerY = spawnY;
    if (on) {
      this.solids = this.collision?.getSolids().slice() ?? buildWorldSolids();
      this.redraw(worldW, worldH, spawnX, spawnY);
      this.bindCursor();
      this.refreshTimer?.remove(false);
      this.refreshTimer = this.scene.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          if (!this.visible) return;
          this.redraw(worldW, worldH, this.playerX, this.playerY);
        },
      });
    } else {
      this.refreshTimer?.remove(false);
      this.refreshTimer = null;
      this.clearLabels();
      this.unbindCursor();
    }
  }

  /** Call each frame from WorldScene while F9 is open. */
  syncLive(
    playerX: number,
    playerY: number,
    npcFeet: DebugNpcFoot[],
    camInfo?: CameraDebugInfo | null,
  ): void {
    this.playerX = playerX;
    this.playerY = playerY;
    this.npcFeet = npcFeet;
    if (camInfo) this.camInfo = camInfo;
  }

  destroy(): void {
    this.refreshTimer?.remove(false);
    this.unbindCursor();
    this.clearLabels();
    this.root.destroy(true);
  }

  private bindCursor(): void {
    this.unbindCursor();
    this.cursorText = this.scene.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#fff6d0',
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(DEPTH + 5);
    this.scene.input.on('pointermove', this.onPointerMove, this);
  }

  private unbindCursor(): void {
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.cursorText?.destroy();
    this.cursorText = null;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.cursorText || !this.visible) return;
    const wx = pointer.worldX;
    const wy = pointer.worldY;
    const ix = Math.round(worldToImageX(wx));
    const iy = Math.round(worldToImageY(wy));
    const hit = this.collision?.lastHitId ?? '-';
    const cam = this.camInfo;
    const camLine = cam
      ? `cam ${cam.cameraMode}  scroll=(${Math.round(cam.scrollX)},${Math.round(cam.scrollY)})  ` +
        `zoom=${cam.zoom.toFixed(2)}→${cam.targetZoom.toFixed(2)}  dist=${Math.round(cam.distToPlayer)}\n` +
        `WORLD_COLLISION_ENABLED=${cam.worldCollisionEnabled}  PLAYER_SPEED=${cam.playerSpeed}  ` +
        `player=(${Math.round(this.playerX)},${Math.round(this.playerY)})`
      : `WORLD_COLLISION_ENABLED=${WORLD_COLLISION_ENABLED}`;
    const mmLive = this.scene.registry.get('minimapLive') as { npcs?: unknown[] } | undefined;
    const mmUi = this.scene.registry.get('minimapUiDebug') as {
      mapWidth?: number; mapHeight?: number; remoteCount?: number; landmarkCount?: number;
      viewportMapW?: number; viewportMapH?: number; selectedLandmarkId?: string | null;
    } | null;
    const mmLine = mmUi
      ? `minimap ${Math.round(mmUi.mapWidth ?? 0)}×${Math.round(mmUi.mapHeight ?? 0)}  ` +
        `npcs=${mmLive?.npcs?.length ?? 0}  remotes=${mmUi.remoteCount ?? 0}  ` +
        `landmarks=${mmUi.landmarkCount ?? 20}  vp=${Math.round(mmUi.viewportMapW ?? 0)}×${Math.round(mmUi.viewportMapH ?? 0)}  ` +
        `sel=${mmUi.selectedLandmarkId ?? '-'}`
      : `minimap npcs=${mmLive?.npcs?.length ?? 0}  landmarks=20`;
    const ixDbg = this.scene.registry.get('interactDebug') as {
      targetId?: string | null;
      targetKind?: string | null;
      distance?: number;
      facingScore?: number;
      priorityScore?: number;
      candidateCount?: number;
      nearbyPlayerCount?: number;
      selectedPlayerId?: string | null;
      selectedPlayerName?: string | null;
      selectedPlayerStaleAge?: number | null;
      hysteresisHeld?: boolean;
    } | null;
    const socialOpen = !!this.scene.registry.get('socialCardOpen');
    const dmRec = this.scene.registry.get('dmRecipient') as { playerId?: string; username?: string } | null;
    const progDbg = this.scene.registry.get('progressionDebug') as {
      level?: number;
      currentXp?: number;
      xpToNext?: number;
      rep?: number;
      rankLabel?: string;
      equippedTitleName?: string | null;
      seasonPoints?: number;
      achievementCompleted?: number;
      achievementTotal?: number;
      discoveryLandmarks?: number;
      discoveryDistricts?: number;
      latestEvent?: string | null;
      latestRewardKey?: string | null;
    } | null;
    const progLine = progDbg
      ? `prog L${progDbg.level ?? 1} xp=${progDbg.currentXp ?? 0}/${progDbg.xpToNext ?? 0}  ` +
        `rep=${progDbg.rep ?? 0}  rank=${progDbg.rankLabel ?? '-'}  ` +
        `title=${progDbg.equippedTitleName ?? '-'}  ach=${progDbg.achievementCompleted ?? 0}/${progDbg.achievementTotal ?? 0}\n` +
        `discover landmarks=${progDbg.discoveryLandmarks ?? 0} districts=${progDbg.discoveryDistricts ?? 0}  ` +
        `evt=${progDbg.latestEvent ?? '-'}  key=${progDbg.latestRewardKey ?? '-'}  seasonPts=${progDbg.seasonPoints ?? 0}`
      : 'prog -';
    const ixLine = ixDbg
      ? `interact ${ixDbg.targetKind ?? '-'} ${ixDbg.targetId ?? '-'}  dist=${Math.round(ixDbg.distance ?? 0)}  ` +
        `face=${(ixDbg.facingScore ?? 0).toFixed(2)}  pri=${Math.round(ixDbg.priorityScore ?? 0)}  near=${ixDbg.candidateCount ?? 0}\n` +
        `players nearby=${ixDbg.nearbyPlayerCount ?? 0}  sel=${ixDbg.selectedPlayerName ?? '-'} ` +
        `(${ixDbg.selectedPlayerId ?? '-'})  stale=${ixDbg.selectedPlayerStaleAge != null ? Math.round(ixDbg.selectedPlayerStaleAge) + 'ms' : '-'}  ` +
        `hyst=${ixDbg.hysteresisHeld ? 'Y' : 'N'}  card=${socialOpen ? 'open' : 'closed'}  ` +
        `dm=${dmRec?.username ?? '-'}`
      : 'interact -';
    this.cursorText.setText(
      `world (${Math.round(wx)}, ${Math.round(wy)})  image (${ix}, ${iy})\n` +
      `solids=${this.solids.length}  lastHit=${hit}  foot=${FOOT_COLLIDER_W}x${FOOT_COLLIDER_H}\n` +
      camLine + '\n' + mmLine + '\n' + ixLine + '\n' + progLine,
    );
  }

  private clearLabels(): void {
    for (const t of this.labels) t.destroy();
    this.labels = [];
  }

  private addLabel(x: number, y: number, text: string, color = C.label, size = 10): void {
    const lbl = this.scene.add
      .text(x, y, text, {
        fontFamily: '"Cinzel", serif',
        fontSize: `${size}px`,
        color,
        backgroundColor: 'rgba(4,8,12,0.85)',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH + 0.2);
    this.root.add(lbl);
    this.labels.push(lbl);
  }

  private drawFoot(bodyX: number, bodyY: number, colour: number, label?: string): void {
    const fx = bodyX - FOOT_COLLIDER_W / 2;
    const fy = bodyY + FOOT_OFFSET_Y - FOOT_COLLIDER_H / 2;
    this.gfx.fillStyle(colour, 0.45);
    this.gfx.fillRect(fx, fy, FOOT_COLLIDER_W, FOOT_COLLIDER_H);
    this.gfx.lineStyle(2, colour, 1);
    this.gfx.strokeRect(fx, fy, FOOT_COLLIDER_W, FOOT_COLLIDER_H);
    if (label) this.addLabel(bodyX, fy - 8, label, '#ffffaa', 9);
  }

  private redraw(worldW: number, worldH: number, spawnX: number, spawnY: number): void {
    this.gfx.clear();
    this.clearLabels();

    this.gfx.lineStyle(3, C.worldBounds, 0.9);
    this.gfx.strokeRect(0, 0, worldW, worldH);
    const runtime = this.camInfo?.worldCollisionEnabled ?? WORLD_COLLISION_ENABLED;
    this.addLabel(
      worldW / 2,
      16,
      `world ${worldW}×${worldH}  solids=${this.solids.length}  RUNTIME_COLLISION=${runtime ? 'ON' : 'OFF'}`,
      '#e8d5a3',
      11,
    );

    for (const d of WORLD_DISTRICTS) {
      this.gfx.lineStyle(1, C.district, 0.55);
      this.gfx.strokeRect(d.worldX, d.worldY, d.worldW, d.worldH);
      this.addLabel(d.worldX + d.worldW / 2, 36, d.name, '#ffe0a0', 11);
    }

    for (const r of buildWalkableRects(worldW, worldH)) {
      const color = r.kind === 'plaza' ? C.plaza : C.road;
      this.gfx.fillStyle(color, 0.08);
      this.gfx.fillRect(r.x, r.y, r.w, r.h);
    }

    const hitId = this.collision?.lastHitId ?? null;
    for (const s of this.solids) {
      const isHit = hitId === s.id;
      const colour =
        s.purpose === 'water' ? C.water :
        s.purpose === 'fountain' ? C.fountain :
        C.building;
      if (s.kind === 'rect' && s.w != null && s.h != null) {
        this.gfx.fillStyle(isHit ? C.hit : colour, isHit ? 0.55 : 0.20);
        this.gfx.fillRect(s.x, s.y, s.w, s.h);
        this.gfx.lineStyle(isHit ? 3 : 1, isHit ? C.hit : colour, 0.9);
        this.gfx.strokeRect(s.x, s.y, s.w, s.h);
        if (s.w * s.h > 6000 || isHit) {
          this.addLabel(s.x + s.w / 2, s.y + s.h / 2, s.id, isHit ? '#ffffff' : '#ffaaaa', 8);
        }
      } else if (s.kind === 'circle' && s.r != null) {
        this.gfx.fillStyle(isHit ? C.hit : colour, isHit ? 0.55 : 0.22);
        this.gfx.fillCircle(s.x, s.y, s.r);
        this.gfx.lineStyle(isHit ? 3 : 1, isHit ? C.hit : colour, 0.9);
        this.gfx.strokeCircle(s.x, s.y, s.r);
        this.addLabel(s.x, s.y, s.id, '#a8d8f8', 8);
      }
    }

    // Bridge deck walkable (green)
    this.gfx.fillStyle(C.bridge, 0.18);
    this.gfx.fillRect(BRIDGE_ZONE.x, BRIDGE_ZONE.y, BRIDGE_ZONE.width, BRIDGE_ZONE.height);
    this.gfx.lineStyle(2, C.bridge, 0.95);
    this.gfx.strokeRect(BRIDGE_ZONE.x, BRIDGE_ZONE.y, BRIDGE_ZONE.width, BRIDGE_ZONE.height);
    this.addLabel(
      BRIDGE_ZONE.x + BRIDGE_ZONE.width / 2,
      BRIDGE_ZONE.y + BRIDGE_ZONE.height / 2,
      'bridge deck',
      '#b8ffc8',
      10,
    );

    for (const z of PARK_ZONES) {
      this.gfx.lineStyle(1, C.park, 0.6);
      this.gfx.strokeRect(z.x, z.y, z.width, z.height);
    }
    for (const z of WATER_ZONES) {
      this.gfx.lineStyle(1, C.water, 0.3);
      this.gfx.strokeRect(z.x, z.y, z.width, z.height);
    }

    this.gfx.lineStyle(2, C.spawn, 0.95);
    this.gfx.strokeRect(SPAWN_ZONE_WORLD.x, SPAWN_ZONE_WORLD.y, SPAWN_ZONE_WORLD.w, SPAWN_ZONE_WORLD.h);

    for (const id of Object.keys(LANDMARK_ANCHORS) as CanonicalLandmarkId[]) {
      const p = landmarkWorldPos(id);
      this.gfx.fillStyle(C.landmark, 0.95);
      this.gfx.fillCircle(p.x, p.y, 3);
    }

    for (const z of this.interacts) {
      this.gfx.lineStyle(1, C.interact, 0.55);
      this.gfx.strokeCircle(z.wx, z.wy, z.radius);
    }
    for (const d of this.doors) {
      this.gfx.lineStyle(1, C.door, 0.8);
      this.gfx.strokeCircle(d.wx, d.wy, d.radius);
    }

    // Proposed vs resolved (from CollisionSystem live state)
    if (this.collision) {
      const px = this.collision.lastProposedX;
      const py = this.collision.lastProposedY;
      if (px || py) {
        this.gfx.fillStyle(C.proposed, 0.7);
        this.gfx.fillCircle(px, py + FOOT_OFFSET_Y, 4);
        this.addLabel(px, py + FOOT_OFFSET_Y - 12, 'proposed', '#ff88ff', 9);
      }
    }

    this.drawFoot(spawnX, spawnY, C.foot, 'player foot');
    for (const n of this.npcFeet) {
      this.drawFoot(n.x, n.y, 0x88ffaa);
    }

    // Phase 10E — social interact radius + line to selected remote foot
    const ixSel = this.scene.registry.get('interactDebug') as {
      selectedPlayerX?: number | null;
      selectedPlayerY?: number | null;
    } | null;
    this.gfx.lineStyle(1, 0x40e8f8, 0.35);
    this.gfx.strokeCircle(this.playerX, this.playerY, 78);
    if (
      ixSel?.selectedPlayerX != null &&
      ixSel?.selectedPlayerY != null &&
      Number.isFinite(ixSel.selectedPlayerX) &&
      Number.isFinite(ixSel.selectedPlayerY)
    ) {
      this.gfx.lineStyle(1, 0x40e8f8, 0.7);
      this.gfx.lineBetween(this.playerX, this.playerY, ixSel.selectedPlayerX, ixSel.selectedPlayerY);
      this.gfx.fillStyle(0x40e8f8, 0.7);
      this.gfx.fillCircle(ixSel.selectedPlayerX, ixSel.selectedPlayerY, 4);
    }
  }
}
