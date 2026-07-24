/**
 * Static presence privacy validation.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10j_social_identity_moderation.sql'), 'utf8');
const svc = fs.readFileSync(path.join(root, 'src/lib/social/SocialService.ts'), 'utf8');

if (!sql.includes('presence_preferences')) fail('presence_preferences missing');
else ok('presence_preferences');

if (!sql.includes('get_visible_presence')) fail('get_visible_presence missing');
else ok('get_visible_presence');

const vis = sql.slice(sql.indexOf('FUNCTION public.get_visible_presence'), sql.indexOf('FUNCTION public.apply_moderation_action'));
if (!vis.includes("pref.visibility = 'nobody'") || !vis.includes("'offline'")) {
  fail('hidden presence must appear offline');
} else ok('hidden/nobody presence returns offline');

if (vis.includes('last_heartbeat_at') && vis.includes('jsonb_build_object') && /'lastHeartbeat'/.test(vis)) {
  fail('exact heartbeat exposed in public presence');
} else ok('exact heartbeat not in public presence payload');

if (!svc.includes('heartbeatPresence') || !svc.includes('25_000')) fail('client heartbeat debounce missing');
else ok('client heartbeat debounce');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('Presence privacy static validation passed');
