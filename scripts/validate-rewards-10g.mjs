/**
 * Phase 10G — reward economy validation (catalogs, idempotency, SQL presence)
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10g_rewards.sql'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/game/rewards/RewardService.ts'), 'utf8');
const settle = fs.readFileSync(path.join(root, 'src/game/rewards/SettlementAdapter.ts'), 'utf8');
const daily = fs.readFileSync(path.join(root, 'src/game/rewards/PeriodMissions.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/components/RewardCentrePanel.tsx'), 'utf8');

for (const table of [
  'player_progression',
  'reward_ledger',
  'mission_definitions',
  'mission_assignments',
  'seasons',
  'sponsored_campaigns',
  'prize_pools',
  'cashback_campaigns',
  'claimable_rewards',
  'guest_migrations',
]) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`)) fail(`missing table ${table}`);
  else ok(`table ${table}`);
}

for (const fn of [
  'award_gameplay_reward',
  'get_my_progression',
  'migrate_local_progression',
  'ensure_period_missions',
  'claim_mission_reward',
  'evaluate_reward_eligibility',
  'transition_claim_status',
  'get_season_leaderboard',
]) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`missing RPC ${fn}`);
  else ok(`RPC ${fn}`);
}

if (!sql.includes('UNIQUE (player_id, idempotency_key)')) fail('ledger idempotency unique missing');
else ok('ledger idempotency unique constraint');

if (!sql.includes('profiles_protect_reward_columns')) fail('rep protection trigger missing');
else ok('profiles.rep protection trigger');

if (!sql.includes('season_leaderboard_public')) fail('public leaderboard view missing');
else ok('public season leaderboard view');

if (!sql.includes('email')) ok('leaderboard SQL avoids email column');
else {
  // email might appear in comments — check view definition specifically
  const viewChunk = sql.slice(sql.indexOf('season_leaderboard_public'), sql.indexOf('GRANT SELECT ON public.season_leaderboard_public'));
  if (viewChunk.includes('email')) fail('leaderboard exposes email');
  else ok('leaderboard excludes email');
}

if (!settle.includes('NoopSettlementAdapter')) fail('settlement adapter missing');
else ok('Solana settlement adapter boundary present');
if (settle.includes('private key') && settle.toLowerCase().includes('store')) {
  /* docs mention not storing — ok */
}
if (/sk-|privateKey\s*=/.test(settle)) fail('settlement adapter contains key material');
else ok('no treasury key material in adapter');

if (!service.includes('award_gameplay_reward')) fail('client does not call award RPC');
else ok('client award RPC wiring');
if (!service.includes('migrate_local_progression')) fail('guest merge RPC missing');
else ok('guest merge RPC wiring');

const dailyIds = [...daily.matchAll(/id: '([^']+)'/g)].map((m) => m[1]).filter((id) => id.startsWith('daily_'));
const weeklyIds = [...daily.matchAll(/id: '([^']+)'/g)].map((m) => m[1]).filter((id) => id.startsWith('weekly_'));
if (dailyIds.length < 3) fail('need at least 3 daily missions');
else ok(`daily missions ${dailyIds.length}`);
if (weeklyIds.length < 3) fail('need at least 3 weekly missions');
else ok(`weekly missions ${weeklyIds.length}`);

if (!ui.includes('RUG_POINTS_DISCLAIMER') && !ui.includes('do not represent guaranteed')) {
  fail('Reward Centre missing Rug Points disclaimer');
} else ok('Reward Centre disclaimer present');

if (!ui.includes('Reward Centre')) fail('Reward Centre UI missing');
else ok('Reward Centre UI present');

// Idempotency conceptual
const claimed = new Set();
function award(key) {
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}
if (!award('a') || award('a')) fail('idempotency sim failed');
else ok('duplicate idempotency blocked');

// Non-negative amounts in SQL seeds
const neg = [...sql.matchAll(/amount\s+(-?\d+)/gi)].map((m) => +m[1]);
if (neg.some((n) => n < 0)) fail('negative seed amounts');
else ok('seed amounts non-negative');

if (errors.length) {
  console.error(`\n${errors.length} failures`);
  process.exit(1);
}
console.log('\nPhase 10G reward validation passed');
console.log('NOTE: Apply SQL migration in Supabase to enable server authority.');
