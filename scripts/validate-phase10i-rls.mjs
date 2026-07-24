/**
 * Phase 10I — RLS boundary checks (static).
 * Live database RLS tests are NOT performed here.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
const ok = (m) => console.log('OK  ', m);
const fail = (m) => { errors.push(m); console.error('FAIL', m); };
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql'), 'utf8');

const ownerReadOnly = [
  ['player_achievement_progress', 'ach_progress: owner read'],
  ['player_achievements', 'player_achievements: owner read'],
  ['player_titles', 'player_titles: owner read'],
  ['player_season_pass', 'player_season_pass: owner read'],
  ['season_pass_reward_claims', 'pass_claims: owner read'],
  ['player_entitlements', 'entitlements: owner read'],
  ['player_progression_history', 'prog_history: owner read'],
];
for (const [t, label] of ownerReadOnly) {
  if (!sql.includes(label)) fail(`missing owner-read policy for ${t} (expected "${label}")`);
  else ok(`owner-read: ${t}`);
}

if (sql.includes('achievement_definitions: public catalog')) ok('public catalog policy');
else fail('public catalog policy missing');

if (!/CREATE POLICY[^;]*achievement_rule_versions[^;]*is_secret = false/i.test(sql) &&
    !sql.includes('d.is_secret = false')) {
  fail('rule versions must hide secret configs');
} else ok('secret rule configs filtered');

if (errors.length) { console.error(`\n${errors.length} failures`); process.exit(1); }
console.log('\nPhase 10I RLS static validation passed');
console.log('LIVE DB TESTS NOT PERFORMED');
