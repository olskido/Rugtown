/**
 * WorldCameraController.ts
 * ────────────────────────
 * Phase 10B — authoritative world camera (follow / manual pan / recenter).
 *
 * No camera rotation. One owner of scroll + zoom so Phaser startFollow
 * never fights manual scroll.
 */

import Phaser from 'phaser';
import { isPointerOverInteractiveUi } from './UiPointerGuard';
import {
  CAMERA_FOLLOW_LERP,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
} from '../world/WorldMapScale';

export type CameraMode = 'FOLLOWING' | 'MANUAL_PAN' | 'RECENTERING';

export interface CameraDiagnostics {
  mode: CameraMode;
  scrollX: number;
  scrollY: number;
  zoom: number;
  targetZoom: number;
  playerX: number;
  playerY: number;
  distToPlayer: number;
  needsRecenterButton: boolean;
}

const DRAG_THRESHOLD_PX = 8;
const RECENTER_ARRIVE_PX = 4;
/** Soft auto-resume when player leaves this fraction of the viewport (0.5 = half). */
const SAFE_VIEW_FRACTION = 0.80;
const ZOOM_WHEEL_STEP = 0.07;
const ZOOM_LERP = 0.12;
const RECENTER_LERP = 0.14;

export class WorldCameraController {
  private scene: Phaser.Scene;
  private cam!: Phaser.Cameras.Scene2D.Camera;
  private worldW = 1;
  private worldH = 1;
  private enabled = true;

  private mode: CameraMode = 'FOLLOWING';
  private currentZoom = CAMERA_ZOOM_DEFAULT;
  private targetZoom = CAMERA_ZOOM_DEFAULT;
  private zoomFloor = CAMERA_ZOOM_MIN;

  private dragging = false;
  private dragArmed = false;
  private dragPointerId = -1;
  private dragStartSX = 0;
  private dragStartSY = 0;
  private dragStartScrollX = 0;
  private dragStartScrollY = 0;

  private pinching = false;
  private pinchStartDist = 0;
  private pinchStartZoom = 1;

  private playerX = 0;
  private playerY = 0;

  /** Optional: return false to skip starting a pan (e.g. remote-player hit). */
  canStartPan: ((pointer: Phaser.Input.Pointer) => boolean) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  attach(worldW: number, worldH: number, startZoom = CAMERA_ZOOM_DEFAULT): void {
    this.worldW = worldW;
    this.worldH = worldH;
    this.cam = this.scene.cameras.main;
    this.currentZoom = startZoom;
    this.targetZoom = startZoom;
    this.mode = 'FOLLOWING';

    this.cam.stopFollow();
    this.cam.setBounds(0, 0, worldW, worldH);
    this.cam.setZoom(this.currentZoom);
    this.cam.setDeadzone(0, 0);
    this.cam.roundPixels = true;

    this.bindInput();
    this.scene.scale.on('resize', this.onResize, this);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.cancelGestures();
  }

  destroy(): void {
    this.unbindInput();
    this.scene.scale.off('resize', this.onResize, this);
  }

  getMode(): CameraMode {
    return this.mode;
  }

  getZoom(): number {
    return this.currentZoom;
  }

  getTargetZoom(): number {
    return this.targetZoom;
  }

  setTargetZoom(z: number): void {
    this.targetZoom = Phaser.Math.Clamp(z, this.zoomFloor, CAMERA_ZOOM_MAX);
  }

  requestRecenter(alsoResetZoom = false): void {
    if (!this.enabled) return;
    if (alsoResetZoom) this.targetZoom = CAMERA_ZOOM_DEFAULT;
    this.mode = 'RECENTERING';
    this.cancelGestures();
  }

  /** Force follow after teleport / spawn without animation skip if close. */
  snapFollowToPlayer(px: number, py: number): void {
    this.playerX = px;
    this.playerY = py;
    this.mode = 'FOLLOWING';
    this.cam.centerOn(px, py);
    this.clampScroll();
  }

  update(dt: number, playerX: number, playerY: number): void {
    this.playerX = playerX;
    this.playerY = playerY;
    if (!this.enabled) return;

    this.zoomFloor = this.computeZoomFloor();
    if (this.targetZoom < this.zoomFloor) this.targetZoom = this.zoomFloor;
    if (this.currentZoom < this.zoomFloor) this.currentZoom = this.zoomFloor;

    if (Math.abs(this.currentZoom - this.targetZoom) > 0.0005) {
      const zf = ZOOM_LERP >= 1 ? 1 : 1 - Math.pow(1 - ZOOM_LERP, dt * 60);
      this.currentZoom = Phaser.Math.Linear(this.currentZoom, this.targetZoom, zf);
    }
    if (this.cam.zoom !== this.currentZoom) {
      this.cam.setZoom(this.currentZoom);
      this.clampScroll();
    }

    if (this.mode === 'MANUAL_PAN' && this.isPlayerOutsideSafeView(playerX, playerY)) {
      this.mode = 'RECENTERING';
    }

    if (this.mode === 'FOLLOWING') {
      this.smoothCenterOn(playerX, playerY, CAMERA_FOLLOW_LERP, dt);
    } else if (this.mode === 'RECENTERING') {
      this.smoothCenterOn(playerX, playerY, RECENTER_LERP, dt);
      if (this.distCameraCentreTo(playerX, playerY) <= RECENTER_ARRIVE_PX) {
        this.cam.centerOn(playerX, playerY);
        this.clampScroll();
        this.mode = 'FOLLOWING';
      }
    }
    // MANUAL_PAN: scroll only changed by gestures; still clamp
    this.clampScroll();
  }

  getDiagnostics(): CameraDiagnostics {
    const dist = this.distCameraCentreTo(this.playerX, this.playerY);
    return {
      mode: this.mode,
      scrollX: this.cam.scrollX,
      scrollY: this.cam.scrollY,
      zoom: this.currentZoom,
      targetZoom: this.targetZoom,
      playerX: this.playerX,
      playerY: this.playerY,
      distToPlayer: dist,
      // Visible only when not in normal follow (hides during FOLLOW lag).
      needsRecenterButton: this.mode !== 'FOLLOWING',
    };
  }

  private computeZoomFloor(): number {
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    if (vw <= 0 || vh <= 0 || this.worldW <= 0 || this.worldH <= 0) {
      return CAMERA_ZOOM_MIN;
    }
    return Math.max(vw / this.worldW, vh / this.worldH, CAMERA_ZOOM_MIN);
  }

  private smoothCenterOn(x: number, y: number, lerpBase: number, dt: number): void {
    const factor = lerpBase >= 1 ? 1 : 1 - Math.pow(1 - lerpBase, dt * 60);
    const viewW = this.cam.width / this.currentZoom;
    const viewH = this.cam.height / this.currentZoom;
    const wantX = x - viewW / 2;
    const wantY = y - viewH / 2;
    const sx = Phaser.Math.Linear(this.cam.scrollX, wantX, factor);
    const sy = Phaser.Math.Linear(this.cam.scrollY, wantY, factor);
    this.cam.setScroll(sx, sy);
    this.clampScroll();
  }

  private clampScroll(): void {
    const viewW = this.cam.width / this.currentZoom;
    const viewH = this.cam.height / this.currentZoom;
    const maxX = Math.max(0, this.worldW - viewW);
    const maxY = Math.max(0, this.worldH - viewH);
    this.cam.setScroll(
      Phaser.Math.Clamp(this.cam.scrollX, 0, maxX),
      Phaser.Math.Clamp(this.cam.scrollY, 0, maxY),
    );
  }

  private cameraCentre(): { x: number; y: number } {
    return {
      x: this.cam.scrollX + this.cam.width / (2 * this.currentZoom),
      y: this.cam.scrollY + this.cam.height / (2 * this.currentZoom),
    };
  }

  private distCameraCentreTo(x: number, y: number): number {
    const c = this.cameraCentre();
    return Math.hypot(c.x - x, c.y - y);
  }

  private isPlayerOutsideSafeView(px: number, py: number): boolean {
    const view = this.cam.worldView;
    const mx = view.width * (1 - SAFE_VIEW_FRACTION) * 0.5;
    const my = view.height * (1 - SAFE_VIEW_FRACTION) * 0.5;
    return (
      px < view.x + mx ||
      px > view.right - mx ||
      py < view.y + my ||
      py > view.bottom - my
    );
  }

  private onResize = (): void => {
    this.zoomFloor = this.computeZoomFloor();
    this.targetZoom = Phaser.Math.Clamp(this.targetZoom, this.zoomFloor, CAMERA_ZOOM_MAX);
    this.currentZoom = Phaser.Math.Clamp(this.currentZoom, this.zoomFloor, CAMERA_ZOOM_MAX);
    this.cam.setZoom(this.currentZoom);
    this.cam.setBounds(0, 0, this.worldW, this.worldH);
    this.clampScroll();
  };

  private bindInput(): void {
    this.unbindInput();
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.input.on('pointerupoutside', this.onPointerUp, this);
    this.scene.input.on('wheel', this.onWheel, this);
  }

  private unbindInput(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
  }

  private cancelGestures(): void {
    this.dragging = false;
    this.dragArmed = false;
    this.dragPointerId = -1;
    this.pinching = false;
  }

  private clientCoords(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const e = pointer.event as MouseEvent | TouchEvent | undefined;
    if (e && 'clientX' in e && typeof (e as MouseEvent).clientX === 'number') {
      return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    }
    if (e && 'changedTouches' in e && e.changedTouches?.[0]) {
      const t = e.changedTouches[0];
      return { x: t.clientX, y: t.clientY };
    }
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sw = this.scene.scale.width || 1;
    const sh = this.scene.scale.height || 1;
    return {
      x: rect.left + (pointer.x / sw) * rect.width,
      y: rect.top + (pointer.y / sh) * rect.height,
    };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const c = this.clientCoords(pointer);
    if (isPointerOverInteractiveUi(c.x, c.y)) {
      return;
    }

    const pointers = this.activePointers();
    if (pointers.length >= 2) {
      this.beginPinch(pointers);
      return;
    }

    if (this.canStartPan && !this.canStartPan(pointer)) return;

    this.dragArmed = true;
    this.dragging = false;
    this.dragPointerId = pointer.id;
    this.dragStartSX = pointer.x;
    this.dragStartSY = pointer.y;
    this.dragStartScrollX = this.cam.scrollX;
    this.dragStartScrollY = this.cam.scrollY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;

    const pointers = this.activePointers();
    if (pointers.length >= 2) {
      if (!this.pinching) this.beginPinch(pointers);
      this.updatePinch(pointers);
      return;
    }

    if (this.pinching && pointers.length < 2) {
      this.pinching = false;
    }

    if (!this.dragArmed || pointer.id !== this.dragPointerId) return;
    if (!pointer.isDown) return;

    const dx = pointer.x - this.dragStartSX;
    const dy = pointer.y - this.dragStartSY;
    if (!this.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      this.dragging = true;
      this.mode = 'MANUAL_PAN';
    }
    if (!this.dragging) return;

    this.cam.setScroll(
      this.dragStartScrollX - dx / this.currentZoom,
      this.dragStartScrollY - dy / this.currentZoom,
    );
    this.clampScroll();
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.dragPointerId) {
      this.dragArmed = false;
      this.dragging = false;
      this.dragPointerId = -1;
    }
    if (this.activePointers().length < 2) {
      this.pinching = false;
    }
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    if (!this.enabled) return;
    const dir = dy > 0 ? -1 : 1;
    this.setTargetZoom(this.targetZoom + dir * ZOOM_WHEEL_STEP * 1.5);
  }

  private activePointers(): Phaser.Input.Pointer[] {
    return this.scene.input.manager.pointers.filter((p) => p && p.active && p.isDown);
  }

  private beginPinch(pointers: Phaser.Input.Pointer[]): void {
    if (pointers.length < 2) return;
    // Ignore pinch if either finger started on UI
    for (const p of pointers) {
      const c = this.clientCoords(p);
      if (isPointerOverInteractiveUi(c.x, c.y)) {
        return;
      }
    }
    this.pinching = true;
    this.dragArmed = false;
    this.dragging = false;
    this.pinchStartDist = Math.hypot(
      pointers[0].x - pointers[1].x,
      pointers[0].y - pointers[1].y,
    );
    this.pinchStartZoom = this.currentZoom;
    this.mode = 'MANUAL_PAN';
  }

  private updatePinch(pointers: Phaser.Input.Pointer[]): void {
    if (!this.pinching || pointers.length < 2 || this.pinchStartDist < 1) return;
    const dist = Math.hypot(
      pointers[0].x - pointers[1].x,
      pointers[0].y - pointers[1].y,
    );
    const ratio = dist / this.pinchStartDist;
    this.setTargetZoom(this.pinchStartZoom * ratio);
    // Apply immediately toward target for responsive pinch feel
    this.currentZoom = Phaser.Math.Clamp(
      Phaser.Math.Linear(this.currentZoom, this.targetZoom, 0.45),
      this.zoomFloor,
      CAMERA_ZOOM_MAX,
    );
    this.cam.setZoom(this.currentZoom);
    this.clampScroll();
  }
}
