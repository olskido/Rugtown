/*
  CollisionZones.ts
  ──────────────────
  Single source of truth for walkable/blocked areas. Pure data, no
  Phaser import — same pattern as WorldObjects.ts, so the rectangles
  here are the only place collision geometry is ever defined.

  Everything is a BLOCKED rectangle; the rest of the map (roads, the
  plaza, bridges, market areas, open ground) is walkable by default.
  Coordinates are fractions (0–1) of world width/height — multiply by
  the actual worldW/worldH via toWorldRect() once the city image has
  loaded, same convention as WorldObjects.

  MVP pass: collision is intentionally LIGHT. Most ordinary building
  footprints were removed so the player isn't blocked everywhere —
  only the obvious water canals, the very edges of the map, and one
  unmistakably massive structure are still solid. Press C in-game to
  show the red debug overlay if these need further nudging.
*/

export type CollisionKind = 'building' | 'water' | 'edge';

export interface CollisionRect {
  id: string;
  kind: CollisionKind;
  /** Fraction of world width, 0–1 */
  x: number;
  /** Fraction of world height, 0–1 */
  y: number;
  /** Fraction of world width, 0–1 */
  w: number;
  /** Fraction of world height, 0–1 */
  h: number;
}

export const COLLISION_RECTS: CollisionRect[] = [
  /* ── The one massive, unmistakably-impossible structure kept for this
     pass — the large domed building on the east side. Everything else
     that used to be a "building" box (the smaller upper-row buildings,
     the center building, the bottom-row buildings) has been removed so
     roads/plaza/market areas stay open. ── */
  { id: 'bldg-e-dome', kind: 'building', x: 0.77, y: 0.32, w: 0.22, h: 0.62 },

  /* ── Extreme map edges — thin strips along the very top/bottom of the
     image, where the art is dense rooftop cut off by the frame. Not a
     building footprint, just a guard so the player can't visually clip
     into the edge architecture. ── */
  { id: 'edge-north', kind: 'edge', x: 0.00, y: 0.000, w: 1.00, h: 0.045 },
  { id: 'edge-south', kind: 'edge', x: 0.00, y: 0.955, w: 1.00, h: 0.045 },

  /* ── Water canals — split on either side of each bridge so the bridge
     deck itself stays walkable ── */
  { id: 'canal-1-nw', kind: 'water', x: 0.21, y: 0.34, w: 0.06, h: 0.16 }, // before the small bridge
  { id: 'canal-1-se', kind: 'water', x: 0.40, y: 0.42, w: 0.07, h: 0.14 }, // after the small bridge
  { id: 'canal-2-nw', kind: 'water', x: 0.57, y: 0.34, w: 0.06, h: 0.22 }, // before the large bridge
  { id: 'canal-2-se', kind: 'water', x: 0.73, y: 0.36, w: 0.07, h: 0.24 }, // after the large bridge
  { id: 'canal-3-nw', kind: 'water', x: 0.47, y: 0.80, w: 0.06, h: 0.13 }, // small pond, before its bridge
  { id: 'canal-3-se', kind: 'water', x: 0.63, y: 0.78, w: 0.07, h: 0.15 }, // small pond, after its bridge
];

/** Fractional rect → real world pixels, once worldW/worldH are known. */
export function toWorldRect(
  r: CollisionRect,
  worldW: number,
  worldH: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: r.x * worldW,
    y: r.y * worldH,
    w: r.w * worldW,
    h: r.h * worldH,
  };
}
