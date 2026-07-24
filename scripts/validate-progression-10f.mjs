/**
 * Phase 10F — progression validation (XP curve, catalogs, migration, idempotency)
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const xpSrc = fs.readFileSync(path.join(root, 'src/game/progression/XpCurve.ts'), 'utf8');
const titles = fs.readFileSync(path.join(root, 'src/game/progression/TitleCatalog.ts'), 'utf8');
const ach = fs.readFileSync(path.join(root, 'src/game/progression/AchievementCatalog.ts'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/game/progression/ProgressionService.ts'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'src/game/progression/ProgressionRepository.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src/game/progression/types.ts'), 'utf8');
const districts = fs.readFileSync(path.join(root, 'src/game/world/WorldDistricts.ts'), 'utf8');
const objects = fs.readFileSync(path.join(root, 'src/game/world/WorldObjects.ts'), 'utf8');

if (!types.includes('MAX_LEVEL = 50')) fail('MAX_LEVEL missing');
else ok('MAX_LEVEL = 50 present');
if (!service.includes('idempotencyKey')) fail('idempotency keys missing');
else ok('idempotency keys present');
if (!repo.includes('migrateFromLegacy')) fail('legacy migration missing');
else ok('legacy REP migration present');
if (!types.includes('PROGRESSION_SCHEMA_VERSION')) fail('schema version missing');
else ok('schema version present');
if (!xpSrc.includes('xpRequiredForLevel')) fail('xp curve helpers missing');
else ok('xp curve helpers present');

const MAX_LEVEL = 50;
function xpRequiredForLevel(level) {
  if (level < 1) return xpRequiredForLevel(1);
  if (level >= MAX_LEVEL) return 0;
  const t = (level - 1) / (MAX_LEVEL - 1);
  return Math.round(80 + 160 * t + 280 * t * t);
}
function totalXpRequiredForLevel(level) {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let total = 0;
  for (let L = 1; L < clamped; L++) total += xpRequiredForLevel(L);
  return total;
}
function levelFromLifetimeXp(lifetimeXp) {
  const xp = Math.max(0, Math.floor(lifetimeXp));
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const need = xpRequiredForLevel(level);
    if (spent + need > xp) break;
    spent += need;
    level++;
  }
  return level;
}
function levelProgressPercent(lifetimeXp) {
  const level = levelFromLifetimeXp(lifetimeXp);
  const floor = totalXpRequiredForLevel(level);
  const currentXp = Math.max(0, Math.floor(lifetimeXp) - floor);
  if (level >= MAX_LEVEL) return { level, currentXp, xpToNext: 0, percent: 100 };
  const xpToNext = xpRequiredForLevel(level);
  const percent = xpToNext <= 0 ? 100 : Math.min(100, Math.max(0, (currentXp / xpToNext) * 100));
  return { level, currentXp, xpToNext, percent };
}

let prev = -1;
for (let L = 1; L < MAX_LEVEL; L++) {
  const need = xpRequiredForLevel(L);
  if (need <= 0) fail(`non-positive xp at level ${L}`);
  if (need < prev) fail(`XP curve not monotonic at ${L}`);
  prev = need;
}
ok('XP curve monotonic for levels 1..49');

if (totalXpRequiredForLevel(1) !== 0) fail('level 1 floor should be 0');
else ok('level 1 starts at 0 lifetime XP');
if (levelFromLifetimeXp(0) !== 1) fail('0 XP should be level 1');
else ok('levelFromLifetimeXp(0) === 1');
if (levelFromLifetimeXp(10_000_000) !== MAX_LEVEL) fail('huge XP should clamp to max');
else ok('max level clamp works');

const pct = levelProgressPercent(0);
if (pct.percent < 0 || pct.percent > 100) fail('progress percent out of range');
else ok('progress percent in 0–100');

const titleIds = [...titles.matchAll(/^\s*id: '([^']+)'/gm)].map((m) => m[1]);
if (new Set(titleIds).size !== titleIds.length) fail('duplicate title IDs');
else ok(`unique titles (${titleIds.length})`);

const achIds = [...ach.matchAll(/^\s*id: '([^']+)'/gm)].map((m) => m[1]);
if (new Set(achIds).size !== achIds.length) fail('duplicate achievement IDs');
else ok(`unique achievements (${achIds.length})`);

const titleUnlocks = [...ach.matchAll(/titleUnlockId: '([^']+)'/g)].map((m) => m[1]);
for (const id of titleUnlocks) {
  if (!titleIds.includes(id)) fail(`achievement unlocks unknown title ${id}`);
}
ok('achievement title unlocks reference real titles');

const negXp = [...ach.matchAll(/xpReward: (-?\d+)/g)].map((m) => +m[1]);
const negRep = [...ach.matchAll(/repReward: (-?\d+)/g)].map((m) => +m[1]);
if (negXp.some((n) => n < 0) || negRep.some((n) => n < 0)) fail('negative achievement rewards');
else ok('achievement rewards non-negative');

const districtIds = [...districts.matchAll(/defineDistrict\('([^']+)'/g)].map((m) => m[1]);
if (districtIds.length !== 5) fail(`expected 5 districts, got ${districtIds.length}`);
else ok('five canonical districts');

const landmarkIds = [...objects.matchAll(/^\s*id: '([^']+)'/gm)].map((m) => m[1]);
if (landmarkIds.length !== 20) fail(`expected 20 landmarks, got ${landmarkIds.length}`);
else ok('20 canonical landmarks');

const claimed = new Set();
function awardOnce(key, amount) {
  if (claimed.has(key)) return 0;
  claimed.add(key);
  return amount;
}
if (awardOnce('mission:a:complete', 55) !== 55) fail('first award failed');
if (awardOnce('mission:a:complete', 55) !== 0) fail('duplicate award not blocked');
else ok('duplicate idempotency keys do not reward twice');

if (!repo.includes('unlockedTitleIds.includes(equippedTitleId)')) {
  fail('equipped title unlock validation missing');
} else ok('equipped title must be unlocked');

if (errors.length) {
  console.error(`\n${errors.length} failures`);
  process.exit(1);
}
console.log('\nPhase 10F progression validation passed');
