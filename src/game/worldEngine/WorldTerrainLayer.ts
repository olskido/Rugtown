/**
 * WorldTerrainLayer.ts
 * ────────────────────
 * Phase 10A — loads main_rugtown.png as the single baked world background.
 * Depth 0, origin (0,0). Aspect preserved via WorldMapScale (uniform scale).
 */

import Phaser from 'phaser';

export const TERRAIN_ART_ENABLED = true;

export const TERRAIN_TEXTURE_KEY = 'rugtown-main';
export const TERRAIN_IMAGE_URL = '/assets/world/main_rugtown.png';
export const TERRAIN_DEPTH = 0;

export class WorldTerrainLayer {
  private static sprite: Phaser.GameObjects.Image | null = null;

  static preloadScene(scene: Phaser.Scene): void {
    if (!TERRAIN_ART_ENABLED) return;
    scene.load.image(TERRAIN_TEXTURE_KEY, TERRAIN_IMAGE_URL);
  }

  static generate(scene: Phaser.Scene, worldW: number, worldH: number): Phaser.GameObjects.Image | null {
    if (!TERRAIN_ART_ENABLED) return null;

    if (!scene.textures.exists(TERRAIN_TEXTURE_KEY)) {
      console.warn('[WorldTerrainLayer] Terrain texture missing:', TERRAIN_IMAGE_URL);
      return null;
    }

    if (this.sprite?.scene === scene) {
      this.sprite.destroy();
    }

    const tex = scene.textures.get(TERRAIN_TEXTURE_KEY);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const tw = 'naturalWidth' in src ? src.naturalWidth : tex.source[0].width;
    const th = 'naturalHeight' in src ? src.naturalHeight : tex.source[0].height;

    this.sprite = scene.add
      .image(0, 0, TERRAIN_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDepth(TERRAIN_DEPTH);

    if (tw !== worldW || th !== worldH) {
      // Uniform display size — callers must pass aspect-correct worldW/H.
      this.sprite.setDisplaySize(worldW, worldH);
    }

    return this.sprite;
  }
}
