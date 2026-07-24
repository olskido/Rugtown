/**
 * Phase 10A.1 / 10B — simulates foot-collider resolveWalk against
 * WorldCollisionGeometry solids (same ×2 world space as Phaser).
 *
 * This validates GEOMETRY DATA + algorithm behaviour as if solids were
 * enforced. Runtime may still be dormant when WORLD_COLLISION_ENABLED=false.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const scaleSrc = fs.readFileSync(path.join(root, 'src/game/world/WorldMapScale.ts'), 'utf8');
const runtimeOn = /export const WORLD_COLLISION_ENABLED = true/.test(scaleSrc);
console.log(
  runtimeOn
    ? 'NOTE  RUNTIME COLLISION ENABLED = true'
    : 'NOTE  RUNTIME COLLISION ENABLED = false (this script still validates GEOMETRY DATA only)',
);
const geom = fs.readFileSync(path.join(root, 'src/game/world/WorldCollisionGeometry.ts'), 'utf8');
const WORLD_S = 2;
const FOOT_W = 20, FOOT_H = 12, FOOT_OY = 12, MAX_STEP = 8;

const rects = [...geom.matchAll(/rect\('([^']+)',\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g)]
  .map(m => ({ id: m[1], x: +m[2] * WORLD_S, y: +m[3] * WORLD_S, w: +m[4] * WORLD_S, h: +m[5] * WORLD_S }));
const circles = [...geom.matchAll(/circle\('([^']+)',\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g)]
  .map(m => ({ id: m[1], x: +m[2] * WORLD_S, y: +m[3] * WORLD_S, r: +m[4] * WORLD_S }));

function footBlocked(bodyX, bodyY) {
  const bx = bodyX - FOOT_W / 2;
  const by = bodyY + FOOT_OY - FOOT_H / 2;
  for (const r of rects) {
    if (!(bx + FOOT_W < r.x || bx > r.x + r.w || by + FOOT_H < r.y || by > r.y + r.h)) return r.id;
  }
  for (const c of circles) {
    const px = Math.max(bx, Math.min(c.x, bx + FOOT_W));
    const py = Math.max(by, Math.min(c.y, by + FOOT_H));
    if ((c.x - px) ** 2 + (c.y - py) ** 2 <= c.r * c.r) return c.id;
  }
  return null;
}
function walkable(x, y) { return !footBlocked(x, y); }

function resolveWalk(px, py, vx, vy, dt) {
  const dx = vx * dt, dy = vy * dt;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  const sdt = dt / steps;
  let x = px, y = py, hit = null;
  for (let i = 0; i < steps; i++) {
    const nx = x + vx * sdt, ny = y + vy * sdt;
    if (walkable(nx, ny)) { x = nx; y = ny; continue; }
    hit = footBlocked(nx, ny);
    let slid = false;
    if (vx !== 0 && walkable(nx, y)) { x = nx; slid = true; }
    if (vy !== 0 && walkable(x, ny)) { y = ny; slid = true; }
    if (!slid) break;
  }
  return { x, y, hit };
}

const SPAWN = { x: 760 * WORLD_S, y: 352 * WORLD_S };
const targets = [
  ['Spring core bldg_738_126', 738 * WORLD_S, 126 * WORLD_S],
  ['West bldg_240_270', 240 * WORLD_S, 270 * WORLD_S],
  ['Market bldg_1254_240', 1254 * WORLD_S, 240 * WORLD_S],
  ['Whale/financial bldg_1636_176', 1636 * WORLD_S, 176 * WORLD_S],
  ['Arena bldg_2086_242', 2086 * WORLD_S, 242 * WORLD_S],
];

let fails = 0;
console.log('Spawn walkable?', walkable(SPAWN.x, SPAWN.y), 'at', SPAWN);

for (const [name, tx, ty] of targets) {
  let x = SPAWN.x, y = SPAWN.y;
  const speed = 252;
  // Walk toward building centre for up to 20s
  for (let t = 0; t < 20; t += 0.05) {
    const dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    const r = resolveWalk(x, y, (dx / d) * speed, (dy / d) * speed, 0.05);
    x = r.x; y = r.y;
    if (r.hit) break;
  }
  const distToCentre = Math.hypot(x - tx, y - ty);
  const inside = !!footBlocked(tx, ty);
  const playerInside = !!footBlocked(x, y);
  const ok = inside && !playerInside && distToCentre > 8;
  console.log(ok ? 'OK ' : 'FAIL', name, `stopped at (${Math.round(x)},${Math.round(y)}) dist=${distToCentre.toFixed(1)} hitFootAtCentre=${inside} playerInside=${playerInside}`);
  if (!ok) fails++;
}

// Diagonal slam into arena corner repeatedly
let x = 1980 * WORLD_S, y = 300 * WORLD_S;
let tunneled = false;
for (let i = 0; i < 40; i++) {
  const r = resolveWalk(x, y, 180, 180, 0.05);
  if (footBlocked(r.x, r.y)) tunneled = true;
  x = r.x; y = r.y;
}
console.log(!tunneled ? 'OK ' : 'FAIL', 'diagonal corner slam no tunnel', { x: Math.round(x), y: Math.round(y) });
if (tunneled) fails++;

// Bridge still walkable along deck
let bx = 1835 * WORLD_S, by = 380 * WORLD_S;
let bridgeOk = true;
for (let i = 0; i < 30; i++) {
  const r = resolveWalk(bx, by, 200, 0, 0.05);
  if (footBlocked(r.x, r.y)) bridgeOk = false;
  bx = r.x; by = r.y;
}
console.log(bridgeOk ? 'OK ' : 'FAIL', 'bridge eastward walk', { x: Math.round(bx), y: Math.round(by) });
if (!bridgeOk) fails++;

console.log(fails === 0 ? '\nALL WALK SIMS PASSED' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
