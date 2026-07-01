import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import type { CharacterAppearance } from './world/CharacterAppearance';

/*
  RugTownGame.ts
  ──────────────
  Creates and manages the Phaser.Game instance.
  Designed to be instantiated by GamePage.tsx and destroyed on unmount.

  - Single scene: WorldScene
  - Transparent background so React HUD overlays can sit on top
  - RESIZE scale mode so canvas fills its container
  - Physics OFF for now (world view only)
*/

export interface RugTownGameConfig {
  /** DOM element ID to mount the canvas inside */
  parentId: string;
  /** Modular appearance chosen on the pre-game character-creator screen
   *  (see src/game/world/CharacterAppearance.ts). */
  appearance?: CharacterAppearance;
  /** Called when the scene is ready */
  onReady?: (scene: WorldScene) => void;
}

export class RugTownGame {
  private game: Phaser.Game;
  private worldScene: WorldScene;

  constructor(config: RugTownGameConfig) {
    this.worldScene = new WorldScene();

    // Set before the scene's create() ever runs, so the player's first
    // draw already uses the chosen appearance.
    if (config.appearance) this.worldScene.setAppearance(config.appearance);

    this.game = new Phaser.Game({
      type: Phaser.AUTO,            // WebGL with Canvas fallback
      parent: config.parentId,      // Mount inside this DOM element

      // Fill the parent container — GamePage controls sizing via CSS
      width:  '100%',
      height: '100%',

      // Transparent so any React elements layered behind show through
      backgroundColor: '#050c10',

      // Canvas anti-aliasing off for pixel art sharpness
      // (won't matter for the photo-style reference, but good default)
      antialias: false,
      pixelArt: false,

      // Resize to parent
      scale: {
        mode:       Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },

      scene: [this.worldScene],

      // No physics for world view
      physics: {
        default: 'arcade',
        arcade:  { debug: false, gravity: { x: 0, y: 0 } },
      },

      // Performance: don't pause when tab is hidden
      autoFocus: true,
      disableContextMenu: true,
    });

    // Notify consumer when scene is ready
    if (config.onReady) {
      this.game.events.once('ready', () => {
        config.onReady!(this.worldScene);
      });
    }
  }

  /** Access the world scene directly */
  getWorldScene(): WorldScene {
    return this.worldScene;
  }

  /** Clean up — call on React component unmount */
  destroy() {
    this.game.destroy(true, false);
  }

  /** Resize canvas to match container — called on window resize */
  resize() {
    // Phaser RESIZE mode handles this automatically,
    // but this hook is here if manual override is needed.
    this.game.scale.refresh();
  }
}
