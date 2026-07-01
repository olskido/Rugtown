import Phaser from 'phaser';
import { shadeColor, type ResolvedAppearance } from '../world/CharacterAppearance';

/*
  HumanoidRenderer.ts
  ────────────────────
  The shared pixel-art humanoid renderer — used by the player and every
  NPC in WorldScene, and (via this extraction) by the character-creator
  live preview too. Framework-light: only depends on Phaser's Graphics
  API and the pure-data CharacterAppearance module, not on WorldScene or
  any gameplay state, so a second, independent Phaser scene can render
  through the exact same function.

  Shapes are drawn relative to a local origin (0,0) at the character's
  center; the Graphics object itself is then positioned/rotated/scaled,
  so lean and breathing pivot naturally and `scale`/`alpha` can shrink +
  soften NPCs.

  Layer order (Graphics has no real z-buffer — draw order IS z-order):
  backpack (behind everything) → legs/shoes → coat → arms/hands →
  handheld (rides the hand) → head → hair/hood/hat (mutually exclusive
  per-slot, hat replaces hair on top rather than stacking) → face
  (eyes, blink-aware) → facial hair → glasses → accessory.
*/

export const CHAR_W   = 22;
export const CHAR_H   = 34;
export const SHADOW_W = 18;
export const SHADOW_H = 7;

/* ─── Direction ─── */
export type Direction = 'down' | 'up' | 'left' | 'right';

/* ─── Shared humanoid pose params (player + NPC + preview) ─── */
export interface HumanoidPose {
  facing: Direction;
  bodyBob: number;
  legStagger: number;
  legLiftL: number;
  legLiftR: number;
  armSwing: number;
  legSwingX?: number;
  headBob?: number;
  rotation?: number;
  breathScale?: number;
  scale?: number;
  alpha?: number;
  /** Fully-resolved appearance (colors + shape ids) — see
   *  CharacterAppearance.ts. Omit for safe hardcoded defaults that
   *  match the game's original pre-creator look. */
  appearance?: ResolvedAppearance;
  /** 0..1 eyelid-closed amount. Treated as a binary open/closed switch
   *  past a small threshold — see the face-details block below. */
  blink?: number;
}

/* ═══════════════════════════════════════════════════════════
   DRAW HUMANOID — shared pixel-art degen renderer.
   ═══════════════════════════════════════════════════════════ */
export function drawHumanoid(g: Phaser.GameObjects.Graphics, x: number, y: number, p: HumanoidPose) {
  const a = p.appearance;
  const scale       = p.scale ?? 1;
  const breathScale = p.breathScale ?? 1;
  const alpha       = p.alpha ?? 1;
  const blink       = p.blink ?? 0;

  const coatColor    = a?.coatColor    ?? 0x1a1c20;
  const coatHighlite = a?.coatHighlite ?? 0x2c2e36;
  const coatShade    = a?.coatShade    ?? 0x101216;
  const accentColor  = a?.accentColor  ?? 0xe8b84b;
  const skinColor    = a?.skinColor    ?? 0xd4a878;
  const hairShape    = a?.hairShape    ?? 'hood';
  const hairColor    = a?.hairColor    ?? 0x171720;
  const facialHair   = a?.facialHair   ?? 'none';
  const facialHairColor = a?.facialHairColor ?? hairColor;
  const hatShape     = a?.hat          ?? 'none';
  const hatColor     = a?.hatColor     ?? 0x171720;
  const glasses      = a?.glasses      ?? 'none';
  const accessoryShape = a?.accessory  ?? 'none';
  const accessoryColor = a?.accessoryColor ?? 0xe8b84b;
  const pantsShape   = a?.pants        ?? 'long';
  const pantsColor   = a?.pantsColor   ?? null;
  const shoesShape   = a?.shoes        ?? 'sneakers';
  const shoesColorIn = a?.shoesColor   ?? 0x0c0c0e;
  const backpackShape = a?.backpack    ?? 'none';
  const backpackColor = a?.backpackColor ?? 0x4a3420;
  const handheld     = a?.handheld     ?? 'none';

  const legSwingX    = p.legSwingX    ?? 0;
  const headBob      = p.headBob      ?? 0;

  const isLeft  = p.facing === 'left';
  const isRight = p.facing === 'right';
  const isBack  = p.facing === 'up';

  const by = -p.bodyBob;   // local vertical offset for bob (up = negative)

  g.clear();

  // ── Backpack ── (drawn first = furthest back; taller than the coat so
  // its edges peek out above the shoulders / below the hem)
  if (backpackShape !== 'none') {
    const bpW = backpackShape === 'hikingPack' ? 12 : 9;
    const bpH = backpackShape === 'hikingPack' ? 22 : 16;
    const bpAnchorY = by - CHAR_H * 0.06;
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-bpW / 2 - 1, bpAnchorY - 6, bpW + 2, bpH + 2, 2);
    g.fillStyle(backpackColor);
    g.fillRoundedRect(-bpW / 2, bpAnchorY - 5, bpW, bpH, 2);
    g.fillStyle(shadeColor(backpackColor, 0.7));
    g.fillRect(-bpW / 2, bpAnchorY - 5, 1.5, bpH);
  }

  // ── Legs + feet ── (wider stance, fore/aft swing so steps actually
  // alternate forward/back instead of just bobbing up and down)
  const legColors = pantsColor !== null
    ? [pantsColor, shadeColor(pantsColor, 0.78)]
    : [0x2a2018, 0x1e1810];
  const shoeColor = shoesColorIn;
  const shoeH = shoesShape === 'boots' ? 6 : shoesShape === 'sandals' ? 2.5 : 4;
  const lx1  = -6;
  const lx2  = 6;
  const legY = by + CHAR_H * 0.30;
  const legH = CHAR_H * 0.28;
  const legH1 = Math.max(4, legH - p.legLiftL);
  const legH2 = Math.max(4, legH - p.legLiftR);

  g.fillStyle(legColors[0]);
  g.fillRoundedRect(lx1 - 3 + legSwingX, legY + p.legStagger, 6, legH1, 1.5);
  g.fillStyle(legColors[1]);
  g.fillRoundedRect(lx2 - 3 - legSwingX, legY - p.legStagger, 6, legH2, 1.5);

  if (pantsShape === 'short') {
    // Shorts: a band of exposed skin partway down the leg, rather than
    // reshaping the leg rects themselves — keeps the walk-cycle math
    // (legH1/legH2/legSwingX) completely untouched.
    g.fillStyle(skinColor, 0.9);
    g.fillRect(lx1 - 3 + legSwingX, legY + p.legStagger + legH1 * 0.4, 6, legH1 * 0.3);
    g.fillRect(lx2 - 3 - legSwingX, legY - p.legStagger + legH2 * 0.4, 6, legH2 * 0.3);
  }

  // Shoes — small distinct blocks at each foot, clearer than a tint strip
  g.fillStyle(shoeColor);
  g.fillRoundedRect(lx1 - 4 + legSwingX, legY + legH1 - shoeH * 0.6 + p.legStagger, 8, shoeH, 1.5);
  g.fillRoundedRect(lx2 - 4 - legSwingX, legY + legH2 - shoeH * 0.6 - p.legStagger, 8, shoeH, 1.5);
  g.fillStyle(0x4a3a24, 0.55);
  g.fillRect(lx1 - 3 + legSwingX, legY + legH1 - 1.5 + p.legStagger, 6, 1.5);
  g.fillRect(lx2 - 3 - legSwingX, legY + legH2 - 1.5 - p.legStagger, 6, 1.5);

  // ── Coat / hoodie ── (tapered waist instead of one flat box, a bit
  // less boxy/robotic)
  const bodyY = by - CHAR_H * 0.06;
  const bodyW = CHAR_W;
  const bodyH = CHAR_H * 0.40;

  g.fillStyle(0x05060a, 0.55);
  g.fillRoundedRect(-bodyW / 2 - 1, bodyY - 1, bodyW + 2, bodyH + 2, 5);

  g.fillStyle(coatColor);
  g.fillRoundedRect(-bodyW / 2, bodyY, bodyW, bodyH * 0.65, 4);
  g.fillRoundedRect(-bodyW / 2 + 1.5, bodyY + bodyH * 0.55, bodyW - 3, bodyH * 0.45, 4);

  g.fillStyle(coatShade, 0.55);
  g.fillRect(bodyW / 2 - 3, bodyY + 2, 3, bodyH - 4);
  g.fillStyle(coatHighlite, 0.6);
  g.fillRect(-bodyW / 2,     bodyY + 2, 2, bodyH - 4);

  if (!isBack) {
    // Collar + zipper — the per-variant accent color (gold by default)
    g.fillStyle(accentColor, 0.95);
    g.fillRoundedRect(-3, bodyY + 1, 6, 3, 1);
    g.fillRect(-1, bodyY + bodyH * 0.32, 2, bodyH * 0.55);
  } else {
    // From behind: a thin accent stripe across the shoulders instead
    g.fillStyle(accentColor, 0.55);
    g.fillRect(-bodyW / 2 + 2, bodyY + 2, bodyW - 4, 1.5);
  }

  // ── Arms + hands ──
  const armColor = 0x14161c;
  const armY = bodyY + 2;
  const armH = CHAR_H * 0.27;

  g.fillStyle(armColor);
  g.fillRoundedRect(-bodyW / 2 - 4, armY + p.armSwing,  4, armH, 2);
  g.fillRoundedRect( bodyW / 2,     armY - p.armSwing,  4, armH, 2);
  g.fillStyle(skinColor, 0.95);
  g.fillCircle(-bodyW / 2 - 2, armY + p.armSwing + armH, 2);
  g.fillCircle( bodyW / 2 + 2, armY - p.armSwing + armH, 2);

  // ── Handheld item ── (rides the right hand; simple, stable attach
  // point rather than picking the "non-swinging" hand per frame)
  if (!isBack && handheld !== 'none') {
    const handX = bodyW / 2 + 2;
    const handY = armY - p.armSwing + armH;
    if (handheld === 'phone') {
      g.fillStyle(0x111418);
      g.fillRoundedRect(handX - 1, handY - 3, 2.5, 4, 0.5);
    } else if (handheld === 'coffeeCup') {
      g.fillStyle(0xe8d8c0);
      g.fillRoundedRect(handX - 1.5, handY - 2.5, 3, 3.5, 0.8);
      g.fillStyle(0x6a4a2a);
      g.fillRect(handX - 1, handY - 2, 2, 1);
    } else if (handheld === 'briefcase') {
      g.fillStyle(0x2a2018);
      g.fillRoundedRect(handX - 2, handY, 4, 3, 0.5);
      g.fillStyle(accentColor, 0.8);
      g.fillRect(handX - 0.5, handY, 1, 1);
    }
  }

  // ── Head ── (bigger and rounder so it reads clearly at small scale)
  const headColor = isBack ? 0x1a1c20 : skinColor;
  const headY  = by - CHAR_H * 0.50 + headBob;
  const headW  = CHAR_W - 2;
  const headH  = CHAR_H * 0.32;
  const lookOX = isLeft ? -2.2 : isRight ? 2.2 : 0;

  g.fillStyle(0x05060a, 0.55);
  g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY - 5, headW + 4, headH + 9, 5);

  g.fillStyle(headColor);
  g.fillRoundedRect(-headW / 2 + lookOX, headY, headW, headH, 5);

  // ── Hair / Hood / Hat ── (mutually exclusive — a hat replaces
  // whatever the hairstyle would draw on top, since Graphics has no
  // real z-buffer and stacking the two looks broken rather than additive)
  if (hatShape !== 'none') {
    if (hatShape === 'beanie') {
      g.fillStyle(hatColor);
      g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 6, headW + 2, 8, 4);
    } else if (hatShape === 'cap') {
      g.fillStyle(hatColor);
      g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 5, headW + 2, 6, 3);
      g.fillStyle(shadeColor(hatColor, 0.75));
      g.fillRect((isLeft ? -headW / 2 - 4 : headW / 2 - 2) + lookOX, headY - 2, 4, 1.5);
    } else if (hatShape === 'topHat') {
      g.fillStyle(hatColor);
      g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY - 4, headW + 4, 2, 1);
      g.fillRoundedRect(-headW / 2 + 2 + lookOX, headY - 12, headW - 4, 9, 1);
    }
  } else if (hairShape === 'hood') {
    g.fillStyle(hairColor);
    g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 5, headW + 2, 9, 4);
    g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY,     4, headH * 0.75, 2);
    g.fillRoundedRect( headW / 2 - 2 + lookOX, headY,     4, headH * 0.75, 2);

    // Drawstring tips — per-variant accent color
    g.fillStyle(accentColor, 0.9);
    g.fillCircle(-headW / 2 + lookOX, headY + headH * 0.68, 1.3);
    g.fillCircle( headW / 2 + lookOX, headY + headH * 0.68, 1.3);
  } else if (hairShape === 'short') {
    g.fillStyle(hairColor);
    g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 4, headW + 2, 6, 3);
  } else if (hairShape === 'long') {
    g.fillStyle(hairColor);
    g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 4, headW + 2, 6, 3);
    g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY + 1, 3, headH * 1.1, 1.5);
    g.fillRoundedRect( headW / 2 - 1 + lookOX, headY + 1, 3, headH * 1.1, 1.5);
  } else if (hairShape === 'mohawk') {
    g.fillStyle(hairColor);
    g.fillRoundedRect(-1.5 + lookOX, headY - 7, 3, 8, 1);
  }
  // 'bald' → nothing extra; the bare head silhouette above is the look.

  // ── Face details (front/side only — back view stays a plain head) ──
  if (!isBack) {
    const eyeY  = headY + headH * 0.4;
    const eyeOX = lookOX * 1.3;

    if (blink > 0.6) {
      // Closed-eye line — simpler and more legible at this pixel scale
      // than interpolating the open-eye geometry's height.
      g.fillStyle(0x0a0a0a, 0.85);
      g.fillRect(-4.8 + eyeOX, eyeY + 1, 2.8, 0.8);
      g.fillRect( 1.7 + eyeOX, eyeY + 1, 2.8, 0.8);
    } else {
      g.fillStyle(0x0a0a0a);
      g.fillRect(-4.5 + eyeOX, eyeY, 2.5, 2.5);
      g.fillRect( 2 + eyeOX,   eyeY, 2.5, 2.5);

      g.fillStyle(0x0a2030, 0.92);
      g.fillRoundedRect(-5.5 + eyeOX, eyeY - 1, 6, 3.5, 1);
      g.fillRoundedRect( 0.5 + eyeOX, eyeY - 1, 6, 3.5, 1);
      g.fillStyle(0x303030);
      g.fillRect(-0.5 + eyeOX, eyeY + 0.5, 2, 1.5);
    }

    // ── Facial hair ──
    if (facialHair !== 'none') {
      g.fillStyle(facialHairColor, 0.9);
      if (facialHair === 'stubble') {
        g.fillRect(-3 + eyeOX, eyeY + 4, 6, 1.5);
      } else if (facialHair === 'beard') {
        g.fillRoundedRect(-3.5 + eyeOX, eyeY + 3.5, 7, 4, 1);
      } else if (facialHair === 'mustache') {
        g.fillRect(-2.5 + eyeOX, eyeY + 3, 5, 1.3);
      }
    }

    // ── Glasses ──
    if (glasses === 'shades') {
      g.fillStyle(0x0a0a0a, 0.95);
      g.fillRoundedRect(-5.5 + eyeOX, eyeY - 1, 11, 3.5, 1);
    } else if (glasses === 'round') {
      g.lineStyle(1, 0x0a0a0a, 0.9);
      g.strokeCircle(-3.2 + eyeOX, eyeY + 1.2, 2.2);
      g.strokeCircle( 3.2 + eyeOX, eyeY + 1.2, 2.2);
      g.lineBetween(-1 + eyeOX, eyeY + 1.2, 1 + eyeOX, eyeY + 1.2);
    }

    // ── Accessory ──
    if (accessoryShape === 'chain') {
      g.fillStyle(accessoryColor, 0.95);
      g.fillCircle(-1.5, bodyY + bodyH * 0.18, 1);
      g.fillCircle(0, bodyY + bodyH * 0.24, 1);
      g.fillCircle(1.5, bodyY + bodyH * 0.18, 1);
    } else if (accessoryShape === 'earring' && (isLeft || isRight)) {
      g.fillStyle(accessoryColor, 0.95);
      g.fillCircle((isLeft ? -headW / 2 - 1 : headW / 2 + 1) + lookOX, headY + headH * 0.55, 1);
    } else if (accessoryShape === 'scarf') {
      g.fillStyle(accessoryColor, 0.9);
      g.fillRoundedRect(-headW / 2 + lookOX, bodyY - 1, headW, 3, 1);
    }
  }

  g.setPosition(x, y);
  g.setRotation(p.rotation ?? 0);
  g.setScale(scale, scale * breathScale);
  g.setAlpha(alpha);
}
