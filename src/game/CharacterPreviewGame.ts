import Phaser from 'phaser';
import { CharacterPreviewScene } from './scenes/CharacterPreviewScene';
import type { CharacterAppearanceV1 } from './characters/appearance/CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance } from './characters/appearance/CharacterAppearanceDefaults';
import type { Direction } from './characters/animation/CharacterDirection';

export class CharacterPreviewGame {
  private game: Phaser.Game;
  private previewScene: CharacterPreviewScene;

  constructor(parent: string | HTMLElement, initial?: CharacterAppearanceV1) {
    this.previewScene = new CharacterPreviewScene();
    this.previewScene.setAppearance(initial ?? getDefaultCharacterAppearance());

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0)',
      transparent: true,
      antialias: false,
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [this.previewScene],
    });
  }

  setAppearance(appearance: CharacterAppearanceV1): void {
    this.previewScene.setAppearance(appearance);
  }

  setFacing(dir: Direction): void {
    this.previewScene.setFacing(dir);
  }

  destroy(): void {
    this.game.destroy(true, false);
  }
}
