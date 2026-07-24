#!/usr/bin/env node
/**
 * travel-time-report.mjs
 * ───────────────────────
 * Phase 8B validation — computes the walking time from Spring Water
 * (fountain) to every landmark over the live RoadNetwork graph, using the
 * same L-shaped (Manhattan) road segments the player actually walks and
 * the same PLAYER_SPEED as WorldScene.ts. Flags anything over 10s.
 *
 * Geometry comes from scripts/lib/canonical-world.mjs (kept in sync with
 * src/game/world/WorldObjects.ts / RoadNetwork.ts).
 * Run: node scripts/travel-time-report.mjs
 */
import { WORLD_W, WORLD_H, PLAYER_SPEED, WORLD_OBJECTS_SNAPSHOT, ROAD_EDGES, landmarkPx } from './lib/canonical-world.mjs';

const ids = Object.keys(WORLD_OBJECTS_SNAPSHOT);
const nodeMap = new Map(ids.map((id) => [id, landmarkPx(id)]));

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Dijkstra from fountain over the L-shaped road graph.
const dist = new Map(ids.map((id) => [id, Infinity]));
dist.set('fountain', 0);
const visited = new Set();
const adj = new Map(ids.map((id) => [id, []]));
for (const [a, b] of ROAD_EDGES) {
  const d = manhattan(nodeMap.get(a), nodeMap.get(b));
  adj.get(a).push([b, d]);
  adj.get(b).push([a, d]);
}

while (visited.size < ids.length) {
  let u = null;
  let best = Infinity;
  for (const [id, d] of dist) {
    if (!visited.has(id) && d < best) { best = d; u = id; }
  }
  if (u === null) break;
  visited.add(u);
  for (const [v, w] of adj.get(u)) {
    const nd = dist.get(u) + w;
    if (nd < dist.get(v)) dist.set(v, nd);
  }
}

const rows = [...dist.entries()]
  .map(([id, d]) => ({ id, px: Math.round(d), seconds: d / PLAYER_SPEED }))
  .sort((a, b) => a.seconds - b.seconds);

console.log(`\nRugTown Phase 8B — Travel Time Report (world ${WORLD_W}×${WORLD_H}, PLAYER_SPEED=${PLAYER_SPEED}px/s)\n`);
console.log('landmark'.padEnd(24), 'path px'.padStart(9), 'seconds'.padStart(9), '');
console.log('─'.repeat(50));
for (const r of rows) {
  const flag = r.seconds > 10 ? '  ⚠️ OVER 10s' : '';
  console.log(r.id.padEnd(24), String(r.px).padStart(9), r.seconds.toFixed(2).padStart(9), flag);
}

const overLimit = rows.filter((r) => r.seconds > 10);
console.log('\n' + (overLimit.length === 0
  ? '✅ All landmarks reachable within 10s of Spring Water.'
  : `⚠️ ${overLimit.length} landmark(s) exceed 10s: ${overLimit.map((r) => r.id).join(', ')}`));
