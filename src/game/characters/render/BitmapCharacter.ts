/**
 * BitmapCharacter — Phaser Container composed from atlas frames / base images.
 * Static frames; left facing uses flipX only; walk bob moves a content group
 * (never overwrites per-layer local Y).
 */

import Phaser from 'phaser';
import type { CharacterAppearanceV1 } from '../appearance/CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance } from '../appearance/CharacterAppearanceDefaults';
import { normalizeCharacterAppearance } from '../appearance/CharacterAppearanceCodec';
import { assetExists, getAssetById } from '../assets/CharacterAssetRegistry';
import { logMissingOnce } from '../assets/CharacterAssetLoader';
import { charPerfMark, charPerfMeasure } from '../dev/CharacterPerfMarks';
import type { Direction } from '../animation/CharacterDirection';
import { nearestCardinal } from '../animation/CharacterDirection';
import { SHADOW_H, SHADOW_W, TARGET_DISPLAY_HEIGHT } from './CharacterVisualScale';
import {
  getPlacementForSlot,
  stackOrderForKey,
  type VisibleBoundsHint,
} from './BitmapCharacterLayout';
import type { RuntimeAssetEntry } from '../assets/CharacterAssetRegistry';

type LayerSprite = Phaser.GameObjects.Image;

/** Phase 11C — pulls the real measured visible-bounds fields (written by
 *  scripts/analyze-character-asset-bounds.mjs via the install script) off
 *  a manifest asset entry, if present. */
function assetBoundsHint(asset: RuntimeAssetEntry | undefined): VisibleBoundsHint | undefined {
  if (!asset || asset.visibleWidth == null || asset.visibleHeight == null) return undefined;
  return {
    visibleWidth: asset.visibleWidth,
    visibleHeight: asset.visibleHeight,
    offsetXFrac: asset.offsetXFrac,
    offsetYFrac: asset.offsetYFrac,
  };
}

export interface BitmapCharacterOptions {
  depth: number;
  visualScale?: number;
  alpha?: number;
  tint?: number;
  /** When true, skip ground shadow (HUD / creator preview). */
  hideShadow?: boolean;
}

export class BitmapCharacter {
  private static rebuildCount = 0;
  readonly root: Phaser.GameObjects.Container;
  /** Layers + bob live here so local layer Y is never clobbered by walk bob. */
  private readonly content: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Graphics;
  private layers = new Map<string, LayerSprite>();
  private layerIds = new Map<string, string>();
  private appearance: CharacterAppearanceV1;
  private facing: Direction = 'down';
  private moving = false;
  private animTick = 0;
  private readonly visualScale: number;
  private readonly baseAlpha: number;
  private readonly hideShadow: boolean;
  private destroyed = false;
  private bodyDisplayHeight = TARGET_DISPLAY_HEIGHT;

  constructor(
    private readonly scene: Phaser.Scene,
    appearance: CharacterAppearanceV1 | null,
    opts: BitmapCharacterOptions,
  ) {
    this.visualScale = opts.visualScale ?? 1;
    this.baseAlpha = opts.alpha ?? 1;
    this.hideShadow = opts.hideShadow ?? false;
    this.appearance = normalizeCharacterAppearance(appearance ?? getDefaultCharacterAppearance(), assetExists);
    this.root = scene.add.container(0, 0).setDepth(opts.depth);
    this.shadow = scene.add.graphics();
    this.content = scene.add.container(0, 0);
    this.root.add(this.shadow);
    this.root.add(this.content);
    this.rebuild();
  }

  getAppearance(): CharacterAppearanceV1 {
    return this.appearance;
  }

  /** Foot-plant world height of the composed body (pre root scale). */
  getBodyDisplayHeight(): number {
    return this.bodyDisplayHeight;
  }

  /** Axis-aligned bounds of layered content in world space. */
  getContentBounds(): Phaser.Geom.Rectangle {
    return this.content.getBounds();
  }

  setAppearance(next: CharacterAppearanceV1): void {
    this.applyAppearance(next);
  }

  /** Updates only changed cosmetic layers; creator sliders avoid full rebuilds. */
  applyAppearance(next: Partial<CharacterAppearanceV1>, options: { partial?: boolean } = {}): void {
    const candidate = options.partial ? { ...this.appearance, ...next } : next;
    const normalized = normalizeCharacterAppearance(candidate, assetExists);
    const previous = this.slotIds(this.appearance);
    const following = this.slotIds(normalized);
    this.appearance = normalized;
    for (const key of new Set([...previous.keys(), ...following.keys()])) {
      if (previous.get(key) === following.get(key)) continue;
      this.removeLayer(key);
      const id = following.get(key);
      if (id) this.addLayer(key, id);
    }
    this.relayoutLayers();
    this.applyFlip();
    this.content.sort('depth');
  }

  setFacing(dir: Direction): void {
    this.facing = dir;
    this.applyFlip();
  }

  setMoving(moving: boolean): void {
    this.moving = moving;
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  setDepth(depth: number): void {
    this.root.setDepth(depth);
  }

  setAlpha(a: number): void {
    this.root.setAlpha(a * this.baseAlpha);
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }

  /** Extra uniform scale on the root (preview autofit). Does not change layer locals. */
  setRootScale(s: number): void {
    this.root.setScale(s);
  }

  /** The root position is the planted feet point. */
  getFootLocalPoint(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(0, 0);
  }

  update(dtMs: number, vx = 0, vy = 0, moving?: boolean): void {
    if (this.destroyed) return;
    this.animTick += dtMs;
    if (moving != null) this.moving = moving;
    if (this.moving) this.facing = nearestCardinal(vx, vy);
    this.applyFlip();
    const t = this.animTick / 1000;
    const bob = this.moving ? Math.abs(Math.sin(t * 10)) * 1.8 : Math.sin(t * 1.7) * 0.5;
    // Bob the content group only — preserve per-layer localY.
    this.content.y = -bob;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.destroy(true);
  }

  private rebuild(): void {
    const perfId = ++BitmapCharacter.rebuildCount;
    const perfStart = `BitmapCharacter.rebuild.${perfId}.start`;
    const perfEnd = `BitmapCharacter.rebuild.${perfId}.end`;
    charPerfMark(perfStart);
    for (const [, spr] of this.layers) spr.destroy();
    this.layers.clear();
    this.layerIds.clear();
    this.shadow.clear();
    this.content.removeAll(false);

    this.bodyDisplayHeight = TARGET_DISPLAY_HEIGHT * this.visualScale;
    for (const [key, id] of this.slotIds(this.appearance)) this.addLayer(key, id);

    if (!this.layers.has('base')) this.addBaseFallback();

    // Re-place overlays now that bodyDisplayHeight is known from the base sprite.
    this.relayoutLayers();

    if (!this.hideShadow) {
      this.shadow.fillStyle(0x000000, 0.28);
      this.shadow.fillEllipse(0, 2, SHADOW_W * this.visualScale * 1.1, SHADOW_H * this.visualScale);
      this.shadow.fillStyle(0x000000, 0.14);
      this.shadow.fillEllipse(0, 2, SHADOW_W * this.visualScale * 1.6, SHADOW_H * this.visualScale * 1.3);
    }

    this.content.y = 0;
    this.applyFlip();
    this.root.setAlpha(this.baseAlpha);
    // Stable list order = stack order (Phaser containers draw in child order).
    this.content.sort('depth');
    charPerfMark(perfEnd);
    charPerfMeasure(`BitmapCharacter.rebuild.${perfId}`, perfStart, perfEnd);
  }

  private relayoutLayers(): void {
    const base = this.layers.get('base');
    if (base) this.bodyDisplayHeight = base.displayHeight || this.bodyDisplayHeight;
    for (const [key, spr] of this.layers) {
      const asset = getAssetById(this.layerIds.get(key) ?? '');
      const placement = getPlacementForSlot(key, this.bodyDisplayHeight, spr.height, spr.width, assetBoundsHint(asset));
      // Optional per-asset scale only. The OLD manifest offsetX/Y (foot-
      // relative, provisional) is still intentionally ignored — Phase 11C
      // uses the new offsetXFrac/offsetYFrac + visibleWidth/Height fields
      // instead, which are real measured visible-content bounds, not the
      // old provisional foot offsets that fought head-center placement.
      const extra = asset?.scale && asset.scale > 0 ? asset.scale : 1;
      spr.setOrigin(placement.originX, placement.originY);
      spr.setPosition(placement.x, placement.y);
      spr.setScale(placement.scale * extra);
      spr.setDepth(stackOrderForKey(key));
      spr.setRotation(0);
      spr.setFlipY(false);
    }
  }

  private addBaseFallback(): void {
    const id = getDefaultCharacterAppearance().baseId;
    const asset = getAssetById(id);
    if (asset) {
      const spr = this.makeSprite(asset, 'base');
      if (spr) {
        this.content.add(spr);
        this.layers.set('base', spr);
        this.layerIds.set('base', id);
        return;
      }
    }
    const key = 'char-base-base_skin_light';
    if (this.scene.textures.exists(key)) {
      const spr = this.scene.add.image(0, 0, key);
      this.configureLayerSprite(spr, 'base');
      this.content.add(spr);
      this.layers.set('base', spr);
      this.layerIds.set('base', 'base_skin_light');
    } else {
      logMissingOnce('base', 'no bitmap base texture available');
    }
  }

  private makeSprite(asset: NonNullable<ReturnType<typeof getAssetById>>, slotKey: string): LayerSprite | null {
    let spr: LayerSprite | null = null;
    if (asset.atlasKey && asset.textureKey && asset.frame) {
      if (!this.scene.textures.exists(asset.textureKey)) {
        logMissingOnce(asset.textureKey, `atlas not loaded ${asset.textureKey}`);
        return null;
      }
      spr = this.scene.add.image(0, 0, asset.textureKey, asset.frame);
    } else if (asset.textureKey) {
      if (!this.scene.textures.exists(asset.textureKey)) {
        logMissingOnce(asset.textureKey, `texture not loaded ${asset.textureKey}`);
        return null;
      }
      spr = this.scene.add.image(0, 0, asset.textureKey);
    }
    if (!spr) return null;
    this.configureLayerSprite(spr, slotKey, asset);
    return spr;
  }

  private configureLayerSprite(spr: LayerSprite, slotKey: string, asset?: ReturnType<typeof getAssetById>): void {
    const placement = getPlacementForSlot(slotKey, this.bodyDisplayHeight, spr.height, spr.width, assetBoundsHint(asset));
    spr.setOrigin(placement.originX, placement.originY);
    spr.setRotation(0);
    spr.setFlipX(false);
    spr.setFlipY(false);
    spr.setPosition(placement.x, placement.y);
    spr.setScale(placement.scale);
    spr.setDepth(placement.depth);
  }

  private slotIds(appearance: CharacterAppearanceV1): Map<string, string> {
    const slots = new Map<string, string>();
    const fixed: [string, string | null][] = [
      ['base', appearance.baseId], ['outfit', appearance.outfitId],
      ['pants', appearance.pantsId], ['shoes', appearance.shoesId],
      ['hair', appearance.hairId], ['facial', appearance.facialHairId], ['hat', appearance.headwearId],
    ];
    for (const [key, id] of fixed) if (id) slots.set(key, id);
    appearance.accessoryIds.forEach((id, index) => slots.set(`acc${index}`, id));
    return slots;
  }

  private removeLayer(key: string): void {
    this.layers.get(key)?.destroy();
    this.layers.delete(key);
    this.layerIds.delete(key);
  }

  private addLayer(key: string, id: string): void {
    const asset = getAssetById(id);
    if (!asset) {
      if (key === 'base') this.addBaseFallback();
      else logMissingOnce(id, `missing asset ${id}`);
      return;
    }
    const spr = this.makeSprite(asset, key);
    if (!spr) {
      if (key === 'base') this.addBaseFallback();
      return;
    }
    this.content.add(spr);
    this.layers.set(key, spr);
    this.layerIds.set(key, id);
    if (key === 'base' || asset.category === 'npcs') {
      this.bodyDisplayHeight = spr.displayHeight;
    }
  }

  /**
   * Facing policy: always keep the body visible.
   * Left uses flipX. Cosmetics that are mirror-unsafe may hide, but the
   * base/NPC body NEVER hides — that was causing full character vanish
   * when walking left (mirrorSafe:false on many atlas frames).
   */
  private applyFlip(): void {
    const mirrorFacing = this.facing === 'left';
    for (const [key, spr] of this.layers) {
      spr.setFlipY(false);
      spr.setRotation(0);
      const asset = getAssetById(this.layerIds.get(key) ?? '');
      const isBody = key === 'base' || asset?.category === 'npcs' || asset?.category === 'base';

      if (!mirrorFacing) {
        spr.setFlipX(false);
        spr.setVisible(true);
        continue;
      }

      // Body always mirrors and stays visible.
      if (isBody) {
        spr.setFlipX(true);
        spr.setVisible(true);
        continue;
      }

      const mirrorSafe = asset?.mirrorSafe !== false;
      if (mirrorSafe) {
        spr.setFlipX(true);
        spr.setVisible(true);
      } else {
        spr.setFlipX(false);
        spr.setVisible(false);
      }
    }
  }
}

/** Deterministic NPC complete-body appearance from stable id. */
export function npcAppearanceFromId(npcKey: string, bodies: { id: string }[]): CharacterAppearanceV1 {
  const def = getDefaultCharacterAppearance();
  if (!bodies.length) return def;
  let h = 2166136261;
  for (let i = 0; i < npcKey.length; i++) {
    h ^= npcKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const body = bodies[(h >>> 0) % bodies.length];
  return {
    version: 1,
    baseId: body.id,
    hairId: null,
    facialHairId: null,
    headwearId: null,
    outfitId: null,
    pantsId: null,
    shoesId: null,
    accessoryIds: [],
  };
}
