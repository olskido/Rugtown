/**
 * Lightweight animation state helper for non-Phaser consumers.
 * Walk bob is owned by BitmapCharacter.update().
 */

import type { Direction } from './animation/CharacterDirection';
import { nearestCardinal } from './animation/CharacterDirection';
import type { CharacterAnimState } from './CharacterStates';

export type { CharacterAnimState } from './CharacterStates';

export class CharacterAnimationController {
  private state: CharacterAnimState = 'idle';
  private facing: Direction = 'down';

  getState(): CharacterAnimState { return this.state; }
  getFacing(): Direction { return this.facing; }

  update(_dtMs: number, velocityX: number, velocityY: number, moving: boolean): void {
    if (moving) {
      this.facing = nearestCardinal(velocityX, velocityY);
      this.state = 'walk';
    } else if (this.state === 'walk') {
      this.state = 'idle';
    }
  }

  setEmote(): void { this.state = 'emote'; }
  clearSpecial(): void { this.state = 'idle'; }
}
