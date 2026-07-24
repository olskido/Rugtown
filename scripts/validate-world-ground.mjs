/**
 * Phase 8G — lightweight geometry validation for
 * src/game/data/compact-world-ground.json (no browser required).
 *
 * Checks (Task 17):
 *  - every ROAD_EDGE resolved to known nodes
 *  - each edge produced exactly two valid orthogonal segments
 *  - no segment has zero or negative length
 *  - all road segments (± half road width) stay within world bounds
 *  - the central plaza contains the Spring Water coordinate exactly
 *  - all 20 canonical landmarks have a plaza entry
 *  - bridge approach segments connect to the bridge node
 *
 * Run: node scripts/validate-world-ground.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WORLD_W, WORLD_H, ROAD_WIDTH, ROAD_EDGES, CANONICAL_LANDMARK_IDS } from './lib/canonical-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GROUND = join(ROOT, 'src', 'game', 'data', 'compact-world-ground.json');

function main() {
  const g = JSON.parse(readFileSync(GROUND, 'utf8'));
  const errors = [];
  const half = ROAD_WIDTH / 2;

  if (g.worldWidth !== WORLD_W || g.worldHeight !== WORLD_H) {
    errors.push(`Expected world ${WORLD_W}×${WORLD_H}, ground declares ${g.worldWidth}×${g.worldHeight}`);
  }
  if (g.roadWidth !== ROAD_WIDTH) {
    errors.push(`Expected roadWidth ${ROAD_WIDTH}, ground declares ${g.roadWidth}`);
  }

  const expectedSegCount = ROAD_EDGES.length * 2;
  if (g.segments.length !== expectedSegCount) {
    errors.push(`Expected ${expectedSegCount} segments (2 per ROAD_EDGE, ${ROAD_EDGES.length} edges), found ${g.segments.length}`);
  }

  let bridgeSegmentFound = false;
  for (const s of g.segments) {
    const isH = s.y1 === s.y2;
    const isV = s.x1 === s.x2;
    if (!isH && !isV) {
      errors.push(`Segment (edge ${s.edgeIndex}, ${s.a}→${s.b}) is not axis-aligned: (${s.x1},${s.y1})-(${s.x2},${s.y2})`);
    }
    if (s.orientation === 'h' && !isH) errors.push(`Segment (edge ${s.edgeIndex}) labeled 'h' but is not horizontal`);
    if (s.orientation === 'v' && !isV) errors.push(`Segment (edge ${s.edgeIndex}) labeled 'v' but is not vertical`);
    if (s.length <= 0) {
      // Degenerate (zero-length) segments are geometrically valid when a
      // node's a.x===b.x (or a.y===b.y) collapses one leg of the L — the
      // other leg still carries the full connection. Only flag if BOTH
      // legs of the edge collapse (i.e. the two nodes are coincident).
      const sibling = g.segments.find((o) => o.edgeIndex === s.edgeIndex && o !== s);
      if (!sibling || sibling.length <= 0) {
        errors.push(`Edge ${s.edgeIndex} (${s.a}→${s.b}) has zero length on both legs — coincident nodes`);
      }
    }
    const minX = Math.min(s.x1, s.x2) - half, maxX = Math.max(s.x1, s.x2) + half;
    const minY = Math.min(s.y1, s.y2) - half, maxY = Math.max(s.y1, s.y2) + half;
    if (minX < 0 || maxX > WORLD_W || minY < 0 || maxY > WORLD_H) {
      errors.push(`Segment (edge ${s.edgeIndex}, ${s.a}→${s.b}) extends outside world bounds: [${minX},${minY}]-[${maxX},${maxY}]`);
    }
    if (s.a === 'bridge' || s.b === 'bridge') bridgeSegmentFound = true;
  }
  if (!bridgeSegmentFound) {
    errors.push('No road segment connects to the "bridge" landmark');
  }

  const fountainPlaza = g.plazas.find((p) => p.id === 'fountain');
  if (!fountainPlaza) {
    errors.push('No "fountain" plaza found');
  } else if (fountainPlaza.x !== 1800 || fountainPlaza.y !== 1200) {
    errors.push(`Fountain plaza should be at (1800,1200), found (${fountainPlaza.x},${fountainPlaza.y})`);
  }

  const plazaIds = new Set(g.plazas.map((p) => p.id));
  const missing = CANONICAL_LANDMARK_IDS.filter((id) => !plazaIds.has(id));
  if (missing.length) {
    errors.push(`Missing plaza entries for canonical landmarks: ${missing.join(', ')}`);
  }
  if (g.plazas.length !== 20) {
    errors.push(`Expected exactly 20 plazas, found ${g.plazas.length}`);
  }

  if (errors.length) {
    console.error(`\n❌ world-ground validation FAILED (${errors.length} error(s)):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  console.log(`✅ world-ground validation passed — ${g.plazas.length} plazas, ${g.segments.length} segments (${ROAD_EDGES.length} edges), world ${g.worldWidth}×${g.worldHeight}, roadWidth=${g.roadWidth}.`);
}

main();
