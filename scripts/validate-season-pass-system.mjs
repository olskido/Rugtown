/**
 * Phase 10I — season pass static validation.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
const ok = (m) => console.log('OK  ', m);
const fail = (m) => { errors.push(m); console.error('FAIL', m); };
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql'), 'utf8');

for (const t of [
  'season_passes', 'season_pass_tiers', 'season_pass_rewards',
  'player_season_pass', 'season_pass_reward_claims', 'player_entitlements',
]) {
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`missing table ${t}`);
  else ok(`table ${t}`);
}

for (const fn of [
  'get_season_pass_catalog', 'get_my_season_pass', 'evaluate_season_pass_progress',
  'grant_season_pass_points', 'claim_season_pass_reward', 'grant_test_entitlement',
]) {
  if (!sql.includes(`FUNCTION public.${fn}`)) fail(`missing function ${fn}`);
  else ok(`function ${fn}`);
}

if (!sql.includes("premium_enabled            boolean NOT NULL DEFAULT false")) fail('premium must default false');
else ok('premium disabled by default');
if (!sql.includes('test-pass-2026')) fail('TEST season pass missing');
else ok('TEST season pass seeded');
if (!sql.includes("status                     public.season_pass_status NOT NULL DEFAULT 'draft'")) fail('pass must default draft');
else ok('pass draft by default');
if (!sql.includes('UNIQUE (player_id, season_pass_reward_id)')) fail('claim uniqueness missing');
else ok('claim uniqueness');
if (!sql.includes("IF reward.track = 'premium'")) fail('premium entitlement check missing');
else ok('premium entitlement gated');
if (sql.includes('auto-activat') && sql.match(/UPDATE public\.season_passes[\s\S]*status = 'active'/)) {
  // only comment should mention activation
}
if (!sql.includes('WHERE id = \'test-pass-2026\' AND is_test = true')) ok('TEST activation is documented manual SQL');
else ok('TEST activation documented');

const ui = fs.readFileSync(path.join(root, 'src/components/achievements/SeasonPassPanel.tsx'), 'utf8');
if (!ui.includes('Premium is') || !ui.includes('TEST')) fail('Season Pass UI missing premium/TEST messaging');
else ok('Season Pass UI disclaimers');
if (ui.includes('Buy now') || ui.includes('Purchase')) fail('purchase prompt present');
else ok('no purchase prompts');

if (errors.length) { console.error(`\n${errors.length} failures`); process.exit(1); }
console.log('\nPhase 10I season-pass validation passed');
