/**
 * DistrictGenerator.ts
 * ────────────────────
 * Owns everything about DISTRICTS and nothing else:
 *   - district boundaries
 *   - district names
 *   - district themes
 *   - district colours
 *   - district metadata
 *   - the ground "plate" + name sign drawn for expansion districts
 *
 * It does NOT draw roads, buildings or decorations. Those belong to the other
 * generators. Districts are pure DATA: adding a new district to
 * DISTRICT_DEFINITIONS is all that is required — WorldScene never changes.
 *
 * The fractional positions below intentionally match RoadNetwork / WorldObjects
 * so the drawn geometry lines up exactly with the existing city.
 */

import Phaser from 'phaser';
import { C_GROUND_MID, C_BORDER_GOLD, C_LAMP_GLOW, C_BUILDING_WIN, C_ARENA_ACCENT } from './WorldPalette';
import { WORLD_ASSETS_ENABLED } from './WorldAssetLoader';
import { TERRAIN_ART_ENABLED } from './WorldTerrainLayer';

/* ─── District data model ─────────────────────────────────────────────── */

export interface DistrictTheme {
  /** Ground fill colour for the district plate. */
  ground: number;
  /** Border / trim colour. */
  border: number;
  /** Accent colour (lamps, highlights). */
  accent: number;
  /** Window glow colour used by buildings placed inside. */
  window: number;
}

/** Optional drawn ground plate + name sign (only for expansion districts). */
export interface DistrictPlate {
  width: number;
  height: number;
  borderColor: number;
  borderAlpha: number;
  gridColor: number;
  gridAlpha: number;
  gridStep: number;
  signText: string;
  signColor: string;
  signFontSize: number;
  signAlpha: number;
}

export interface DistrictDefinition {
  id: string;
  name: string;
  /** Theme keyword (plaza / market / whale / vault / arena / …). */
  theme: string;
  /** Fractional centre position within the world (0..1). */
  fx: number;
  fy: number;
  colors: DistrictTheme;
  metadata: {
    biome: string;
    locked?: boolean;
    comingSoon?: boolean;
    /** Related WorldObject landmark id, if any. */
    landmarkId?: string;
  };
  /**
   * If present, the district draws a ground plate + name sign at its position.
   * Central hub districts are metadata-only until handcrafted art is added.
   */
  plate?: DistrictPlate;
}

/* ─── The city's districts (DATA — add here to grow the world) ─────────── */

export const DISTRICT_DEFINITIONS: DistrictDefinition[] = [
  {
    id: 'spawn',
    name: 'Spawn District',
    theme: 'plaza',
    fx: 0.500,
    fy: 0.500,
    colors: { ground: C_GROUND_MID, border: C_BORDER_GOLD, accent: C_LAMP_GLOW, window: C_BUILDING_WIN },
    metadata: { biome: 'plaza', landmarkId: 'fountain' },
  },
  {
    id: 'market',
    name: 'Market District',
    theme: 'market',
    fx: 0.750,
    fy: 0.513,
    colors: { ground: C_GROUND_MID, border: C_BORDER_GOLD, accent: C_LAMP_GLOW, window: C_BUILDING_WIN },
    metadata: { biome: 'market', landmarkId: 'market' },
  },
  {
    id: 'whale',
    name: 'Whale District',
    theme: 'whale',
    fx: 0.643,
    fy: 0.193,
    colors: { ground: C_GROUND_MID, border: C_BORDER_GOLD, accent: C_LAMP_GLOW, window: C_BUILDING_WIN },
    metadata: { biome: 'whale', landmarkId: 'whale' },
  },
  {
    id: 'cashback',
    name: 'Holder Cashback District',
    theme: 'vault',
    fx: 0.459,
    fy: 0.849,
    colors: { ground: C_GROUND_MID, border: C_BORDER_GOLD, accent: C_LAMP_GLOW, window: C_BUILDING_WIN },
    metadata: { biome: 'vault', locked: true, landmarkId: 'cashback' },
    plate: {
      width: 420,
      height: 300,
      borderColor: C_BORDER_GOLD,
      borderAlpha: 0.42,
      gridColor: 0x1a2a38,
      gridAlpha: 0.28,
      gridStep: 60,
      signText: 'HOLDER CASHBACK DISTRICT',
      signColor: '#c8902a',
      signFontSize: 14,
      signAlpha: 0.72,
    },
  },
  {
    id: 'arena',
    name: 'Future Arena District',
    theme: 'arena',
    fx: 0.811,
    fy: 0.864,
    colors: { ground: C_GROUND_MID, border: C_ARENA_ACCENT, accent: C_ARENA_ACCENT, window: C_BUILDING_WIN },
    metadata: { biome: 'arena', comingSoon: true, landmarkId: 'arena' },
    plate: {
      width: 560,
      height: 360,
      borderColor: C_ARENA_ACCENT,
      borderAlpha: 0.38,
      gridColor: 0x1a2a38,
      gridAlpha: 0.24,
      gridStep: 80,
      signText: 'FUTURE ARENA DISTRICT',
      signColor: '#d4a030',
      signFontSize: 15,
      signAlpha: 0.72,
    },
  },
];

/** Look up a district definition by id. */
export function getDistrict(id: string): DistrictDefinition | undefined {
  return DISTRICT_DEFINITIONS.find((d) => d.id === id);
}

/** Districts that have a drawn ground plate (expansion districts). */
export function getPlatedDistricts(): DistrictDefinition[] {
  return DISTRICT_DEFINITIONS.filter((d) => !!d.plate);
}

/* ─── Generator ───────────────────────────────────────────────────────── */

export class DistrictGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Draw the ground plate + name sign for every district that defines a plate.
   * Central districts are metadata only and draw nothing here.
   * Depth 1 (ground) / depth 2 (sign) — matches the previous CityMapSystem.
   */
  generate(worldW: number, worldH: number): void {
    if (WORLD_ASSETS_ENABLED || TERRAIN_ART_ENABLED) return;
    for (const def of DISTRICT_DEFINITIONS) {
      if (!def.plate) continue;
      this.drawPlate(def, worldW, worldH);
    }
  }

  private drawPlate(def: DistrictDefinition, worldW: number, worldH: number): void {
    const plate = def.plate!;
    const cx = def.fx * worldW;
    const cy = def.fy * worldH;
    const dw = plate.width;
    const dh = plate.height;

    const g = this.scene.add.graphics().setDepth(1);

    // Ground
    g.fillStyle(def.colors.ground, 1);
    g.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
    g.lineStyle(2, plate.borderColor, plate.borderAlpha);
    g.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);
    g.lineStyle(1, plate.gridColor, plate.gridAlpha);
    for (let ox = -dw / 2 + plate.gridStep; ox < dw / 2; ox += plate.gridStep) {
      g.lineBetween(cx + ox, cy - dh / 2, cx + ox, cy + dh / 2);
    }
    for (let oy = -dh / 2 + plate.gridStep; oy < dh / 2; oy += plate.gridStep) {
      g.lineBetween(cx - dw / 2, cy + oy, cx + dw / 2, cy + oy);
    }

    // Name sign
    this.scene.add
      .text(cx, cy - dh / 2 - 20, plate.signText, {
        fontFamily: '"Cinzel", serif',
        fontSize: `${plate.signFontSize}px`,
        fontStyle: 'bold',
        color: plate.signColor,
        backgroundColor: 'rgba(4,8,12,0.80)',
        padding: { x: 10, y: 4 },
        stroke: '#000000',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(2)
      .setAlpha(plate.signAlpha);
  }
}
