/**
 * InteractionSystem.ts
 * ────────────────────
 * Manages every interaction zone in the city (landmark triggers) and
 * the per-frame proximity/E-key detection that fires them.
 *
 * Stays Phaser-aware only for the registry writes (nearZone) and event
 * emission (zone-interact). All geometry is pure math.
 *
 * Usage in WorldScene:
 *   this.interaction = new InteractionSystem(this);
 *   this.interaction.init(worldW, worldH);
 *   // in update():
 *   this.interaction.update(this.px, this.py, consumeInteract);
 */

import { getLiveWorldObjects, toWorldPosition } from '../world/WorldObjects';

/** A resolved, pixel-space interaction zone (built from WorldObject data). */
export interface ActiveZone {
  id:     string;
  name:   string;
  wx:     number;
  wy:     number;
  radius: number;
}

export class InteractionSystem {
  private scene: Phaser.Scene;
  private zones: ActiveZone[] = [];
  private _nearZoneId: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Build zones from the live WorldObjects registry.  Call once after
   *  worldW/worldH are known (i.e. inside WorldScene.create()). */
  init(worldW: number, worldH: number): void {
    this.zones = getLiveWorldObjects().map(o => {
      const { wx, wy } = toWorldPosition(o, worldW, worldH);
      return { id: o.id, name: o.displayName, wx, wy, radius: o.interactionRadius };
    });
  }

  /** Call every frame from WorldScene.update().
   *  `consumeInteract` should return true (and reset the E-key/tap flag) when
   *  the player just pressed the interact button — same single-consume contract
   *  as Phaser's JustDown. The method writes the nearZone to the Phaser
   *  registry and emits 'zone-interact' on the scene's event bus when fired. */
  update(
    px: number,
    py: number,
    consumeInteract: () => boolean,
  ): void {
    let nearest: ActiveZone | null = null;
    let nearestDist = Infinity;

    for (const z of this.zones) {
      const dx = px - z.wx;
      const dy = py - z.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= z.radius && dist < nearestDist) {
        nearest = z;
        nearestDist = dist;
      }
    }

    const nearestId = nearest?.id ?? null;
    if (nearestId !== this._nearZoneId) {
      this._nearZoneId = nearestId;
      this.scene.registry.set(
        'nearZone',
        nearest ? { id: nearest.id, name: nearest.name } : null,
      );
    }

    if (nearest && consumeInteract()) {
      this.scene.events.emit('zone-interact', { id: nearest.id, name: nearest.name });
    }
  }

  /** The zone id the player is currently standing in, or null. */
  get nearZoneId(): string | null {
    return this._nearZoneId;
  }

  /** Full zone data for the zone the player is inside, or null. */
  get nearZone(): ActiveZone | null {
    return this._nearZoneId
      ? (this.zones.find(z => z.id === this._nearZoneId) ?? null)
      : null;
  }

  /** All live interaction zones (for InteractionTargetResolver). */
  getZones(): ActiveZone[] {
    return this.zones;
  }

  /** Sync near-zone registry without consuming E (Phase 10D). */
  setNearZone(zone: ActiveZone | null): void {
    const id = zone?.id ?? null;
    if (id !== this._nearZoneId) {
      this._nearZoneId = id;
      this.scene.registry.set(
        'nearZone',
        zone ? { id: zone.id, name: zone.name } : null,
      );
    }
  }

  clearNearZone(): void {
    this.setNearZone(null);
  }
}
