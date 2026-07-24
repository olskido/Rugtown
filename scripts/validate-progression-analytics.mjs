/**
 * Phase 10I — analytics / ops / RLS static validation.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
const ok = (m) => console.log('OK  ', m);
const fail = (m) => { errors.push(m); console.error('FAIL', m); };
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql'), 'utf8');

for (const t of [
  'reward_analytics_events', 'economy_daily_snapshots', 'operational_alerts',
  'analytics_job_runs', 'player_progression_history',
]) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`missing table ${t}`);
  else ok(`table ${t}`);
}

for (const fn of [
  'generate_economy_daily_snapshot', 'run_progression_maintenance',
  'get_progression_ops_dashboard', 'list_operational_alerts',
  'reconcile_player_achievement', 'rt_raise_alert',
]) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`missing function ${fn}`);
  else ok(`function ${fn}`);
}

// RLS enabled
for (const t of [
  'achievement_definitions', 'player_achievements', 'player_titles',
  'player_season_pass', 'operational_alerts', 'economy_daily_snapshots',
  'reward_analytics_events', 'player_entitlements',
]) {
  if (!sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)) fail(`RLS missing: ${t}`);
  else ok(`RLS: ${t}`);
}

// operational_alerts / economy snapshots / eval queue must not have public SELECT
for (const t of ['operational_alerts', 'economy_daily_snapshots', 'achievement_evaluation_queue']) {
  if (new RegExp(`CREATE POLICY[^;]*${t}[^;]*FOR SELECT`, 'i').test(sql)) {
    fail(`${t} must not have a public/owner SELECT policy`);
  } else ok(`${t} has no client SELECT policy`);
}

// Operator gating
if (!sql.includes("rt_is_operator('operator')")) fail('operator gating missing');
else ok('operator gating present');

if (errors.length) { console.error(`\n${errors.length} failures`); process.exit(1); }
console.log('\nPhase 10I analytics + RLS validation passed');
console.log('NOTE: Live RLS enforcement not tested against a deployed database.');
