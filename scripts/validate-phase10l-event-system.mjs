/**
 * Static validation — Phase 10L world events schema.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql'), 'utf8');

const tables = [
  'world_event_definitions', 'world_event_schedules', 'world_event_instances',
  'world_event_objectives', 'world_event_participants', 'world_event_contributions',
  'world_event_reward_allocations', 'world_event_reward_claims', 'world_event_announcements',
];
for (const t of tables) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`table ${t}`);
  else ok(`table ${t}`);
}

const rpcs = [
  'transition_world_event_state', 'schedule_world_event', 'register_for_world_event',
  'record_world_event_contribution', 'evaluate_world_event_instance',
  'get_active_world_events', 'claim_world_event_reward', 'run_world_event_maintenance',
];
for (const fn of rpcs) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`rpc ${fn}`);
  else ok(`rpc ${fn}`);
}

for (const id of ['test-town-tour-event', 'test-market-rush', 'test-community-milestone']) {
  if (!sql.includes(id)) fail(`seed ${id}`);
  else ok(`seed ${id}`);
}
if (!sql.includes("trusted receipt required")) fail('receipt-gated contributions');
else ok('contributions require accepted receipts');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-phase10l-event-system STATIC passed');
