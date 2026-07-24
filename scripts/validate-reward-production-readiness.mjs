/**
 * Phase 10H — reward production readiness validation.
 *
 * Static checks against the 10G/10H migrations, Edge Functions, and frontend.
 * Fails loudly when a required component is missing. DB/live checks that require
 * a deployed Supabase/Solana environment are clearly reported as skipped.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
const ok = (m) => console.log('OK  ', m);
const fail = (m) => { errors.push(m); console.error('FAIL', m); };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ── 1. Migrations present ────────────────────────────────────────────
let g10, h10;
try { g10 = read('database/migrations/20260716_phase10g_rewards.sql'); ok('Phase 10G migration present'); }
catch { fail('Phase 10G migration missing'); g10 = ''; }
try { h10 = read('database/migrations/20260716_phase10h_reward_operations.sql'); ok('Phase 10H migration present'); }
catch { fail('Phase 10H migration missing'); h10 = ''; }

// ── 2. Required 10H tables ───────────────────────────────────────────
for (const t of [
  'reward_operators',
  'settlement_config',
  'game_sessions',
  'gameplay_action_receipts',
  'wallet_verification_challenges',
  'verified_wallets',
  'reward_settlements',
  'reward_claim_audit',
  'claim_reviews',
  'player_notifications',
  'season_leaderboard_snapshots',
]) {
  if (!h10.includes(`CREATE TABLE IF NOT EXISTS public.${t}`)) fail(`missing table ${t}`);
  else ok(`table ${t}`);
}

// ── 3. Required 10H functions ────────────────────────────────────────
for (const fn of [
  'get_reward_system_health',
  'rt_is_operator',
  'start_game_session',
  'heartbeat_game_session',
  'end_game_session',
  'submit_action_receipt',
  'transition_reward_claim_status',
  'rt_valid_claim_transition',
  'rt_notify',
  'get_my_notifications',
  'mark_notifications_read',
  'finalize_season',
  'run_reward_maintenance',
  'reconcile_reward_settlement',
  'list_pending_claims',
  'review_claim',
  'upsert_sponsored_campaign',
  'set_campaign_status',
  'reserve_campaign_budget',
]) {
  if (!h10.includes(`FUNCTION public.${fn}`)) fail(`missing function ${fn}`);
  else ok(`function ${fn}`);
}

// ── 4. Enums + constraints ───────────────────────────────────────────
for (const e of ['reward_claim_state', 'reward_settlement_state', 'settlement_mode', 'season_state', 'funding_state']) {
  if (!h10.includes(`CREATE TYPE public.${e}`)) fail(`missing enum ${e}`);
  else ok(`enum ${e}`);
}

// ── 5. Uniqueness / anti-abuse constraints ───────────────────────────
const constraints = [
  ['uq_verified_wallet_active', 'one active wallet per address'],
  ['uq_settlement_completed_claim', 'one completed settlement per claim'],
  ['uq_settlement_signature', 'no duplicate tx signatures'],
  ['UNIQUE (idempotency_key)', 'settlement idempotency'],
  ['UNIQUE (player_id, nonce)', 'action receipt nonce replay guard'],
  ['UNIQUE (season_id, player_id)', 'season snapshot uniqueness'],
];
for (const [c, label] of constraints) {
  if (!h10.includes(c)) fail(`missing constraint: ${label}`);
  else ok(`constraint: ${label}`);
}

// ── 6. RLS enabled on protected tables ───────────────────────────────
for (const t of [
  'verified_wallets', 'reward_settlements', 'player_notifications',
  'wallet_verification_challenges', 'claim_reviews', 'game_sessions',
  'gameplay_action_receipts', 'reward_operators',
]) {
  if (!h10.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)) fail(`RLS not enabled on ${t}`);
  else ok(`RLS enabled: ${t}`);
}

// ── 7. Private review notes never publicly readable ──────────────────
// claim_reviews must have RLS enabled and NO owner/public SELECT policy.
if (h10.includes('claim_reviews') && !/CREATE POLICY[^;]*claim_reviews[^;]*FOR SELECT/i.test(h10)) {
  ok('claim_reviews has no public/owner SELECT policy (operator-only via RPC)');
} else {
  fail('claim_reviews must not expose review notes via SELECT policy');
}

// ── 8. settlement_config has no client policy (server-only) ──────────
if (!/CREATE POLICY[^;]*settlement_config/i.test(h10)) ok('settlement_config has no client policy');
else fail('settlement_config must not be client-readable');

// ── 9. Fail-closed client authority ──────────────────────────────────
const svc = read('src/game/rewards/RewardService.ts');
for (const marker of ['migration_required', 'server_unavailable', 'isAuthenticatedBlocked', 'fail closed', 'startSession', 'subscribeRealtime']) {
  if (!svc.includes(marker)) fail(`RewardService missing: ${marker}`);
  else ok(`RewardService: ${marker}`);
}
if (svc.includes('opts.localFallback?.();\n    return {\n      awarded: true')) {
  fail('RewardService still silently falls back to local for accounts');
} else ok('no silent local fallback for authenticated awards');

// ── 10. Edge Functions present with shared error handling ────────────
const fns = [
  'create-wallet-verification-challenge',
  'verify-wallet-signature',
  'revoke-verified-wallet',
  'prepare-reward-settlement',
  'submit-reward-settlement',
  'verify-reward-settlement',
  'retry-reward-settlement',
  'close-season',
];
for (const fn of fns) {
  const p = `supabase/functions/${fn}/index.ts`;
  try {
    const src = read(p);
    if (!src.includes('HandledError') || !src.includes('errorResponse')) fail(`${fn}: missing shared error handling`);
    else ok(`edge function ${fn}`);
  } catch { fail(`edge function missing: ${fn}`); }
}

// ── 11. No secrets / keys in browser code ────────────────────────────
const browserFiles = [
  'src/game/rewards/RewardService.ts',
  'src/game/rewards/settlement/SupabaseSettlementAdapter.ts',
  'src/components/RewardCentrePanel.tsx',
  'src/components/RewardOperationsPanel.tsx',
];
for (const f of browserFiles) {
  const src = read(f);
  if (/SERVICE_ROLE|service_role|PRIVATE_KEY|secretKey|TREASURY_.*KEY/i.test(src)) fail(`possible secret reference in ${f}`);
  else ok(`no secret refs: ${f}`);
}

// ── 12. Verification requires on-chain evidence ──────────────────────
const verify = read('supabase/functions/verify-reward-settlement/index.ts');
if (!verify.includes('verifyTransaction')) fail('verify function does not perform on-chain verification');
else ok('settlement verification is independent/on-chain');

// ── 13. No fake signatures generated ─────────────────────────────────
const solana = read('supabase/functions/_shared/solana.ts');
if (/randomUUID\(\).*signature|fake.*signature|placeholder.*sig/i.test(solana)) fail('possible fabricated signature');
else ok('no fabricated transaction signatures');

// ── 14. NoopSettlementAdapter preserved ──────────────────────────────
if (!read('src/game/rewards/SettlementAdapter.ts').includes('NoopSettlementAdapter')) fail('NoopSettlementAdapter removed');
else ok('NoopSettlementAdapter preserved');

// ── 15. Reward Centre disclaimers ────────────────────────────────────
const ui = read('src/components/RewardCentrePanel.tsx');
for (const phrase of ['not automatically SOL', 'verified wallet', 'not necessarily a completed payout', 'TEST rewards have no monetary value']) {
  if (!ui.includes(phrase)) fail(`Reward Centre missing disclaimer: "${phrase}"`);
  else ok(`disclaimer: "${phrase}"`);
}

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n--- Live checks NOT performed (require deployed environment) ---');
console.log('  * migration actually applied to Supabase');
console.log('  * RLS enforcement at runtime');
console.log('  * Solana transaction verification against a cluster');
console.log('  * dual-account claim / settlement flow');

if (errors.length) {
  console.error(`\n${errors.length} FAILURES`);
  process.exit(1);
}
console.log('\nPhase 10H production-readiness static validation passed');
