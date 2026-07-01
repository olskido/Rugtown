import Phaser from 'phaser';
import { CharacterPreviewScene } from './scenes/CharacterPreviewScene';
import type { CharacterAppearance } from './world/CharacterAppearance';

/*
  CharacterPreviewGame.ts
  ────────────────────────
  Minimal sibling of RugTownGame.ts — mounts a single
  CharacterPreviewScene into a DOM element for the character creator's
  live-preview pane. Keeps the same mount/destroy lifecycle shape
  (RugTownGame.ts's pattern, minus everything that's only relevant to
  the full game world: no NPCs, no events, no collision, no camera
  follow, no interaction zones).

  Push appearance updates via setAppearance() without remounting the
  Phaser.Game — this avoids flicker and prevents the StrictMode
  double-mount bug class (mount once, update imperatively, destroy on
  cleanup).
*/

export interface CharacterPreviewConfig {
  /** DOM element id to mount the preview canvas inside. */
  parentId: string;
  /** Initial appearance — safe to change later via setAppearance(). */
  initialAppearance: CharacterAppearance;
  /** Called once when the preview scene is fully ready to render. */
  onReady?: () => void;
  /** Lower update rate for small HUD embeds so the main game stays smooth. */
  lowPower?: boolean;
}

export class CharacterPreviewGame {
  private game: Phaser.Game;
  private previewScene: CharacterPreviewScene;

  constructor(config: CharacterPreviewConfig) {
    this.previewScene = new CharacterPreviewScene();

    // Apply initial appearance before the scene's create() runs.
    this.previewScene.setAppearance(config.initialAppearance);

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: config.parentId,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0)',
      transparent: true,
      antialias: false,
      pixelArt: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [this.previewScene],
      // Throttle HUD-sized previews — full rate in the outfit creator.
      ...(config.lowPower
        ? { fps: { target: 12, forceSetTimeOut: true } }
        : {}),
    });

    if (config.onReady) {
      this.game.events.once('ready', config.onReady);
    }
  }

  /** Update the displayed appearance without remounting the Phaser.Game.
   *  Call this from a React effect on every appearance state change. */
  setAppearance(appearance: CharacterAppearance) {
    this.previewScene.setAppearance(appearance);
  }

  /** Call on React component cleanup to release WebGL context and DOM. */
  destroy() {
    this.game.destroy(true, false);
  }
}
