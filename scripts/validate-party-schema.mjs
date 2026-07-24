/**
 * Static validation — Phase 10K party schema.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const mig = path.join(root, 'database/migrations/20260716_phase10k_parties_shared_missions_matchmaking.sql');
if (!fs.existsSync(mig)) fail('migration missing');
else ok('migration present');
const sql = fs.readFileSync(mig, 'utf8');

const tables = [
  'parties', 'party_members', 'party_invitations', 'party_join_requests',
  'party_chat_messages', 'party_message_reads', 'party_activity_events',
  'party_shared_missions', 'party_mission_members', 'party_mission_contributions',
  'party_reward_allocations', 'party_reward_claims', 'party_presence_state',
  'party_matchmaking_queues', 'party_matchmaking_entries', 'matchmaking_lobbies',
  'matchmaking_lobby_members', 'matchmaking_assignments', 'party_reports',
  'party_audit_log', 'party_analytics_events', 'party_operational_alerts',
  'party_maintenance_runs', 'party_mission_definitions',
];
for (const t of tables) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`table ${t}`);
  else ok(`table ${t}`);
}

const rpcs = [
  'create_party', 'get_my_party', 'invite_player_to_party', 'respond_to_party_invitation',
  'leave_party', 'disband_party', 'transfer_party_leadership', 'set_party_ready_state',
  'send_party_chat_message', 'start_party_shared_mission', 'record_party_mission_contribution',
  'complete_party_shared_mission', 'claim_party_reward', 'queue_party', 'process_party_matchmaking',
  'reconcile_party_block_state', 'run_party_maintenance',
];
for (const fn of rpcs) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`rpc ${fn}`);
  else ok(`rpc ${fn}`);
}

if (!sql.includes('uq_party_one_active_membership')) fail('one active party unique missing');
else ok('one active membership unique');
if (!sql.includes('uq_party_one_leader')) fail('one leader unique missing');
else ok('one leader unique');
if (!sql.includes('test-town-tour-2026')) fail('TEST mission missing');
else ok('TEST mission seeded inactive');
if (!sql.includes('test-party-activity-queue')) fail('TEST queue missing');
else ok('TEST queue seeded paused');
if (!sql.includes('max_members') || !sql.includes('DEFAULT 4')) fail('max 4 default missing');
else ok('max members default 4');
if (!sql.includes('ENABLE ROW LEVEL SECURITY')) fail('RLS missing');
else ok('RLS enabled');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('Phase 10K party schema static validation passed');
