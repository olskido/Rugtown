import Phaser from 'phaser';
import { queueCharacterBitmapLoads, queueCreatorCosmeticLoads } from '../characters/assets/CharacterAssetLoader';
import { hydrateCharacterRegistryFromScene, assetExists } from '../characters/assets/CharacterAssetRegistry';
import { BitmapCharacter } from '../characters/render/BitmapCharacter';
import type { CharacterAppearanceV1 } from '../characters/appearance/CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance } from '../characters/appearance/CharacterAppearanceDefaults';
import { normalizeCharacterAppearance } from '../characters/appearance/CharacterAppearanceCodec';
import type { Direction } from '../characters/animation/CharacterDirection';

/** Preview body occupies this fraction of the canvas height (hats/hair get margin). */
const PREVIEW_HEIGHT_FRAC = 0.74;
const PREVIEW_BOTTOM_PAD_FRAC = 0.06;

/**
 * CharacterPreviewScene — bitmap-only creator / HUD portrait preview.
 * Auto-fits and centers the composed character; never invents frames.
 */
export class CharacterPreviewScene extends Phaser.Scene {
  private bitmap: BitmapCharacter | null = null;
  private appearance: CharacterAppearanceV1 = getDefaultCharacterAppearance();
  private pending: CharacterAppearanceV1 | null = null;
  private facing: Direction = 'down';
  private fitPending = false;

  constructor() {
    super({ key: 'CharacterPreviewScene' });
  }

  preload(): void {
    queueCharacterBitmapLoads(this);
    queueCreatorCosmeticLoads(this);
  }

  create(): void {
    hydrateCharacterRegistryFromScene(this);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.bitmap = new BitmapCharacter(this, this.pending ?? this.appearance, {
      depth: 10,
      visualScale: 1,
      hideShadow: true,
    });
    if (this.pending) {
      this.appearance = this.pending;
      this.pending = null;
    }
    this.bitmap.setFacing(this.facing);
    this.scale.on('resize', () => this.fitPreview());
    this.fitPreview();
  }

  setAppearance(appearance: CharacterAppearanceV1): void {
    const next = normalizeCharacterAppearance(appearance, assetExists);
    this.appearance = next;
    if (this.bitmap) {
      this.bitmap.setAppearance(next);
      this.bitmap.setFacing(this.facing);
      this.fitPreview();
    } else {
      this.pending = next;
    }
  }

  setFacing(dir: Direction): void {
    this.facing = dir;
    this.bitmap?.setFacing(dir);
  }

  update(_t: number, dt: number): void {
    this.bitmap?.update(dt, 0, 0, false);
    if (this.fitPending) {
      this.fitPending = false;
      this.fitPreview();
    }
  }

  /**
   * Scale + center so the composed character fills ~74% of preview height,
   * stays horizontally centered, and leaves pad for hats / hair.
   */
  private fitPreview(): void {
    if (!this.bitmap) return;
    const { width, height } = this.scale;
    if (width < 8 || height < 8) return;

    // Fit from the known foot-to-head mannequin height, never transparent
    // atlas bounds. Hats get their own top reserve above the 65–80% figure.
    const desiredBodyHeight = Phaser.Math.Clamp(height * PREVIEW_HEIGHT_FRAC, height * 0.65, height * 0.8);
    const rootScale = desiredBodyHeight / Math.max(1, this.bitmap.getBodyDisplayHeight());
    this.bitmap.setRootScale(rootScale);
    this.bitmap.setPosition(width / 2, height * (1 - PREVIEW_BOTTOM_PAD_FRAC));
  }
}
