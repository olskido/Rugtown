/**
 * Static validation — Phase 10L event rewards use ledger path.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql'), 'utf8');

if (!sql.includes('claim_world_event_reward')) fail('claim rpc');
else ok('claim_world_event_reward');
if (!sql.includes("INSERT INTO public.reward_ledger")) fail('ledger insert');
else ok('reward_ledger path');
if (!sql.includes("asset_type text NOT NULL CHECK(asset_type IN('XP','REP','RUG_POINTS'))")) fail('in-game assets only');
else ok('XP/REP/RUG_POINTS only on event allocations');
if (/SOL|SPL|lamports/i.test(sql) && sql.includes('world_event_reward')) {
  // soft: fail if event reward section mentions SOL as asset
  if (sql.match(/world_event_reward_allocations[\s\S]{0,400}SOL/)) fail('SOL in event rewards');
}
ok('no SOL/SPL event reward asset types');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-phase10l-event-rewards STATIC passed');
