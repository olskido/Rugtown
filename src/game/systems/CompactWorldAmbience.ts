/**
 * CompactWorldAmbience.ts
 * ────────────────────────
 * Phase 8E — living-city ambience for the compact 3600×2400 world.
 *
 * DecorationSystem.ts already owns Spring Water's plaza ambience (fountain
 * glow/sparkle, 4 lamp glows, dust/pollen, leaf drift, market-sign sway,
 * canal shimmer, birds) — this module does NOT duplicate that. It extends
 * atmosphere to the other 19 landmarks: sparse district-flavoured particle
 * zones, warm glow on placed lamp props, gentle sway on placed vegetation
 * props, a handful of restrained landmark micro-animations, and a couple
 * of extra birds over the park/waterfront.
 *
 * Visual only — no collisions, no interaction zones, no gameplay state.
 * Positions are read from canonical WorldObjects anchors and the active
 * placement manifest (via WorldAssetLoader), never hardcoded twice.
 */

import Phaser from 'phaser';
import { getWorldObject, toWorldPosition } from '../world/WorldObjects';
import type { WorldAssetLoader } from '../worldEngine/WorldAssetLoader';
import {
  C_LAMP_GLOW, C_BORDER_GOLD, C_VAULT_GOLD, C_ARENA_ACCENT, C_LEAF_MID,
} from '../worldEngine/WorldPalette';

/** Task 13 — reduced-motion switch. No settings UI exists yet for this,
 *  so it's a single constant per the Phase 8E brief. */
export type AmbienceQuality = 'off' | 'low' | 'full';
export const AMBIENCE_QUALITY: AmbienceQuality = 'full';

const WATER_TINT = 0x9fe8ff; // matches DecorationSystem's fountain glow hue

interface DistrictGroup {
  id: string;
  landmarkIds: string[];
  radius: number;
  tint: number | number[];
  /** particle emission gap in ms — higher = sparser. */
  frequency: number;
  lifespan: [number, number];
  speedY: [number, number];
  blend: 'ADD' | 'NORMAL';
  alpha: number;
}

/** Task 5 — district atmosphere zones (fountain itself excluded; that's
 *  DecorationSystem's job). Centroid + radius are derived at runtime from
 *  the member landmarks' canonical anchors. */
const DISTRICT_GROUPS: DistrictGroup[] = [
  { id: 'civic-outer', landmarkIds: ['notice', 'coffee'], radius: 180, tint: C_LAMP_GLOW, frequency: 3100, lifespan: [1800, 2800], speedY: [-6, -2], blend: 'ADD', alpha: 0.16 },
  { id: 'government', landmarkIds: ['government', 'trading_academy', 'fame'], radius: 260, tint: 0xc8b89a, frequency: 3000, lifespan: [2200, 3200], speedY: [-3, -1], blend: 'NORMAL', alpha: 0.14 },
  { id: 'market', landmarkIds: ['market', 'market_shop'], radius: 220, tint: [0xe8d8a0, 0xc8b89a], frequency: 1800, lifespan: [1600, 2600], speedY: [-4, -1], blend: 'NORMAL', alpha: 0.2 },
  { id: 'financial', landmarkIds: ['whale', 'financial_office', 'holder_bank', 'research_observatory', 'alpha'], radius: 280, tint: C_BORDER_GOLD, frequency: 3200, lifespan: [2000, 3000], speedY: [-8, -3], blend: 'ADD', alpha: 0.14 },
  { id: 'creator', landmarkIds: ['nft_gallery', 'nft_creator_studio'], radius: 200, tint: [C_VAULT_GOLD, 0xffffff], frequency: 2400, lifespan: [1600, 2600], speedY: [-5, -2], blend: 'ADD', alpha: 0.18 },
  { id: 'arena', landmarkIds: ['arena', 'tournament_hall'], radius: 260, tint: C_ARENA_ACCENT, frequency: 2400, lifespan: [1400, 2200], speedY: [-14, -6], blend: 'ADD', alpha: 0.2 },
  { id: 'park', landmarkIds: ['park'], radius: 220, tint: C_LEAF_MID, frequency: 1600, lifespan: [3000, 4400], speedY: [-3, 2], blend: 'NORMAL', alpha: 0.22 },
  { id: 'waterfront', landmarkIds: ['bridge', 'cashback'], radius: 240, tint: [WATER_TINT, 0xffffff], frequency: 2800, lifespan: [1600, 2400], speedY: [-2, 2], blend: 'ADD', alpha: 0.16 },
];

/** Task 9 — restrained per-building micro-animations (5-8 landmarks). */
const BUILDING_ANIMATIONS: { landmarkId: string; color: number; offsetY: number; radius: number }[] = [
  { landmarkId: 'whale', color: C_LAMP_GLOW, offsetY: -160, radius: 14 },
  { landmarkId: 'alpha', color: C_BORDER_GOLD, offsetY: -70, radius: 10 },
  { landmarkId: 'market', color: C_LAMP_GLOW, offsetY: -100, radius: 12 },
  { landmarkId: 'arena', color: C_ARENA_ACCENT, offsetY: -20, radius: 20 },
  { landmarkId: 'research_observatory', color: 0xbfe9ff, offsetY: -150, radius: 12 },
  { landmarkId: 'cashback', color: C_VAULT_GOLD, offsetY: -40, radius: 9 },
  { landmarkId: 'fame', color: C_VAULT_GOLD, offsetY: -140, radius: 16 },
];

/** Simple deterministic string hash — used to phase-offset vegetation sway
 *  and lamp flicker per prop without Math.random (Task 9 determinism). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export class CompactWorldAmbience {
  private scene: Phaser.Scene;
  private worldW = 0;
  private worldH = 0;

  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private emitterAnchors: { emitter: Phaser.GameObjects.Particles.ParticleEmitter; x: number; y: number }[] = [];
  private glows: Phaser.GameObjects.Graphics[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private birds: Phaser.GameObjects.Graphics[] = [];
  private activationTimer: Phaser.Time.TimerEvent | null = null;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(worldW: number, worldH: number, assetLoader: WorldAssetLoader | undefined): void {
    this.worldW = worldW;
    this.worldH = worldH;

    if (AMBIENCE_QUALITY === 'off') return;

    this.createDistrictAtmospheres();
    this.createBuildingMicroAnimations();
    if (assetLoader) {
      this.createLampGlows(assetLoader);
      this.createVegetationSway(assetLoader);
    }
    this.scheduleExtraBirds();
    this.startCameraActivation();
  }

  /* ── Task 5: district atmosphere particles ──────────────────────────── */

  private createDistrictAtmospheres(): void {
    const qMul = AMBIENCE_QUALITY === 'low' ? 2 : 1; // lower quality → sparser (bigger gap)

    for (const g of DISTRICT_GROUPS) {
      const pts = g.landmarkIds
        .map((id) => getWorldObject(id))
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => toWorldPosition(o, this.worldW, this.worldH));
      if (pts.length === 0) continue;

      const cx = pts.reduce((s, p) => s + p.wx, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.wy, 0) / pts.length;

      const emitter = this.scene.add.particles(0, 0, '__WHITE', {
        x: { min: cx - g.radius, max: cx + g.radius },
        y: { min: cy - g.radius * 0.6, max: cy + g.radius * 0.6 },
        lifespan: { min: g.lifespan[0], max: g.lifespan[1] },
        speedX: { min: -3, max: 3 },
        speedY: { min: g.speedY[0], max: g.speedY[1] },
        scale: { min: 0.5, max: 1 },
        alpha: { start: g.alpha, end: 0 },
        tint: g.tint,
        frequency: g.frequency * qMul,
        quantity: 1,
        blendMode: g.blend,
      }).setDepth(2);

      this.emitters.push(emitter);
      this.emitterAnchors.push({ emitter, x: cx, y: cy });
    }
  }

  /* ── Task 9: building micro-animations (5-8 landmarks) ──────────────── */

  private createBuildingMicroAnimations(): void {
    for (const b of BUILDING_ANIMATIONS) {
      const obj = getWorldObject(b.landmarkId);
      if (!obj) continue;
      const { wx, wy } = toWorldPosition(obj, this.worldW, this.worldH);

      const glow = this.scene.add.graphics().setDepth(2).setPosition(wx, wy + b.offsetY);
      for (let r = b.radius; r > 0; r -= 4) {
        glow.fillStyle(b.color, 0.08 * (1 - r / b.radius));
        glow.fillCircle(0, 0, r);
      }
      glow.setAlpha(0.5);
      this.glows.push(glow);

      const phase = hashStr(b.landmarkId) % 1000;
      const tween = this.scene.tweens.add({
        targets: glow,
        alpha: 0.85,
        scale: 1.15,
        duration: 2200 + phase,
        delay: phase,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.push(tween);
    }
  }

  /* ── Task 4: lamp glow on placed lamp props ─────────────────────────── */

  private createLampGlows(assetLoader: WorldAssetLoader): void {
    const skip = AMBIENCE_QUALITY === 'low' ? 2 : 1; // 'low' lights every other lamp
    let i = 0;
    for (const { entry, image } of assetLoader.getPlacedSprites()) {
      if (entry.kind !== 'prop') continue;
      if (!/street_lamp|park_lamp/.test(entry.sourceImagePath)) continue;
      i += 1;
      if (i % skip !== 0) continue;

      // Lamps render bottom-anchored (ground contact at image.y); the glow
      // belongs near the light source at the top of the post, not the base.
      const postHeight = entry.footprintPx?.h ?? 150;
      const glow = this.scene.add.graphics().setDepth(2).setPosition(image.x, image.y - postHeight * 0.85);
      for (let r = 20; r > 0; r -= 4) {
        glow.fillStyle(C_LAMP_GLOW, 0.09 * (1 - r / 20));
        glow.fillCircle(0, 0, r);
      }
      glow.setAlpha(0.7);
      this.glows.push(glow);

      const phase = hashStr(entry.assetId);
      const flicker = (): void => {
        if (this.destroyed) return;
        const tween = this.scene.tweens.add({
          targets: glow,
          alpha: 0.45 + (phase % 45) / 100,
          scale: 0.92 + (phase % 16) / 100,
          duration: 200 + (phase % 340),
          ease: 'Sine.easeInOut',
          onComplete: flicker,
        });
        this.tweens.push(tween);
      };
      flicker();
    }
  }

  /* ── Task 6: vegetation sway on placed tree/bush props ──────────────── */

  private createVegetationSway(assetLoader: WorldAssetLoader): void {
    if (AMBIENCE_QUALITY === 'low') return; // Task 13 — skip sway at reduced quality

    for (const { entry, image } of assetLoader.getPlacedSprites()) {
      if (entry.kind !== 'prop') continue;
      if (!/^nature\/(tree|bush)/.test(entry.sourceImagePath)) continue;

      const h = hashStr(entry.assetId);
      const swayDeg = 0.6 + (h % 60) / 100; // ~0.6-1.2°, barely noticeable
      const duration = 2600 + (h % 1400);
      const delay = h % 900;

      const tween = this.scene.tweens.add({
        targets: image,
        angle: { from: -swayDeg, to: swayDeg },
        duration,
        delay,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.push(tween);
    }
  }

  /* ── Task 7: a few extra birds over park / waterfront ───────────────── */

  private scheduleExtraBirds(): void {
    if (AMBIENCE_QUALITY !== 'full') return; // 'low' relies on DecorationSystem's rarer plaza birds only

    for (const anchorId of ['park', 'bridge']) {
      const obj = getWorldObject(anchorId);
      if (!obj) continue;
      const { wx, wy } = toWorldPosition(obj, this.worldW, this.worldH);
      this.scheduleBird(wx, wy, hashStr(anchorId) % 8000);
    }
  }

  private scheduleBird(anchorX: number, anchorY: number, initialDelay: number): void {
    const spawn = (): void => {
      if (this.destroyed) return;
      this.spawnBird(anchorX, anchorY);
      const timer = this.scene.time.delayedCall(Phaser.Math.Between(18000, 30000), spawn);
      this.timers.push(timer);
    };
    const timer = this.scene.time.delayedCall(initialDelay + Phaser.Math.Between(4000, 12000), spawn);
    this.timers.push(timer);
  }

  private spawnBird(anchorX: number, anchorY: number): void {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const spanX = 300;
    const startX = anchorX - dir * spanX;
    const endX = anchorX + dir * spanX;
    const baseY = anchorY - 150 - Math.random() * 60;
    const endY = baseY + (Math.random() - 0.5) * 40;

    const bird = this.scene.add.graphics().setDepth(15).setPosition(startX, baseY);
    bird.lineStyle(2, 0x161616, 0.45);
    bird.beginPath();
    bird.moveTo(-5, 0);
    bird.lineTo(0, -3);
    bird.lineTo(5, 0);
    bird.strokePath();
    this.birds.push(bird);

    const tween = this.scene.tweens.add({
      targets: bird,
      x: endX,
      y: endY,
      duration: Phaser.Math.Between(6500, 10000),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        bird.destroy();
        const idx = this.birds.indexOf(bird);
        if (idx >= 0) this.birds.splice(idx, 1);
      },
    });
    this.tweens.push(tween);
  }

  /* ── Task 11: camera-aware activation ───────────────────────────────── */

  private startCameraActivation(): void {
    if (this.emitterAnchors.length === 0) return;
    this.activationTimer = this.scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        if (this.destroyed) return;
        const view = this.scene.cameras.main.worldView;
        const margin = 400;
        for (const { emitter, x, y } of this.emitterAnchors) {
          const onScreen =
            x >= view.x - margin && x <= view.right + margin &&
            y >= view.y - margin && y <= view.bottom + margin;
          if (onScreen) emitter.start();
          else emitter.stop();
        }
      },
    });
  }

  /* ── Task 14: cleanup ────────────────────────────────────────────────── */

  destroy(): void {
    this.destroyed = true;

    this.activationTimer?.remove();
    this.activationTimer = null;

    for (const t of this.timers) t.remove();
    this.timers = [];

    for (const tw of this.tweens) tw.stop();
    this.tweens = [];

    for (const e of this.emitters) e.destroy();
    this.emitters = [];
    this.emitterAnchors = [];

    for (const g of this.glows) g.destroy();
    this.glows = [];

    for (const b of this.birds) b.destroy();
    this.birds = [];
  }
}
