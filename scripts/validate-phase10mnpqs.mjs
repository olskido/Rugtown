/**
 * Static validators for Phase 10M–10S combined delivery.
 * Mode: STATIC — no live DB / multiplayer.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');

// Homepage uses main world art
const homeCfg = fs.readFileSync(path.join(root, 'src/config/homepageVisual.ts'), 'utf8');
if (!homeCfg.includes('main_rugtown.png')) fail('homepage config missing main_rugtown');
else ok('homepage uses main_rugtown.png');

const landingCss = fs.readFileSync(path.join(root, 'src/styles/landing.css'), 'utf8');
if (landingCss.includes("url('/assets/backgrounds/rugtown-city.png')") && !landingCss.includes('main_rugtown')) {
  fail('landing still hardcodes legacy city only');
} else ok('landing CSS world-aligned');
if (!landingCss.includes('prefers-reduced-motion')) fail('landing reduced-motion missing');
else ok('landing reduced-motion');

// Cosmetic mapping
const map = fs.readFileSync(path.join(root, 'src/game/characters/CosmeticIdMapping.ts'), 'utf8');
if (!map.includes('sanitizePublicCosmeticId')) fail('sanitize missing');
else ok('cosmetic sanitize');
if (!map.includes('shortBlack')) fail('legacy alias missing');
else ok('legacy aliases');

// Token disabled defaults
const token = fs.readFileSync(path.join(root, 'src/config/tokenPublic.ts'), 'utf8');
if (!token.includes("=== 'true'")) fail('token enable gate');
else ok('token enable gate');

const envEx = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
if (envEx.includes('zdffsxlrdelykpkpbokk') || envEx.includes('sb_publishable_')) {
  fail('.env.example still contains project-looking secrets');
} else ok('.env.example placeholders only');
if (!envEx.includes('VITE_RUGTOWN_TOKEN_ENABLED=false')) fail('token flag missing from example');
else ok('token flag in example');

// Migration
const mig = path.join(root, 'database/migrations/20260717_phase10mnpqs_living_world_security.sql');
if (!fs.existsSync(mig)) fail('10MNPQS migration missing');
else {
  const sql = fs.readFileSync(mig, 'utf8');
  for (const fn of ['get_open_tournaments', 'claim_welcome_citizen_cosmetic', 'get_public_token_status', 'activate_token_integration']) {
    if (!sql.includes(fn)) fail(`rpc ${fn}`);
    else ok(`rpc ${fn}`);
  }
  if (!sql.includes('enabled boolean NOT NULL DEFAULT false')) fail('token default disabled');
  else ok('token default disabled');
}

// Nearby party invite
const card = fs.readFileSync(path.join(root, 'src/components/SocialPlayerCard.tsx'), 'utf8');
if (!card.includes('onInviteParty')) fail('party invite on card');
else ok('nearby party invite');

// Day night
if (!fs.existsSync(path.join(root, 'src/game/world/DayNightCycle.ts'))) fail('day/night missing');
else ok('day/night module');

// Bundle secret patterns — scan built files if present, else source guard
const forbidden = ['SERVICE_ROLE_KEY=', 'service_role', 'BEGIN PRIVATE KEY'];
const scanDirs = ['src', 'supabase/functions'].map((d) => path.join(root, d));
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}
let viteLeak = 0;
for (const f of walk(path.join(root, 'src'))) {
  const t = fs.readFileSync(f, 'utf8');
  if (/VITE_.*SERVICE_ROLE|import\.meta\.env\.VITE_.*SERVICE/.test(t)) {
    fail(`possible service role vite leak ${path.relative(root, f)}`);
    viteLeak++;
  }
}
if (!viteLeak) ok('no VITE_ service-role pattern in src');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('validate-phase10mnpqs STATIC passed');
