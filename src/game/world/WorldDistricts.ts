/**
 * WorldDistricts.ts
 * ─────────────────
 * Phase 10A — five districts left→right on main_rugtown.png.
 * Bounds authored in IMAGE pixels, converted via WorldMapScale.
 */

import {
  imageToWorldH, imageToWorldW, imageToWorldX, imageToWorldY,
  WORLD_IMAGE_HEIGHT, WORLD_IMAGE_WIDTH,
} from './WorldMapScale';

export type DistrictId =
  | 'west'
  | 'spring_core'
  | 'east'
  | 'financial'
  | 'arena_grounds';

export interface WorldDistrict {
  id: DistrictId;
  name: string;
  /** Image-space AABB (inclusive of left/top). */
  imageX: number;
  imageY: number;
  imageW: number;
  imageH: number;
  worldX: number;
  worldY: number;
  worldW: number;
  worldH: number;
}

function defineDistrict(
  id: DistrictId,
  name: string,
  imageX: number,
  imageW: number,
): WorldDistrict {
  const imageY = 0;
  const imageH = WORLD_IMAGE_HEIGHT;
  return {
    id,
    name,
    imageX,
    imageY,
    imageW,
    imageH,
    worldX: imageToWorldX(imageX),
    worldY: imageToWorldY(imageY),
    worldW: imageToWorldW(imageW),
    worldH: imageToWorldH(imageH),
  };
}

/**
 * Uneven bands matching the painted town: West plaza cluster, Spring
 * Water hub, East market band, Financial plaza west of the river, Arena
 * east of the river.
 */
export const WORLD_DISTRICTS: WorldDistrict[] = [
  defineDistrict('west', 'West District', 0, 520),
  defineDistrict('spring_core', 'Spring Water Core', 520, 460),
  defineDistrict('east', 'East District', 980, 470),
  defineDistrict('financial', 'Financial Quarter', 1450, 400),
  defineDistrict('arena_grounds', 'Arena Grounds', 1850, WORLD_IMAGE_WIDTH - 1850),
];

export function getDistrictAtImage(ix: number, _iy: number): WorldDistrict | undefined {
  return WORLD_DISTRICTS.find((d) => ix >= d.imageX && ix < d.imageX + d.imageW);
}

export function getDistrictAtWorld(wx: number, wy: number): WorldDistrict | undefined {
  return WORLD_DISTRICTS.find(
    (d) =>
      wx >= d.worldX && wx < d.worldX + d.worldW &&
      wy >= d.worldY && wy < d.worldY + d.worldH,
  );
}
