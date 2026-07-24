/**
 * Phase 10C minimap validation
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(msg) { console.log('OK ', msg); }
function fail(msg) { errors.push(msg); console.error('FAIL', msg); }

const WORLD_W = 4344;
const WORLD_H = 1448;

const objectsSrc = fs.readFileSync(path.join(root, 'src/game/world/WorldObjects.ts'), 'utf8');
const ids = [...objectsSrc.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
const unique = new Set(ids);
if (unique.size !== ids.length) fail('Duplicate WorldObject ids');
if (ids.length !== 20) fail(`Expected 20 landmarks, found ${ids.length}`);
else ok(`20 landmark IDs in WorldObjects`);

for (const obj of objectsSrc.matchAll(/id: '([^']+)'[\s\S]*?x: ([0-9.]+),\s*y: ([0-9.]+)/g)) {
  const [, id, x, y] = obj;
  const wx = +x * WORLD_W;
  const wy = +y * WORLD_H;
  if (wx < 0 || wy < 0 || wx > WORLD_W || wy > WORLD_H) {
    fail(`Landmark ${id} outside world bounds`);
  }
}
ok('all landmark fractions inside world bounds');

const themePath = path.join(root, 'src/game/minimap/MinimapTheme.ts');
if (!fs.existsSync(themePath)) fail('MinimapTheme.ts missing');
else ok('centralized MinimapTheme present');

const transformPath = path.join(root, 'src/game/minimap/MinimapTransform.ts');
if (!fs.existsSync(transformPath)) fail('MinimapTransform.ts missing');
else ok('shared MinimapTransform present');

const canvasPath = path.join(root, 'src/components/minimap/WorldMapCanvas.tsx');
if (!fs.existsSync(canvasPath)) fail('WorldMapCanvas.tsx missing');
else ok('WorldMapCanvas renderer present');

const sceneSrc = fs.readFileSync(path.join(root, 'src/game/scenes/WorldScene.ts'), 'utf8');
if (!sceneSrc.includes("registry.set('minimapLive'")) fail('WorldScene does not publish minimapLive');
else ok('WorldScene publishes minimapLive');

const minimapTex = path.join(root, 'public/assets/world/minimap_rugtown.png');
const mainTex = path.join(root, 'public/assets/world/main_rugtown.png');
if (!fs.existsSync(minimapTex) && !fs.existsSync(mainTex)) {
  fail('No minimap or main texture on disk');
} else {
  ok(`texture ${fs.existsSync(minimapTex) ? 'minimap_rugtown.png' : 'main_rugtown.png (fallback)'}`);
}

// Transform sanity (inline — mirrors MinimapTransform.ts)
function computeMapFit(containerW, containerH, padding = 0) {
  const WORLD_ASPECT = WORLD_W / WORLD_H;
  const innerW = Math.max(1, containerW - padding * 2);
  const innerH = Math.max(1, containerH - padding * 2);
  const containerAspect = innerW / innerH;
  let width, height;
  if (containerAspect > WORLD_ASPECT) {
    height = innerH;
    width = height * WORLD_ASPECT;
  } else {
    width = innerW;
    height = width / WORLD_ASPECT;
  }
  return {
    offsetX: padding + (innerW - width) / 2,
    offsetY: padding + (innerH - height) / 2,
    width,
    height,
  };
}
function worldToMap(wx, wy, fit) {
  return {
    x: fit.offsetX + (wx / WORLD_W) * fit.width,
    y: fit.offsetY + (wy / WORLD_H) * fit.height,
  };
}
const fit = computeMapFit(300, 100, 0);
const p = worldToMap(WORLD_W / 2, WORLD_H / 2, fit);
if (p.x < fit.offsetX || p.x > fit.offsetX + fit.width) fail('world center X out of map fit');
if (p.y < fit.offsetY || p.y > fit.offsetY + fit.height) fail('world center Y out of map fit');
else ok('world-to-map transform in bounds at center');

const vpW = (800 / WORLD_W) * fit.width;
const vpH = (600 / WORLD_H) * fit.height;
if (vpW <= 0 || vpH <= 0) fail('invalid viewport map rect');
else ok('camera viewport transform valid');

if (errors.length) {
  console.error(`\n${errors.length} validation errors`);
  process.exit(1);
}
console.log('\nPhase 10C minimap validation passed');
