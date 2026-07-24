/**
 * Static validation — Phase 10J social schema migration.
 * Does not require a live database.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const migPath = path.join(root, 'database/migrations/20260716_phase10j_social_identity_moderation.sql');
if (!fs.existsSync(migPath)) fail('migration missing');
else ok('migration file present');

const sql = fs.readFileSync(migPath, 'utf8');

const tables = [
  'player_profile_settings',
  'username_history',
  'player_profile_showcases',
  'friend_requests',
  'friendships',
  'player_blocks',
  'conversation_threads',
  'conversation_members',
  'direct_messages',
  'message_requests',
  'message_reads',
  'presence_preferences',
  'player_presence_state',
  'player_reports',
  'message_reports',
  'moderation_cases',
  'moderation_actions',
  'moderation_notes',
  'moderation_evidence',
  'chat_rate_limits',
  'social_audit_log',
  'social_analytics_events',
  'social_operational_alerts',
  'social_operators',
];

for (const t of tables) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`table ${t} missing`);
  else ok(`table ${t}`);
}

const rpcs = [
  'check_username_availability',
  'update_player_username',
  'get_public_player_profile',
  'search_public_players',
  'send_friend_request',
  'respond_to_friend_request',
  'get_my_friends',
  'block_player',
  'unblock_player',
  'get_or_create_direct_conversation',
  'send_direct_message',
  'get_conversation_messages',
  'mark_conversation_read',
  'get_unread_dm_count',
  'report_player',
  'report_message',
  'heartbeat_presence',
  'get_visible_presence',
  'apply_moderation_action',
  'update_privacy_settings',
  'rt_safety_check_message',
  'run_social_maintenance',
];

for (const fn of rpcs) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`rpc ${fn} missing`);
  else ok(`rpc ${fn}`);
}

if (!sql.includes('ENABLE ROW LEVEL SECURITY')) fail('RLS enable missing');
else ok('RLS enabled on social tables');

if (!sql.includes('REVOKE ALL ON FUNCTION public.rt_notify')) fail('rt_notify not revoked from PUBLIC');
else ok('rt_notify execute revoked from PUBLIC');

if (!sql.includes("message_policy") || !sql.includes("friends_only")) fail('conservative message defaults missing');
else ok('friends_only messaging default present');

if (!sql.includes('uq_friendship_active_pair')) fail('canonical friendship unique missing');
else ok('canonical friendship unique index');

if (!sql.includes('client_message_id')) fail('DM idempotency key missing');
else ok('DM client_message_id present');

if (!sql.includes('ON CONFLICT (blocker_id, blocked_id) WHERE unblocked_at IS NULL')) {
  fail('block partial unique conflict target missing');
} else ok('block ON CONFLICT uses partial unique index');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('Phase 10J social schema static validation passed');
