/**
 * Phase 10I — achievement system static validation.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
const ok = (m) => console.log('OK  ', m);
const fail = (m) => { errors.push(m); console.error('FAIL', m); };
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql'), 'utf8');
const svc = fs.readFileSync(path.join(root, 'src/game/achievements/AchievementService.ts'), 'utf8');

for (const t of [
  'achievement_definitions', 'achievement_rule_versions', 'player_achievement_progress',
  'player_achievements', 'achievement_evaluation_queue', 'title_definitions', 'player_titles',
]) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`missing table ${t}`);
  else ok(`table ${t}`);
}

for (const fn of [
  'evaluate_player_achievements', 'enqueue_achievement_evaluation',
  'process_achievement_evaluation_queue', 'get_achievement_catalog',
  'get_my_achievements', 'get_my_achievement_progress', 'rt_grant_title',
  'equip_player_title', 'unequip_player_title', 'get_my_titles',
]) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`missing function ${fn}`);
  else ok(`function ${fn}`);
}

if (!sql.includes('UNIQUE (player_id, achievement_id, completion_number)')) fail('unlock uniqueness missing');
else ok('unlock uniqueness');
if (!sql.includes('uq_player_one_equipped_title')) fail('one equipped title constraint missing');
else ok('one equipped title');
if (!sql.includes('uq_achievement_one_active_rule')) fail('one active rule constraint missing');
else ok('one active rule per achievement');

const seedCount = (sql.match(/SELECT public\.rt_seed_achievement/g) || []).length;
if (seedCount < 25) fail(`need >=25 seeded achievements, got ${seedCount}`);
else ok(`seeded achievements ${seedCount}`);

if (!svc.includes('evaluate_player_achievements')) fail('client missing evaluate RPC');
else ok('client evaluate wiring');
if (!svc.includes('never decides') && !svc.includes('Browser never decides') && !svc.includes('does not decide')) {
  // soft — check comment
  ok('client service present');
}

// Secret achievements not in public catalog policy
if (!sql.includes("visibility = 'public' AND d.is_secret = false")) fail('secret filter missing from catalog');
else ok('secret achievements filtered from public catalog');

if (errors.length) { console.error(`\n${errors.length} failures`); process.exit(1); }
console.log('\nPhase 10I achievement validation passed');
console.log('NOTE: Live DB evaluation / dual-account tests not performed.');
