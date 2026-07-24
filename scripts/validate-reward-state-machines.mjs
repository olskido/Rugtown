/**
 * Phase 10H — deterministic claim/settlement state-machine tests.
 * No live Supabase or Solana required.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const h10 = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10h_reward_operations.sql'), 'utf8');
const errors = [];
const ok = (m) => console.log('OK  ', m);
const fail = (m) => { errors.push(m); console.error('FAIL', m); };

// Extract allowed transitions from the SQL function body
const transitions = [
  ['created', 'eligibility_pending'],
  ['eligibility_pending', 'eligible'],
  ['eligibility_pending', 'ineligible'],
  ['eligible', 'awaiting_wallet'],
  ['eligible', 'awaiting_review'],
  ['awaiting_wallet', 'awaiting_review'],
  ['awaiting_review', 'approved'],
  ['approved', 'settlement_preparing'],
  ['settlement_preparing', 'settlement_submitted'],
  ['settlement_submitted', 'settlement_confirming'],
  ['settlement_confirming', 'completed'],
  ['failed', 'settlement_preparing'],
];

for (const [from, to] of transitions) {
  if (!h10.includes(`('${from}', '${to}')`)) fail(`missing transition ${from} → ${to}`);
  else ok(`transition ${from} → ${to}`);
}

// Illegal transitions must NOT be present
const illegal = [
  ['created', 'completed'],
  ['ineligible', 'approved'],
  ['completed', 'approved'],
  ['expired', 'eligible'],
];
for (const [from, to] of illegal) {
  if (h10.includes(`('${from}', '${to}')`)) fail(`illegal transition allowed: ${from} → ${to}`);
  else ok(`illegal blocked: ${from} → ${to}`);
}

// Completed SOL/SPL requires verified settlement
if (!h10.includes('completed real-asset claim requires verified settlement')) {
  fail('missing SOL/SPL completed-requires-settlement guard');
} else ok('SOL/SPL completion requires verified settlement');

// Wallet challenge message components
const challenge = fs.readFileSync(path.join(root, 'supabase/functions/create-wallet-verification-challenge/index.ts'), 'utf8');
for (const part of ['RugTown Wallet Verification', 'wallet:', 'player:', 'nonce:', 'issued:', 'expires:', 'env:']) {
  if (!challenge.includes(part)) fail(`challenge missing "${part}"`);
  else ok(`challenge includes "${part}"`);
}

// Signature verification is server-side
const verify = fs.readFileSync(path.join(root, 'supabase/functions/verify-wallet-signature/index.ts'), 'utf8');
if (!verify.includes('nacl.sign.detached.verify')) fail('server signature verification missing');
else ok('server-side ed25519 verification');
if (!verify.includes('wallet_conflict')) fail('missing multi-account wallet conflict check');
else ok('wallet-already-attached rejected');

// Settlement never auto-transfers
const prepare = fs.readFileSync(path.join(root, 'supabase/functions/prepare-reward-settlement/index.ts'), 'utf8');
if (/signAndSend|sendTransaction|Keypair\.from/.test(prepare)) fail('prepare function appears to transfer funds');
else ok('prepare does not transfer funds');

const retry = fs.readFileSync(path.join(root, 'supabase/functions/retry-reward-settlement/index.ts'), 'utf8');
if (!retry.includes('reverify_required')) fail('retry must reverify when signature exists');
else ok('retry never blindly re-transfers');

// Budget concurrency
if (!h10.includes('FOR UPDATE') || !h10.includes('reserve_campaign_budget')) fail('budget reservation missing row lock');
else ok('campaign budget uses row lock');

if (errors.length) {
  console.error(`\n${errors.length} failures`);
  process.exit(1);
}
console.log('\nPhase 10H state-machine / verification static tests passed');
