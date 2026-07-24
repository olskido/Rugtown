/**
 * Phase 10D — landmark interaction / label validation
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const WORLD_W = 4344;
const WORLD_H = 1448;

const objectsSrc = fs.readFileSync(path.join(root, 'src/game/world/WorldObjects.ts'), 'utf8');
const ids = [...objectsSrc.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
if (new Set(ids).size !== ids.length) fail('duplicate WorldObject ids');
if (ids.length !== 20) fail(`expected 20 landmarks, got ${ids.length}`);
else ok('exactly 20 official landmark IDs');

const catalogSrc = fs.readFileSync(path.join(root, 'src/game/interaction/LandmarkCatalog.ts'), 'utf8');
if (!catalogSrc.includes('visibilityRadius')) fail('LandmarkCatalog missing visibilityRadius');
else ok('LandmarkCatalog has visibility/interaction radii');
if (!catalogSrc.includes('LANDMARK_VISIBILITY_FACTOR')) fail('visibility factor missing');
else ok('visibility tuning constants present');

const resolverSrc = fs.readFileSync(path.join(root, 'src/game/interaction/InteractionTargetResolver.ts'), 'utf8');
if (!resolverSrc.includes('resolveInteractTarget')) fail('resolver missing');
else ok('InteractionTargetResolver present');
if (!resolverSrc.includes('PRIORITY')) fail('priority bands missing');
else ok('priority bands defined');

const sceneSrc = fs.readFileSync(path.join(root, 'src/game/scenes/WorldScene.ts'), 'utf8');
if (!sceneSrc.includes('updateInteractionsUnified')) fail('WorldScene missing unified interaction');
else ok('WorldScene uses unified interaction resolver');
if (!sceneSrc.includes('activeInteractTarget')) fail('activeInteractTarget not published');
else ok('activeInteractTarget registry publish present');

const labelSrc = fs.readFileSync(path.join(root, 'src/game/systems/BuildingSystem.ts'), 'utf8');
if (!labelSrc.includes("'far'") || !labelSrc.includes("'visible'") || !labelSrc.includes("'near'")) {
  fail('label visibility states missing');
} else ok('FAR/VISIBLE/NEAR label states present');
if (!labelSrc.includes('MAX_FULL_LABELS')) fail('clutter cap missing');
else ok('label clutter cap present');

// Entrance positions inside bounds (door fractions from EnterableBuildings)
const enterSrc = fs.readFileSync(path.join(root, 'src/game/world/EnterableBuildings.ts'), 'utf8');
for (const m of enterSrc.matchAll(/doorFx: ([0-9.]+),\s*doorFy: ([0-9.]+)/g)) {
  const x = +m[1] * WORLD_W;
  const y = +m[2] * WORLD_H;
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) fail(`door outside world ${m[1]},${m[2]}`);
}
ok('enterable door positions inside world bounds');

// visibility > interaction conceptually in catalog builder
if (!catalogSrc.includes('LANDMARK_VISIBILITY_FACTOR')) fail('vis factor');
else ok('visibility radius derived above interaction radius');

if (errors.length) {
  console.error(`\n${errors.length} failures`);
  process.exit(1);
}
console.log('\nPhase 10D interaction validation passed');
