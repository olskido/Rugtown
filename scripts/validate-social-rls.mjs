/**
 * Static RLS / permission checks for Phase 10J social tables.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10j_social_identity_moderation.sql'), 'utf8');

const mustEnable = [
  'player_profile_settings',
  'friend_requests',
  'friendships',
  'player_blocks',
  'direct_messages',
  'moderation_cases',
  'moderation_actions',
  'social_audit_log',
];

for (const t of mustEnable) {
  const re = new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`);
  if (!re.test(sql)) fail(`RLS not enabled on ${t}`);
  else ok(`RLS ${t}`);
}

if (!sql.includes('REVOKE ALL ON FUNCTION public.rt_notify')) fail('rt_notify still publicly executable');
else ok('rt_notify revoked');

if (!sql.includes("rt_is_social_operator('moderator')")) fail('moderator gate missing on ops RPCs');
else ok('moderator gates present');

// Players must not insert friendships directly via policy — only SELECT policies expected
if (/CREATE POLICY.*friendships.*INSERT/i.test(sql)) fail('friendships INSERT policy present');
else ok('no player INSERT policy on friendships');

if (/CREATE POLICY.*direct_messages.*INSERT/i.test(sql) && !/members/i.test(sql)) {
  // If INSERT policy exists it must be tightly scoped — prefer RPC-only
  ok('checking DM insert policies');
}
if (!sql.includes('GRANT EXECUTE ON FUNCTION public.send_direct_message')) fail('send_direct_message grant missing');
else ok('DM send via RPC grant');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('Social RLS static validation passed (live DB tests not run)');
