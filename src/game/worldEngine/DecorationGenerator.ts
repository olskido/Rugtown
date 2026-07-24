/**
 * DecorationGenerator.ts
 * ──────────────────────
 * Owns everything DECORATIVE and nothing else:
 *   - trees
 *   - bushes
 *   - flowers
 *   - street lights
 *   - benches
 *   - trash bins
 *   - rocks
 *   - signs
 *   - random decorative objects (seeded)
 *
 * It draws NO roads, NO buildings and defines NO districts.
 *
 * Ambient plaza props + the fountain guide are produced by the existing
 * DecorationSystem, which this generator wraps. On top of that it draws the
 * world edge barriers and per-district street lights (moved out of the old
 * CityMapSystem, pixel-identical), plus a SEEDED scatter of extra props inside
 * the expansion districts. Re-running with the same seed reproduces the exact
 * same layout, so the world is deterministic.
 */

import Phaser from 'phaser';
import { DecorationSystem } from '../systems/DecorationSystem';
import { getPlatedDistricts, type DistrictDefinition } from './DistrictGenerator';
import {
  C_WALL_DARK, C_WALL_ACCENT, C_FENCE_LINE, C_BORDER_GOLD, C_ROCK, C_ROCK_EDGE,
  C_LAMP_GLOW, C_LEAF_DARK, C_LEAF_MID, C_TRUNK, C_FLOWER_GOLD, C_FLOWER_RED,
  C_BENCH_WOOD, C_METAL_DARK, RUGTOWN_WORLD_SEED, makeSeededRng, hashSeed,
} from './WorldPalette';
import { WORLD_ASSETS_ENABLED } from './WorldAssetLoader';
import { TERRAIN_ART_ENABLED } from './WorldTerrainLayer';

/* ─── Seeded prop data (per-district scatter — pure data) ─────────────── */

type PropKind = 'tree' | 'bush' | 'flower' | 'bench' | 'trashBin' | 'rock';

interface PropSpec {
  kind: PropKind;
  count: number;
}

/** How each plated district is landscaped. Add data → more props, no code. */
const DISTRICT_PROPS: Record<string, PropSpec[]> = {
  cashback: [
    { kind: 'tree', count: 4 },
    { kind: 'bench', count: 2 },
    { kind: 'trashBin', count: 2 },
    { kind: 'flower', count: 5 },
    { kind: 'bush', count: 3 },
  ],
  arena: [
    { kind: 'tree', count: 6 },
    { kind: 'bench', count: 3 },
    { kind: 'trashBin', count: 2 },
    { kind: 'flower', count: 7 },
    { kind: 'bush', count: 4 },
    { kind: 'rock', count: 2 },
  ],
};

/** Street-light layout per plated district (inset from plate corners). */
const LAMP_LAYOUTS: Record<string, { inset: number; topCenter: boolean }> = {
  cashback: { inset: 48, topCenter: false },
  arena: { inset: 58, topCenter: true },
};

/* ─── Generator ───────────────────────────────────────────────────────── */

export class DecorationGenerator {
  private scene: Phaser.Scene;
  private decoSystem?: DecorationSystem;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Fallback ground used when the background image fails to load. */
  static drawFallbackWorld(scene: Phaser.Scene, worldW: number, worldH: number): void {
    DecorationSystem.drawFallbackWorld(scene, worldW, worldH);
  }

  /**
   * Build all decoration: plaza ambience + fountain guide, world edge barriers,
   * per-district street lights, and the seeded prop scatter.
   */
  generate(
    worldW: number, worldH: number,
    spawnFx: number, spawnFy: number,
    seed: number = RUGTOWN_WORLD_SEED,
  ): void {
    this.decoSystem = new DecorationSystem(this.scene);
    this.decoSystem.createAmbience(worldW, worldH, spawnFx, spawnFy);
    this.decoSystem.createFountainGuide(worldW, worldH);

    if (TERRAIN_ART_ENABLED) return;

    this.drawEdgeBarriers(worldW, worldH);
    if (!WORLD_ASSETS_ENABLED) {
      this.drawDistrictStreetLights(worldW, worldH);
      this.placeSeededProps(worldW, worldH, seed);
    }
  }

  /** Per-frame fountain guide update — delegated from WorldScene.update(). */
  updateFountainGuide(delta: number, px: number, py: number, worldW: number, worldH: number): void {
    this.decoSystem?.updateFountainGuide(delta, px, py, worldW, worldH);
  }

  /* ── Edge barriers (walls / fences / rocks / bushes) ──────────────── */

  private drawEdgeBarriers(worldW: number, worldH: number): void {
    const g = this.scene.add.graphics().setDepth(3);
    const thick = 120;

    g.fillStyle(C_WALL_DARK, 1);
    g.fillRect(0, 0, worldW, thick);
    g.fillRect(0, worldH - thick, worldW, thick);
    g.fillRect(0, 0, thick, worldH);
    g.fillRect(worldW - thick, 0, thick, worldH);

    const panelW = 78, panelH = 48, panelGap = 8;
    g.fillStyle(C_WALL_ACCENT, 1);
    for (let x = thick; x < worldW - thick - panelW; x += panelW + panelGap) {
      g.fillRect(x, thick - panelH - 4, panelW, panelH);
      g.fillRect(x, worldH - thick + 4, panelW, panelH);
    }
    for (let y = thick; y < worldH - thick - panelW; y += panelH + panelGap) {
      g.fillRect(thick - panelH - 4, y, panelH, panelW);
      g.fillRect(worldW - thick + 4, y, panelH, panelW);
    }

    g.lineStyle(3, C_BORDER_GOLD, 0.38);
    g.strokeRect(thick - 2, thick - 2, worldW - thick * 2 + 4, worldH - thick * 2 + 4);

    // Fence posts along inner edge
    g.fillStyle(C_FENCE_LINE, 0.68);
    const postSz = 7, postStep = 58;
    for (let x = thick + 20; x < worldW - thick; x += postStep) {
      g.fillRect(x - postSz / 2, thick - 26, postSz, 26);
      g.fillRect(x - postSz / 2, worldH - thick, postSz, 26);
    }
    for (let y = thick + 20; y < worldH - thick; y += postStep) {
      g.fillRect(thick - 26, y - postSz / 2, 26, postSz);
      g.fillRect(worldW - thick, y - postSz / 2, 26, postSz);
    }
    // Rails
    g.lineStyle(2, C_FENCE_LINE, 0.42);
    g.lineBetween(thick, thick - 17, worldW - thick, thick - 17);
    g.lineBetween(thick, thick - 8, worldW - thick, thick - 8);
    g.lineBetween(thick, worldH - thick + 17, worldW - thick, worldH - thick + 17);
    g.lineBetween(thick, worldH - thick + 8, worldW - thick, worldH - thick + 8);
    g.lineBetween(thick - 17, thick, thick - 17, worldH - thick);
    g.lineBetween(thick - 8, thick, thick - 8, worldH - thick);
    g.lineBetween(worldW - thick + 17, thick, worldW - thick + 17, worldH - thick);
    g.lineBetween(worldW - thick + 8, thick, worldW - thick + 8, worldH - thick);

    // Corner rock clusters
    for (const [rx, ry] of [
      [thick + 22, thick + 22], [worldW - thick - 22, thick + 22],
      [thick + 22, worldH - thick - 22], [worldW - thick - 22, worldH - thick - 22],
    ]) {
      this.drawRockCluster(g, rx, ry);
    }

    // Scattered rocks along inner edge
    const rockStep = 380;
    for (let x = thick + 180; x < worldW - thick; x += rockStep) {
      this.drawRock(g, x + ((Math.sin(x) * 28) | 0), thick + 14, 20, 13);
      this.drawRock(g, x + ((Math.cos(x) * 22) | 0), worldH - thick - 14, 20, 13);
    }
    for (let y = thick + 180; y < worldH - thick; y += rockStep) {
      this.drawRock(g, thick + 14, y + ((Math.sin(y) * 28) | 0), 13, 20);
      this.drawRock(g, worldW - thick - 14, y + ((Math.cos(y) * 22) | 0), 13, 20);
    }

    // Bushes
    g.fillStyle(0x142218, 0.82);
    const bushStep = 270;
    for (let x = thick + 130; x < worldW - thick; x += bushStep) {
      const r = 11 + (Math.sin(x * 7) * 3.5 | 0);
      g.fillCircle(x, thick - 12, r);
      g.fillCircle(x, worldH - thick + 12, r);
    }
    for (let y = thick + 130; y < worldH - thick; y += bushStep) {
      const r = 11 + (Math.cos(y * 7) * 3.5 | 0);
      g.fillCircle(thick - 12, y, r);
      g.fillCircle(worldW - thick + 12, y, r);
    }
  }

  /* ── District street lights ───────────────────────────────────────── */

  private drawDistrictStreetLights(worldW: number, worldH: number): void {
    for (const def of getPlatedDistricts()) {
      const layout = LAMP_LAYOUTS[def.id];
      if (!layout || !def.plate) continue;
      const cx = def.fx * worldW;
      const cy = def.fy * worldH;
      const dw = def.plate.width;
      const dh = def.plate.height;
      const inset = layout.inset;

      const g = this.scene.add.graphics().setDepth(1);
      this.drawLamp(g, cx - dw / 2 + inset, cy - dh / 2 + inset);
      this.drawLamp(g, cx + dw / 2 - inset, cy - dh / 2 + inset);
      this.drawLamp(g, cx - dw / 2 + inset, cy + dh / 2 - inset);
      this.drawLamp(g, cx + dw / 2 - inset, cy + dh / 2 - inset);
      if (layout.topCenter) this.drawLamp(g, cx, cy - dh / 2 + inset);
    }
  }

  /* ── Seeded decorative props (deterministic scatter) ──────────────── */

  private placeSeededProps(worldW: number, worldH: number, seed: number): void {
    for (const def of getPlatedDistricts()) {
      const specs = DISTRICT_PROPS[def.id];
      if (!specs || !def.plate) continue;
      const rng = makeSeededRng((seed ^ hashSeed(def.id)) >>> 0);
      const g = this.scene.add.graphics().setDepth(2);
      this.scatterDistrictProps(g, def, worldW, worldH, specs, rng);
    }
  }

  private scatterDistrictProps(
    g: Phaser.GameObjects.Graphics,
    def: DistrictDefinition,
    worldW: number, worldH: number,
    specs: PropSpec[],
    rng: () => number,
  ): void {
    const cx = def.fx * worldW;
    const cy = def.fy * worldH;
    const dw = def.plate!.width;
    const dh = def.plate!.height;

    // Props live in the perimeter band: inside the plate margin, outside the
    // building-dense centre. This keeps them off the landmark buildings.
    const margin = 34;
    const coreW = dw * 0.60;
    const coreH = dh * 0.60;

    const pickPoint = (): { x: number; y: number } | null => {
      for (let attempt = 0; attempt < 24; attempt++) {
        const rx = cx - dw / 2 + margin + rng() * (dw - margin * 2);
        const ry = cy - dh / 2 + margin + rng() * (dh - margin * 2);
        const inCore = Math.abs(rx - cx) < coreW / 2 && Math.abs(ry - cy) < coreH / 2;
        if (!inCore) return { x: rx, y: ry };
      }
      return null;
    };

    for (const spec of specs) {
      for (let i = 0; i < spec.count; i++) {
        const p = pickPoint();
        if (!p) continue;
        this.drawProp(g, spec.kind, p.x, p.y, rng);
      }
    }
  }

  private drawProp(
    g: Phaser.GameObjects.Graphics,
    kind: PropKind,
    x: number, y: number,
    rng: () => number,
  ): void {
    switch (kind) {
      case 'tree': this.drawTree(g, x, y, rng); break;
      case 'bush': this.drawBush(g, x, y, rng); break;
      case 'flower': this.drawFlower(g, x, y, rng); break;
      case 'bench': this.drawBench(g, x, y); break;
      case 'trashBin': this.drawTrashBin(g, x, y); break;
      case 'rock': this.drawRock(g, x, y, 20, 13); break;
    }
  }

  /* ── Prop drawing helpers ─────────────────────────────────────────── */

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    const r = 15 + Math.floor(rng() * 7);
    g.fillStyle(C_TRUNK, 1);
    g.fillRect(x - 3, y - 4, 6, 16);
    g.fillStyle(C_LEAF_DARK, 0.95);
    g.fillCircle(x, y - 16, r);
    g.fillStyle(C_LEAF_MID, 0.7);
    g.fillCircle(x - r * 0.3, y - 16 - r * 0.25, r * 0.55);
  }

  private drawBush(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    const r = 10 + Math.floor(rng() * 5);
    g.fillStyle(C_LEAF_DARK, 0.88);
    g.fillCircle(x, y, r);
    g.fillCircle(x - r * 0.6, y + 2, r * 0.7);
    g.fillCircle(x + r * 0.6, y + 2, r * 0.7);
    g.fillStyle(C_LEAF_MID, 0.5);
    g.fillCircle(x - r * 0.2, y - r * 0.3, r * 0.4);
  }

  private drawFlower(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    g.fillStyle(C_LEAF_MID, 0.8);
    g.fillCircle(x, y, 4);
    const petal = rng() > 0.5 ? C_FLOWER_GOLD : C_FLOWER_RED;
    g.fillStyle(petal, 0.9);
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2;
      g.fillCircle(x + Math.cos(ang) * 4, y - 6 + Math.sin(ang) * 4, 2.4);
    }
    g.fillStyle(C_FLOWER_GOLD, 0.9);
    g.fillCircle(x, y - 6, 1.8);
  }

  private drawBench(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(C_METAL_DARK, 1);
    g.fillRect(x - 20, y + 6, 4, 8);
    g.fillRect(x + 16, y + 6, 4, 8);
    g.fillStyle(C_BENCH_WOOD, 1);
    g.fillRect(x - 22, y + 2, 44, 6);
    g.fillRect(x - 22, y - 8, 44, 5);
    g.fillStyle(C_METAL_DARK, 1);
    g.fillRect(x - 22, y - 8, 3, 12);
    g.fillRect(x + 19, y - 8, 3, 12);
  }

  private drawTrashBin(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(C_METAL_DARK, 1);
    g.fillRect(x - 8, y - 12, 16, 20);
    g.fillStyle(0x0a1014, 0.6);
    g.fillRect(x - 6, y - 8, 12, 14);
    g.fillStyle(C_LAMP_GLOW, 0.25);
    g.fillRect(x - 8, y - 14, 16, 3);
  }

  /* ── Legacy edge helpers (moved verbatim) ─────────────────────────── */

  private drawLamp(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x2a3a48, 1);
    g.fillRect(x - 3, y - 42, 6, 42);
    g.fillRect(x - 3, y - 42, 20, 4);
    g.fillStyle(C_LAMP_GLOW, 0.52);
    g.fillCircle(x + 17, y - 42, 9);
    g.fillStyle(C_LAMP_GLOW, 0.18);
    g.fillCircle(x + 17, y - 42, 16);
  }

  private drawRock(g: Phaser.GameObjects.Graphics, x: number, y: number, rw: number, rh: number): void {
    g.fillStyle(C_ROCK, 1);
    g.fillEllipse(x, y, rw, rh);
    g.fillStyle(C_ROCK_EDGE, 0.52);
    g.fillEllipse(x - rw * 0.14, y - rh * 0.18, rw * 0.48, rh * 0.38);
  }

  private drawRockCluster(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    for (const [ox, oy, rw, rh] of [
      [0, 0, 46, 30], [-22, 13, 34, 22], [20, 11, 38, 26],
      [-7, -16, 28, 19], [13, -13, 24, 17],
    ] as [number, number, number, number][]) {
      this.drawRock(g, x + ox, y + oy, rw, rh);
    }
  }
}
