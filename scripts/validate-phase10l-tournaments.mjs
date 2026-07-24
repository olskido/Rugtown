/**
 * Static validation — Phase 10L tournaments.
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
  'tournament_definitions', 'tournament_instances', 'tournament_registrations',
  'tournament_rounds', 'tournament_scores', 'tournament_standings',
  'tournament_reward_allocations', 'tournament_disputes',
];
for (const t of tables) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`table ${t}`);
  else ok(`table ${t}`);
}
for (const fn of [
  'register_for_tournament', 'submit_tournament_score', 'get_tournament_standings',
  'finalize_tournament_results', 'file_tournament_dispute', 'claim_tournament_reward',
]) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`rpc ${fn}`);
  else ok(`rpc ${fn}`);
}
if (!sql.includes('test-explorer-score-challenge')) fail('TEST tournament seed');
else ok('TEST tournament seed');
if (!sql.includes('trusted score unavailable')) fail('receipt gate on scores');
else ok('scores require trusted receipts');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-phase10l-tournaments STATIC passed');
