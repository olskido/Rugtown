import Phaser from 'phaser';
import { drawHumanoid, CHAR_W, CHAR_H, SHADOW_W, SHADOW_H } from '../render/HumanoidRenderer';
import {
  resolveAppearance, DEFAULT_APPEARANCE,
  type CharacterAppearance, type ResolvedAppearance,
} from '../world/CharacterAppearance';

/*
  CharacterPreviewScene.ts
  ─────────────────────────
  Minimal, standalone Phaser scene used exclusively by the character
  creator's live-preview pane. Renders exactly one humanoid, idle-
  breathing and blinking, via the same shared drawHumanoid() function
  WorldScene uses — so the preview is always bit-identical to the in-
  game look. No background, no NPCs, no collision, no EventManager; the
  canvas uses a transparent background so the card's CSS shows through.

  The companion CharacterPreviewGame class (which mounts this scene)
  exposes a simple `setAppearance()` method for the React owner to push
  updates — updates are picked up automatically on the next frame
  without a scene restart.
*/

// Idle-animation constants shared with WorldScene so the preview
// animates identically to the game.
const IDLE_BREATH_SPEED  = 1.7;
const IDLE_BREATH_SCALE  = 0.035;
const IDLE_BOB           = 0.6;
const IDLE_SWAY          = 0.045;
const IDLE_ARM_SWAY      = 0.4;
const IDLE_HEAD_BOB      = 0.5;

export class CharacterPreviewScene extends Phaser.Scene {
  private shadow!: Phaser.GameObjects.Graphics;
  private body!: Phaser.GameObjects.Graphics;
  private animTick = 0;
  private resolvedAppearance: ResolvedAppearance;
  private blinkTimerNext = Phaser.Math.Between(2000, 5000);
  private blinkUntil = 0;

  constructor() {
    super({ key: 'CharacterPreviewScene' });
    this.resolvedAppearance = resolveAppearance(DEFAULT_APPEARANCE);
  }

  /** Called by CharacterPreviewGame.setAppearance() — updates take
   *  effect the very next frame without any scene restart. */
  setAppearance(appearance: CharacterAppearance) {
    this.resolvedAppearance = resolveAppearance(appearance);
  }

  create() {
    const { width: w, height: h } = this.scale;
    this.shadow = this.add.graphics().setDepth(0);
    this.body   = this.add.graphics().setDepth(1);

    // Centre the character at roughly mid-height, a bit below center so
    // there's breathing room for hair/hats above the head.
    this.cameras.main.centerOn(w / 2, h / 2);
  }

  update(_time: number, delta: number) {
    this.animTick += delta;
    const t = this.animTick / 1000;

    // Blink
    if (this.blinkUntil > 0) {
      this.blinkUntil -= delta;
    } else {
      this.blinkTimerNext -= delta;
      if (this.blinkTimerNext <= 0) {
        this.blinkUntil = 120;
        this.blinkTimerNext = Phaser.Math.Between(2000, 5000);
      }
    }

    const breathPhase = t * IDLE_BREATH_SPEED;
    const breathe     = Math.sin(breathPhase);
    const idleBob     = Math.abs(breathe) * IDLE_BOB;
    const idleSway    = Math.sin(breathPhase * 0.55) * IDLE_SWAY;
    const breathScale = 1 + breathe * IDLE_BREATH_SCALE;
    const armSwing    = Math.sin(breathPhase * 0.55) * IDLE_ARM_SWAY;
    const idleHeadBob = Math.sin(breathPhase * 0.8 + 1) * IDLE_HEAD_BOB;
    const slowSway    = Math.sin(t * 0.18) * 0.06;

    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const cy = h / 2 + 8; // slight downward offset for hat headroom

    // Two-layer shadow
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.16);
    this.shadow.fillEllipse(cx, cy + CHAR_H / 2 + 2, (SHADOW_W + 4) * (1 - idleBob * 0.05), SHADOW_H + 2);
    this.shadow.fillStyle(0x000000, 0.32);
    this.shadow.fillEllipse(cx, cy + CHAR_H / 2 + 2, SHADOW_W * (1 - idleBob * 0.05), SHADOW_H);

    drawHumanoid(this.body, cx, cy, {
      facing: 'down',
      bodyBob: idleBob,
      legStagger: 0,
      legLiftL: 0,
      legLiftR: 0,
      armSwing,
      headBob: idleHeadBob,
      rotation: idleSway + slowSway,
      breathScale,
      appearance: this.resolvedAppearance,
      blink: this.blinkUntil > 0 ? 1 : 0,
    });
  }
}
