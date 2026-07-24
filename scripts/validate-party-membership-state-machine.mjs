/** Static party membership / invitation / chat / anti-boost / matchmaking / RLS checks. */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10k_parties_shared_missions_matchmaking.sql'), 'utf8');
const svc = fs.readFileSync(path.join(root, 'src/lib/party/PartyService.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/components/party/PartyPanel.tsx'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/components/GamePage.tsx'), 'utf8');

if (!sql.includes("status='removed'") && !sql.includes("status = 'removed'")) fail('remove status missing');
else ok('member removal status');

if (!sql.includes('rt_party_has_block_conflict')) fail('block conflict helper missing');
else ok('block conflict helper');

if (!sql.includes('reconcile_party_block_state')) fail('block reconcile missing');
else ok('block reconcile');

if (!sql.includes('ON CONFLICT (party_id, recipient_id) WHERE status = \'pending\'')) fail('invite pending unique conflict');
else ok('invite pending conflict target');

if (!sql.includes('client_message_id')) fail('party chat idempotency missing');
else ok('party chat client_message_id');

if (!sql.includes('rt_safety_check_message')) fail('party chat safety missing');
else ok('party chat uses safety pipeline');

if (!sql.includes('reward_held') || !sql.includes('under_review')) fail('anti-boost hold missing');
else ok('anti-boost reward_held / under_review');

if (!sql.includes('evidence_hash')) fail('contribution evidence hash missing');
else ok('contribution evidence hash');

if (!sql.includes('uq_party_queue_active')) fail('queue uniqueness missing');
else ok('active queue uniqueness');

if (!sql.includes('process_party_matchmaking')) fail('matchmaking processor missing');
else ok('matchmaking processor');

if (!sql.includes("CREATE POLICY") || sql.match(/CREATE POLICY.*party_members.*INSERT/i)) {
  if (/CREATE POLICY[\s\S]{0,200}party_members[\s\S]{0,200}INSERT/i.test(sql)) fail('party_members INSERT policy');
  else ok('no party_members INSERT policy');
} else ok('no party_members INSERT policy');

if (!svc.includes('createParty') || !svc.includes('sendChat')) fail('PartyService incomplete');
else ok('PartyService APIs');

if (!panel.includes('PartyPanel') && !panel.includes('export function PartyPanel')) fail('PartyPanel missing');
else ok('PartyPanel present');

if (!game.includes("label: 'Party'") || !game.includes("key: 'P'")) fail('Party HUD shortcut missing');
else ok('Party HUD P shortcut');

if (!game.includes('partyService.initForAuthenticatedUser')) fail('party init not wired');
else ok('party init wired');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('Phase 10K membership/chat/mission/matchmaking static checks passed');
