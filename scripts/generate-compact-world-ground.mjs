/**
 * Phase 8G — generates src/game/data/compact-world-ground.json, a
 * deterministic ground-geometry artifact derived entirely from
 * scripts/lib/canonical-world.mjs (which itself mirrors RoadNetwork.ts).
 *
 * This file does NOT drive runtime rendering — CompactRoadRenderer.ts
 * reads RoadNetwork.ts directly in the browser, which stays the single
 * source of truth for the live game. This JSON exists so ground geometry
 * can be validated with a fast Node script (no browser) and inspected by
 * tooling without spinning up Phaser.
 *
 * Run: node scripts/generate-compact-world-ground.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  WORLD_W, WORLD_H, ROAD_WIDTH, WORLD_OBJECTS_SNAPSHOT, CANONICAL_LANDMARK_IDS,
  landmarkPx, buildLabeledRoadSegments,
} from './lib/canonical-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src', 'game', 'data', 'compact-world-ground.json');

function main() {
  const plazas = CANONICAL_LANDMARK_IDS.map((id) => {
    const p = landmarkPx(id);
    return { id, x: p.x, y: p.y, radius: p.plaza };
  });

  const segments = buildLabeledRoadSegments().map((s) => ({
    ...s,
    length: s.orientation === 'h' ? Math.abs(s.x2 - s.x1) : Math.abs(s.y2 - s.y1),
  }));

  const ground = {
    version: '1.0-compact-ring-spoke',
    generatedAt: new Date().toISOString(),
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    roadWidth: ROAD_WIDTH,
    coordinateSource: 'scripts/lib/canonical-world.mjs (mirrors src/game/world/RoadNetwork.ts) — do not hand-edit',
    plazas,
    segments,
  };

  writeFileSync(OUT, JSON.stringify(ground, null, 2));
  console.log(`Wrote ${plazas.length} plazas + ${segments.length} road segments → ${OUT}`);
}

main();
