/**
 * Phase 10A geometry validation for main_rugtown.png
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.cwd();
const mainPath = path.join(root, 'public/assets/world/main_rugtown.png');

const errors = [];
const warnings = [];
function ok(msg) { console.log('OK ', msg); }
function fail(msg) { errors.push(msg); console.error('FAIL', msg); }
function warn(msg) { warnings.push(msg); console.warn('WARN', msg); }

if (!fs.existsSync(mainPath)) fail('main_rugtown.png missing');
else {
  const meta = await sharp(mainPath).metadata();
  ok(`background exists ${meta.width}x${meta.height} ${meta.format}`);
  if (meta.width !== 2172 || meta.height !== 724) {
    warn(`Brief cited 2048×682; actual file is ${meta.width}×${meta.height} — using actual file`);
  }
  const aspect = meta.width / meta.height;
  if (Math.abs(aspect - 3) > 0.01) fail(`Aspect ${aspect} not ~3:1`);
  else ok(`aspect ~3:1 (${aspect.toFixed(4)})`);
}

const WORLD_IMAGE_WIDTH = 2172;
const WORLD_IMAGE_HEIGHT = 724;
const WORLD_SCALE = 2;
const WORLD_W = WORLD_IMAGE_WIDTH * WORLD_SCALE;
const WORLD_H = WORLD_IMAGE_HEIGHT * WORLD_SCALE;

if (WORLD_W / WORLD_H !== WORLD_IMAGE_WIDTH / WORLD_IMAGE_HEIGHT) fail('World aspect diverges');
else ok(`world ${WORLD_W}x${WORLD_H} preserves aspect`);

const geomPath = path.join(root, 'src/game/world/WorldCollisionGeometry.ts');
const geom = fs.readFileSync(geomPath, 'utf8');
const ids = [...geom.matchAll(/rect\('([^']+)'/g), ...geom.matchAll(/circle\('([^']+)'/g)].map(m => m[1]);
const unique = new Set(ids);
if (unique.size !== ids.length) fail('Duplicate collision IDs');
else ok(`collision ids unique (${ids.length})`);

const rects = [...geom.matchAll(/rect\('([^']+)',\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g)]
  .map(m => ({ id: m[1], x:+m[2], y:+m[3], w:+m[4], h:+m[5] }));
const circles = [...geom.matchAll(/circle\('([^']+)',\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g)]
  .map(m => ({ id: m[1], x:+m[2], y:+m[3], r:+m[4] }));

for (const r of rects) {
  if (r.x < 0 || r.y < 0 || r.x + r.w > WORLD_IMAGE_WIDTH || r.y + r.h > WORLD_IMAGE_HEIGHT) {
    fail(`solid ${r.id} outside image bounds`);
  }
}
ok('all solids inside image bounds');

function blocked(px, py) {
  for (const r of rects) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
  }
  for (const c of circles) {
    const dx = px - c.x, dy = py - c.y;
    if (dx * dx + dy * dy <= c.r * c.r) return true;
  }
  return false;
}

const SPAWN = { x: 760, y: 352 };
if (blocked(SPAWN.x, SPAWN.y)) fail('spawn overlaps solid');
else ok('spawn clear of solids');

const BRIDGE = { x: 1900, y: 380 };
if (blocked(BRIDGE.x, BRIDGE.y)) fail('bridge deck point blocked');
else ok('bridge deck walkable');

/** Coarse BFS on open cells (step 12) for district reachability */
function reachable(from, to) {
  const step = 12;
  const key = (x, y) => `${Math.round(x / step)},${Math.round(y / step)}`;
  const q = [from];
  const seen = new Set([key(from.x, from.y)]);
  const goalK = key(to.x, to.y);
  let guard = 0;
  while (q.length && guard++ < 80000) {
    const p = q.shift();
    if (key(p.x, p.y) === goalK || (Math.abs(p.x - to.x) < step && Math.abs(p.y - to.y) < step)) return true;
    for (const [dx, dy] of [[step,0],[-step,0],[0,step],[0,-step],[step,step],[step,-step],[-step,step],[-step,-step]]) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 8 || ny < 8 || nx > WORLD_IMAGE_WIDTH - 8 || ny > WORLD_IMAGE_HEIGHT - 8) continue;
      if (blocked(nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return false;
}

const routes = [
  ['Spring→West', SPAWN, { x: 350, y: 320 }],
  ['Spring→East', SPAWN, { x: 1200, y: 320 }],
  ['East→Financial', { x: 1200, y: 320 }, { x: 1600, y: 300 }],
  ['Financial→Arena', { x: 1600, y: 300 }, { x: 2050, y: 340 }],
  ['Spring→Bridge', SPAWN, BRIDGE],
  ['Bridge→Arena', BRIDGE, { x: 2050, y: 340 }],
];

for (const [name, a, b] of routes) {
  if (reachable(a, b)) ok(`route ${name}`);
  else fail(`route ${name} unreachable`);
}

const dist = fs.readFileSync(path.join(root, 'src/game/world/WorldDistricts.ts'), 'utf8');
for (const id of ['west', 'spring_core', 'east', 'financial', 'arena_grounds']) {
  if (!dist.includes(`'${id}'`)) fail(`district ${id} missing`);
}
ok('five districts defined');

const nc = fs.readFileSync(path.join(root, 'src/game/world/NewCanonicalWorld.ts'), 'utf8');
const lm = [...nc.matchAll(/^\s{2}([a-z_]+):\s+\{\s*ix:/gm)].map(m => m[1]);
if (lm.length !== 20) fail(`expected 20 landmarks, found ${lm.length}`);
else ok('20 landmark anchors present');

const terrain = fs.readFileSync(path.join(root, 'src/game/worldEngine/WorldTerrainLayer.ts'), 'utf8');
if (!terrain.includes('main_rugtown.png')) fail('terrain not pointing at main_rugtown.png');
else ok('terrain loads main_rugtown.png');

console.log('\n--- Phase 10A validation ---');
console.log(`errors=${errors.length} warnings=${warnings.length} solids=${rects.length + circles.length}`);
if (errors.length) process.exit(1);

// ── Phase 10A.1 foot-collider fixtures ──────────────────────────
import { pathToFileURL } from 'url';

// Re-parse solids and test known points with a simulated foot AABB
const FOOT_W = 20, FOOT_H = 12, FOOT_OY = 12;
const WORLD_S = 2;
function footBlocked(bodyX, bodyY) {
  // body in world px; solids authored then scaled ×2 in geometry module —
  // here recreate world solids from image rects
  const bx = bodyX - FOOT_W / 2;
  const by = bodyY + FOOT_OY - FOOT_H / 2;
  for (const r of rects) {
    const sx = r.x * WORLD_S, sy = r.y * WORLD_S, sw = r.w * WORLD_S, sh = r.h * WORLD_S;
    if (!(bx + FOOT_W < sx || bx > sx + sw || by + FOOT_H < sy || by > sy + sh)) return r.id;
  }
  for (const c of circles) {
    const cx = c.x * WORLD_S, cy = c.y * WORLD_S, cr = c.r * WORLD_S;
    const px = Math.max(bx, Math.min(cx, bx + FOOT_W));
    const py = Math.max(by, Math.min(cy, by + FOOT_H));
    if ((cx - px) ** 2 + (cy - py) ** 2 <= cr * cr) return c.id;
  }
  return null;
}

// Building centres should block; road samples should clear
const buildingTests = [
  ['arena_core', 2086 * WORLD_S, 242 * WORLD_S, true],
  ['whale_area', 1636 * WORLD_S, 176 * WORLD_S, true],
  ['west_bldg', 240 * WORLD_S, 270 * WORLD_S, true],
  ['market_bldg', 1254 * WORLD_S, 240 * WORLD_S, true],
];
const roadTests = [
  ['spawn_road', 760 * WORLD_S, 352 * WORLD_S, false],
  ['bridge_deck', 1900 * WORLD_S, 380 * WORLD_S, false],
  ['spine_east', 1200 * WORLD_S, 320 * WORLD_S, false],
];

for (const [name, x, y, expectHit] of buildingTests) {
  const hit = footBlocked(x, y);
  if (expectHit && !hit) fail(`foot should hit building at ${name}`);
  else if (!expectHit && hit) fail(`foot should be clear at ${name} but hit ${hit}`);
  else ok(`foot fixture ${name} → ${hit ?? 'clear'}`);
}
for (const [name, x, y, expectHit] of roadTests) {
  const hit = footBlocked(x, y);
  if (expectHit && !hit) fail(`foot should hit at ${name}`);
  else if (!expectHit && hit) fail(`foot should be clear at ${name} but hit ${hit}`);
  else ok(`foot fixture ${name} → ${hit ?? 'clear'}`);
}

// Geometry / API presence (always required). Runtime enforcement is flagged separately.
const colSrc = fs.readFileSync(path.join(root, 'src/game/systems/CollisionSystem.ts'), 'utf8');
const sceneSrc = fs.readFileSync(path.join(root, 'src/game/scenes/WorldScene.ts'), 'utf8');
const scaleSrc = fs.readFileSync(path.join(root, 'src/game/world/WorldMapScale.ts'), 'utf8');
if (!colSrc.includes('FOOT_COLLIDER_W')) fail('FOOT_COLLIDER_W missing');
else ok('foot collider constants present (GEOMETRY DATA)');
if (!sceneSrc.includes('this.collision.resolveWalk(this.px, this.py')) fail('player path no longer calls resolveWalk');
else ok('player movement still routes through resolveWalk API');
if (!scaleSrc.includes('WORLD_COLLISION_ENABLED')) fail('WORLD_COLLISION_ENABLED flag missing');
else ok('WORLD_COLLISION_ENABLED flag present');

const runtimeOn = /export const WORLD_COLLISION_ENABLED = true/.test(scaleSrc);
const runtimeOff = /export const WORLD_COLLISION_ENABLED = false/.test(scaleSrc);
if (!runtimeOn && !runtimeOff) fail('WORLD_COLLISION_ENABLED must be boolean true|false');
else if (runtimeOff) {
  ok('RUNTIME COLLISION ENABLED = false (Phase 10B dormancy — solids not enforced)');
  if (!colSrc.includes('WORLD_COLLISION_ENABLED')) fail('CollisionSystem must honor WORLD_COLLISION_ENABLED');
  else ok('CollisionSystem gates solids behind WORLD_COLLISION_ENABLED');
} else {
  ok('RUNTIME COLLISION ENABLED = true');
}

const renderSrc = fs.readFileSync(path.join(root, 'src/game/render/HumanoidRenderer.ts'), 'utf8');
if (renderSrc.includes('PLAYER_VISUAL_SCALE = 2.0')) fail('player visual scale still 2.0');
else ok('player visual scale recalibrated');

if (!scaleSrc.includes('PLAYER_SPEED = 176')) fail('PLAYER_SPEED should be 176 after Phase 10B');
else ok('PLAYER_SPEED = 176');

if (errors.length) { console.error("10A.1/10B geometry checks failed"); process.exit(1); }
else console.log("OK  GEOMETRY DATA VALID — see RUNTIME COLLISION ENABLED line above");

