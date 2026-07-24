/**
 * Static moderation permission checks.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10j_social_identity_moderation.sql'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/social/ModerationOperationsPanel.tsx'), 'utf8');

if (!sql.includes('CREATE TABLE IF NOT EXISTS public.social_operators')) fail('social_operators missing');
else ok('social_operators table');

if (!sql.includes('rt_is_social_operator')) fail('rt_is_social_operator missing');
else ok('rt_is_social_operator');

if (!sql.includes('apply_moderation_action')) fail('apply_moderation_action missing');
else ok('apply_moderation_action');

const applySlice = sql.slice(sql.indexOf('FUNCTION public.apply_moderation_action'), sql.indexOf('FUNCTION public.get_moderation_dashboard'));
if (!applySlice.includes("rt_is_social_operator('moderator')")) fail('apply_moderation_action not gated');
else ok('apply_moderation_action operator-gated');

if (!sql.includes('moderation_notes') || !sql.includes('moderation_evidence')) fail('notes/evidence tables missing');
else ok('moderation notes + evidence');

if (panel.includes('isAdmin') && !panel.includes('isSocialOperator')) fail('client trusts isAdmin flag');
else ok('mod panel uses server operator check');

if (!panel.includes('socialService.isSocialOperator')) fail('mod panel missing operator probe');
else ok('mod panel probes social_operators');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('Moderation permissions static validation passed');
