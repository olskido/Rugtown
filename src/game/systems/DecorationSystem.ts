/**
 * DecorationSystem.ts
 * ───────────────────
 * Owns all purely cosmetic environmental decoration in RugTown:
 *  - Plaza ambience: fountain glow, lamp flicker, drifting dust/pollen,
 *    falling leaves, market signs, canal shimmer, gliding birds
 *  - Fountain onboarding guide (pulsing gold ring visible until first claim)
 *  - Fallback background (drawn when rugtown-city.png is missing)
 *
 * Everything here is self-driving (Phaser tweens/particles tick it).
 * The only method that must be called from update() is updateFountainGuide().
 * No collision, no interaction, no gameplay state changes.
 */

import Phaser from 'phaser';
import { getWorldObject } from '../world/WorldObjects';

/* ─── Constants ──────────────────────────────────────────────────────── */

const PLAZA_RADIUS = 260; // rough visual extent, world px

const FOUNTAIN_GLOW_COLOR = 0x9fe8ff;
const FOUNTAIN_PULSE_MIN  = 0.16;
const FOUNTAIN_PULSE_MAX  = 0.34;

const LAMP_OFFSETS: { x: number; y: number }[] = [
  { x: -95, y: -55 },
  { x:  95, y: -55 },
  { x: -95, y:  65 },
  { x:  95, y:  65 },
];

const SIGN_OFFSETS: { x: number; y: number }[] = [
  { x: -150, y: -15 },
  { x: -165, y:  35 },
  { x:  140, y:  -5 },
];

const TREE_OFFSETS: { x: number; y: number }[] = [
  { x: -180, y: 55 },
  { x:  175, y: 40 },
];

const CANAL_OFFSET = { x: 195, y: -70, w: 90, h: 26 };

/* ─── System ─────────────────────────────────────────────────────────── */

export class DecorationSystem {
  private scene: Phaser.Scene;
  private fountainGuide: Phaser.GameObjects.Graphics | null = null;
  private fountainGuideAnimTick = 0;
  private fountainGuideRedrawElapsed = 50;
  private fountainGuideWasNear: boolean | null = null;
  private plazaX = 0;
  private plazaY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /* ── Public init methods ──────────────────────────────────────────── */

  /** Create all plaza ambience decorations.  Call once (deferred ~80ms)
   *  after create() so the first frame isn't blocked by particle setup. */
  createAmbience(worldW: number, worldH: number, spawnFx: number, spawnFy: number): void {
    this.plazaX = worldW * spawnFx;
    this.plazaY = worldH * spawnFy;

    this.createFountainAmbience();
    this.createLampAmbience();
    this.createDustAndPollen();
    this.createLeafAmbience();
    this.createMarketSigns();
    this.createCanalShimmer();
    this.scheduleNextBird();
  }

  /** Create the fountain onboarding guide (pulsing gold ring).
   *  Visible until the player's first fountain claim. */
  createFountainGuide(worldW: number, worldH: number): void {
    const obj = getWorldObject('fountain');
    if (!obj) return;
    void worldW; void worldH; // positions come from obj + worldW/worldH at update time
    this.fountainGuide = this.scene.add.graphics().setDepth(3.5);
  }

  /** Draw/animate the fountain guide; call every frame from update().
   *  @param delta  Frame delta in ms
   *  @param px     Player world-x
   *  @param py     Player world-y
   *  @param worldW World pixel width
   *  @param worldH World pixel height
   */
  updateFountainGuide(
    delta: number,
    px: number,
    py: number,
    worldW: number,
    worldH: number,
  ): void {
    if (!this.fountainGuide) return;

    // Hide permanently once the player has claimed the fountain reward.
    if (this.scene.registry.get('fountainClaimed') === true) {
      if (this.fountainGuide.visible) this.fountainGuide.setVisible(false);
      return;
    }

    const obj = getWorldObject('fountain');
    if (!obj) return;
    const wx = obj.x * worldW;
    const wy = obj.y * worldH;

    this.fountainGuideAnimTick += delta;
    const t     = this.fountainGuideAnimTick / 1000;
    const pulse = (Math.sin(t * 2.6) + 1) / 2; // 0..1

    const dx     = px - wx;
    const dy     = py - wy;
    const isNear = dx * dx + dy * dy < 160 * 160;

    this.fountainGuideRedrawElapsed += delta;
    if (this.fountainGuideRedrawElapsed < 50 && this.fountainGuideWasNear === isNear) return;
    this.fountainGuideRedrawElapsed = 0;
    this.fountainGuideWasNear = isNear;

    const baseAlpha = isNear ? 0.55 + pulse * 0.40 : 0.18 + pulse * 0.14;

    this.fountainGuide.clear();
    for (let r = 80; r >= 8; r -= 18) {
      const a = baseAlpha * (1 - r / 80) * 0.9;
      this.fountainGuide.fillStyle(0xe8c840, a);
      this.fountainGuide.fillCircle(wx, wy, r * (0.88 + pulse * 0.22));
    }
    this.fountainGuide.fillStyle(0xfff0a0, Math.min(baseAlpha * 1.6, 0.85));
    this.fountainGuide.fillCircle(wx, wy, 10 * (0.8 + pulse * 0.5));
  }

  /* ── Static fallback world ────────────────────────────────────────── */

  /** Draw a placeholder dark-grid world when rugtown-city.png is missing.
   *  Called from WorldScene.create() before any other system is set up. */
  static drawFallbackWorld(scene: Phaser.Scene, worldW: number, worldH: number): void {
    const g = scene.add.graphics().setDepth(0);

    g.fillGradientStyle(0x030a0c, 0x04090e, 0x050c10, 0x030709, 1);
    g.fillRect(0, 0, worldW, worldH);

    for (let r = 600; r > 0; r -= 60) {
      g.fillStyle(0xc87020, 0.015 * (600 - r) / 600);
      g.fillCircle(worldW * 0.38, worldH * 0.58, r);
    }

    g.lineStyle(1, 0x1a2830, 0.25);
    for (let x = 0; x < worldW; x += 200) g.lineBetween(x, 0, x, worldH);
    for (let y = 0; y < worldH; y += 200) g.lineBetween(0, y, worldW, y);

    scene.add.text(worldW / 2, worldH / 2 - 80,
      'Place rugtown-city.png in:', {
        fontFamily: 'Courier New', fontSize: '22px', color: '#c8902a', align: 'center',
      }
    ).setOrigin(0.5).setDepth(1);

    scene.add.text(worldW / 2, worldH / 2 - 36,
      'public/assets/backgrounds/rugtown-city.png', {
        fontFamily: 'Courier New', fontSize: '16px', color: '#e8b84b', align: 'center',
        backgroundColor: '#0d1a1e', padding: { x: 14, y: 8 },
      }
    ).setOrigin(0.5).setDepth(1);

    scene.add.text(worldW / 2, worldH / 2 + 16,
      'Player spawns at fountain area.\nWASD to move. Scroll to zoom.', {
        fontFamily: 'Courier New', fontSize: '14px', color: '#7a6a52',
        align: 'center', lineSpacing: 6,
      }
    ).setOrigin(0.5).setDepth(1);
  }

  /* ── Private ambience builders ────────────────────────────────────── */

  private createFountainAmbience(): void {
    const { plazaX: x, plazaY: y } = this;

    const glow = this.scene.add.graphics().setDepth(2).setPosition(x, y);
    for (let r = 34; r > 0; r -= 6) {
      glow.fillStyle(FOUNTAIN_GLOW_COLOR, 0.05 * (1 - r / 34));
      glow.fillCircle(0, 0, r);
    }
    glow.setAlpha(FOUNTAIN_PULSE_MIN);

    this.scene.tweens.add({
      targets:  glow,
      alpha:    FOUNTAIN_PULSE_MAX,
      scale:    1.12,
      duration: 2400,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    this.scene.add.particles(x, y, '__WHITE', {
      x: { min: -26, max: 26 },
      y: { min: -14, max: 14 },
      lifespan: { min: 900, max: 1600 },
      speedX:   { min: -6,  max: 6  },
      speedY:   { min: -4,  max: 4  },
      scale:    { start: 0.9, end: 0 },
      alpha:    { start: 0.7, end: 0 },
      tint:     [ 0xbfe9ff, 0xffffff, 0x8fd8f0 ],
      frequency: 160,
      quantity:  1,
      blendMode: 'ADD',
    }).setDepth(3);
  }

  private createLampAmbience(): void {
    for (const off of LAMP_OFFSETS) {
      const glow = this.scene.add.graphics()
        .setDepth(2)
        .setPosition(this.plazaX + off.x, this.plazaY + off.y);

      for (let r = 22; r > 0; r -= 4) {
        glow.fillStyle(0xe8b84b, 0.10 * (1 - r / 22));
        glow.fillCircle(0, 0, r);
      }
      glow.setAlpha(0.7);

      const flicker = () => {
        this.scene.tweens.add({
          targets:  glow,
          alpha:    Phaser.Math.FloatBetween(0.45, 0.9),
          scale:    Phaser.Math.FloatBetween(0.92, 1.08),
          duration: Phaser.Math.Between(180, 520),
          ease:     'Sine.easeInOut',
          onComplete: flicker,
        });
      };
      flicker();
    }
  }

  private createDustAndPollen(): void {
    const x = this.plazaX;
    const y = this.plazaY;
    const halfW = PLAZA_RADIUS;
    const halfH = PLAZA_RADIUS * 0.6;

    this.scene.add.particles(0, 0, '__WHITE', {
      x: { min: x - halfW, max: x + halfW },
      y: { min: y - halfH, max: y + halfH },
      lifespan: { min: 6000,  max: 11000 },
      speedX:   { min: -4,    max: 4     },
      speedY:   { min: -6,    max: -1    },
      scale:    { min: 0.5,   max: 1.1   },
      alpha:    { start: 0.22, end: 0    },
      tint:     0xc8b89a,
      frequency: 1300,
      quantity:  1,
    }).setDepth(2);

    this.scene.add.particles(0, 0, '__WHITE', {
      x: { min: x - halfW * 0.8, max: x + halfW * 0.8 },
      y: { min: y - halfH,       max: y + halfH       },
      lifespan: { min: 5000,  max: 9000 },
      speedX:   { min: -8,    max: 8   },
      speedY:   { min: -10,   max: -3  },
      scale:    { min: 0.7,   max: 1.3 },
      alpha:    { start: 0.3, end: 0   },
      tint:     [ 0xe8d8a0, 0xf0e0b0 ],
      frequency: 1700,
      quantity:  1,
      blendMode: 'ADD',
    }).setDepth(2);
  }

  private createLeafAmbience(): void {
    for (const off of TREE_OFFSETS) {
      const tx = this.plazaX + off.x;
      const ty = this.plazaY + off.y;

      this.scene.add.particles(0, 0, '__WHITE', {
        x: { min: tx - 22, max: tx + 22 },
        y: { min: ty - 30, max: ty - 10 },
        lifespan: { min: 3200, max: 5200 },
        speedX:   { min: -6,   max: 6   },
        speedY:   { min: 10,   max: 22  },
        rotate:   { min: 0,    max: 360 },
        scale:    { min: 0.55, max: 1   },
        alpha:    { start: 0.55, end: 0 },
        tint:     [ 0x6a8a3a, 0x8aa84a, 0xb08a3a ],
        frequency: 2000,
        quantity:  1,
      }).setDepth(3);
    }
  }

  private createMarketSigns(): void {
    for (const off of SIGN_OFFSETS) {
      const sign = this.scene.add.graphics()
        .setDepth(4)
        .setPosition(this.plazaX + off.x, this.plazaY + off.y);

      sign.fillStyle(0x2a1c10, 0.85);
      sign.fillRect(-9, 0, 18, 12);
      sign.lineStyle(1, 0xc8902a, 0.6);
      sign.strokeRect(-9, 0, 18, 12);
      sign.lineStyle(1, 0x6a4c14, 0.8);
      sign.lineBetween(0, -6, 0, 0);

      const swayAmt = Phaser.Math.FloatBetween(3, 5);
      sign.angle = -swayAmt;
      this.scene.tweens.add({
        targets:  sign,
        angle:    swayAmt,
        duration: Phaser.Math.Between(2200, 3200),
        delay:    Phaser.Math.Between(0, 800),
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    }
  }

  private createCanalShimmer(): void {
    const cx = this.plazaX + CANAL_OFFSET.x;
    const cy = this.plazaY + CANAL_OFFSET.y;

    this.scene.add.particles(0, 0, '__WHITE', {
      x: { min: cx - CANAL_OFFSET.w / 2, max: cx + CANAL_OFFSET.w / 2 },
      y: { min: cy - CANAL_OFFSET.h / 2, max: cy + CANAL_OFFSET.h / 2 },
      lifespan: { min: 1400, max: 2200 },
      speedX:   { min: -3,   max: 3   },
      speedY:   { min: -2,   max: 2   },
      scale:    { min: 0.4,  max: 0.8 },
      alpha:    { start: 0.18, end: 0 },
      tint:     [ 0x9fcbe0, 0xffffff ],
      frequency: 260,
      quantity:  1,
      blendMode: 'ADD',
    }).setDepth(2);
  }

  private spawnBird(): void {
    const dir    = Math.random() < 0.5 ? 1 : -1;
    const spanX  = 360;
    const startX = this.plazaX - dir * spanX;
    const endX   = this.plazaX + dir * spanX;
    const baseY  = this.plazaY - 200 - Math.random() * 70;
    const endY   = baseY + (Math.random() - 0.5) * 50;

    const bird = this.scene.add.graphics().setDepth(15).setPosition(startX, baseY);
    bird.lineStyle(2, 0x161616, 0.5);
    bird.beginPath();
    bird.moveTo(-6, 0);
    bird.lineTo(0, -3);
    bird.lineTo(6, 0);
    bird.strokePath();

    this.scene.tweens.add({
      targets:    bird,
      x:          endX,
      y:          endY,
      duration:   Phaser.Math.Between(7000, 11000),
      ease:       'Sine.easeInOut',
      onComplete: () => bird.destroy(),
    });
  }

  private scheduleNextBird(): void {
    this.scene.time.delayedCall(Phaser.Math.Between(10000, 20000), () => {
      this.spawnBird();
      this.scheduleNextBird();
    });
  }
}
