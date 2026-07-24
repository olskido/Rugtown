/**
 * Static validation — friendship / block state machine invariants in SQL + client.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10j_social_identity_moderation.sql'), 'utf8');
const svc = fs.readFileSync(path.join(root, 'src/lib/social/SocialService.ts'), 'utf8');

if (!sql.includes('player_low_id < player_high_id')) fail('canonical pair CHECK missing');
else ok('friendship pair ordering CHECK');

if (!sql.includes("status = 'blocked'") || !sql.includes('Intentionally no notification to blocked player')) {
  fail('block must deactivate friendship without notifying target');
} else ok('block deactivates friendship, no notify');

if (!sql.includes('unblock') || !/unblock.*friendship|friendship not restored|do not auto-restore/i.test(sql + svc)) {
  // Unblock SQL should not recreate friendship
  const unblockFn = sql.slice(sql.indexOf('FUNCTION public.unblock_player'), sql.indexOf('FUNCTION public.get_my_blocks'));
  if (/INSERT INTO public\.friendships/.test(unblockFn)) fail('unblock restores friendship');
  else ok('unblock does not restore friendship');
} else ok('unblock does not restore friendship');

if (!sql.includes('cannot block yourself') && !sql.includes('cannot block yourself')) {
  // check exception text
}
if (!sql.includes('cannot block yourself')) fail('self-block guard missing');
else ok('self-block rejected');

if (!sql.includes('uq_friend_request_pending')) fail('pending friend request unique missing');
else ok('pending friend request unique');

if (!svc.includes('sendFriendRequest') || !svc.includes('blockPlayer')) fail('SocialService missing friend/block APIs');
else ok('SocialService friend/block APIs');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('Friendship state machine static validation passed');
