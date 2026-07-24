/**
 * BuildingGenerator.ts
 * ────────────────────
 * Owns landmark footprints and floating labels — NOT filler blocks.
 */

import Phaser from 'phaser';
import { BuildingSystem } from '../systems/BuildingSystem';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { InteractionSystem } from '../systems/InteractionSystem';
import { getDistrict } from './DistrictGenerator';
import { addMinimapDistrict } from './WorldMinimapData';
import { drawHubLandmarks, registerHubLandmarksMinimap } from './HubLandmarks';
import { WorldAssetLoader, WORLD_ASSETS_ENABLED } from './WorldAssetLoader';

// Phase 8B: SpawnPlazaDistrict / HallOfFameDistrict (Phase 7 hand-tuned prop
// art, dozens of individual coordinates each) still reference the old
// 9600×5400 pixel positions and are intentionally not invoked here — see
// world-layout-blueprint.ts `conflicts`. HubLandmarks placeholder
// silhouettes cover all 11 previously-live landmarks at their new compact
// positions in the meantime.

export interface BuildingFootprint {
  districtId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class BuildingGenerator {
  private scene: Phaser.Scene;
  private collision?: CollisionSystem;
  private interaction?: InteractionSystem;
  private labelSystem?: BuildingSystem;
  private footprints: BuildingFootprint[] = [];
  private worldAssetLoader?: WorldAssetLoader;

  constructor(scene: Phaser.Scene, collision?: CollisionSystem, interaction?: InteractionSystem) {
    this.scene = scene;
    this.collision = collision;
    this.interaction = interaction;
  }

  generate(worldW: number, worldH: number): void {
    if (WORLD_ASSETS_ENABLED) {
      this.worldAssetLoader = new WorldAssetLoader(this.scene);
      this.worldAssetLoader.generate(worldW, worldH);
      registerHubLandmarksMinimap(worldW, worldH);
    } else {
      drawHubLandmarks(this.scene, worldW, worldH);
    }

    for (const id of ['cashback', 'arena'] as const) {
      const def = getDistrict(id);
      if (!def?.plate) continue;
      const cx = def.fx * worldW;
      const cy = def.fy * worldH;
      const dw = def.plate.width;
      const dh = def.plate.height;
      addMinimapDistrict(id, (cx - dw / 2) / worldW, (cy - dh / 2) / worldH, dw / worldW, dh / worldH);
    }

    this.labelSystem = new BuildingSystem(this.scene);
    this.labelSystem.init(worldW, worldH);
  }

  getWorldAssetLoader(): WorldAssetLoader | undefined {
    return this.worldAssetLoader;
  }

  updateBuildingVisuals(px: number, py: number, worldW: number, worldH: number): void {
    this.worldAssetLoader?.updateInteractableHighlight(px, py, worldW, worldH);
  }

  updateLabels(zoom: number, animTick: number, playerX?: number, playerY?: number, worldW?: number, worldH?: number): void {
    this.labelSystem?.updateLabels(zoom, animTick, playerX, playerY, worldW, worldH);
  }

  setMissionZone(zoneId: string | null): void {
    this.labelSystem?.setMissionZone(zoneId);
  }

  setSelectedInteractTarget(id: string | null): void {
    this.labelSystem?.setSelectedTargetId(id);
  }

  setEventLandmarkIds(ids: string[]): void {
    this.labelSystem?.setEventLandmarkIds(ids);
  }

  getLabelSystem(): BuildingSystem | undefined {
    return this.labelSystem;
  }

  registerBuilding(footprint: BuildingFootprint): void {
    this.footprints.push(footprint);
    void this.collision;
    void this.interaction;
  }

  getFootprints(): readonly BuildingFootprint[] {
    return this.footprints;
  }
}

