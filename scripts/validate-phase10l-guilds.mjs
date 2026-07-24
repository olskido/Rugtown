/**
 * Static validation — Phase 10L guilds.
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
  'guilds', 'guild_members', 'guild_invitations', 'guild_join_requests',
  'guild_chat_messages', 'guild_message_reads', 'guild_announcements',
  'guild_reports', 'guild_audit_log',
];
for (const t of tables) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`table ${t}`);
  else ok(`table ${t}`);
}
for (const fn of [
  'create_guild', 'invite_to_guild', 'respond_to_guild_invitation', 'get_my_guild',
  'leave_guild', 'send_guild_chat_message', 'report_guild', 'disband_guild',
  'reconcile_guild_ownership', 'run_guild_maintenance',
]) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`rpc ${fn}`);
  else ok(`rpc ${fn}`);
}
if (!sql.includes('uq_guild_one_active_membership')) fail('one guild membership');
else ok('one active membership');
if (!sql.includes("DEFAULT 'invite_only'")) fail('invite_only default');
else ok('invite_only default');
if (!sql.includes('rt_safety_check_message')) fail('guild chat safety');
else ok('guild chat uses safety pipeline');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-phase10l-guilds STATIC passed');
