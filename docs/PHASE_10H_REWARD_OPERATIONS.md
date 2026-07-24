# Phase 10H — Production Reward Authority, Settlement Foundation & Live Season Operations

This document describes the production-operable reward system built on top of Phase 10G. It does **not** replace Phase 10G: the append-only ledger, SECURITY DEFINER RPCs, and NoopSettlementAdapter remain intact.

---

## 1. Architecture

```
Browser (React)
  ├─ RewardService           — fail-closed for authenticated users
  ├─ NoopSettlementAdapter   — preserved (Phase 10G)
  ├─ SupabaseSettlementAdapter — Edge Function client
  └─ Reward Centre / Ops UI

Supabase
  ├─ Postgres (10G + 10H migrations)
  │    SECURITY DEFINER RPCs, RLS, enums, snapshots
  └─ Edge Functions (Deno)
       wallet challenge / verify / revoke
       prepare / submit / verify / retry settlement
       close-season
```

### Trust boundaries

| Boundary | Trusted actor | Untrusted |
|---|---|---|
| Browser | Signs challenges, displays state | Never decides verification, amounts, budgets, claim status |
| Anon / authenticated RLS | Read own rows | No direct writes to ledger, settlements, wallets, review notes |
| SECURITY DEFINER RPCs | Mutate progression / claims / sessions | Only via allowed transitions |
| Edge Functions + service role | Signature verification, settlement evidence | Never expose service-role key to browser |
| Solana RPC | Independent verification (read-only) | Never store private keys |

---

## 2. Applying migrations

1. Apply base schema: `database/schema.sql`
2. Apply Phase 10G: `database/migrations/20260716_phase10g_rewards.sql`
3. Apply Phase 10H: `database/migrations/20260716_phase10h_reward_operations.sql`
4. Confirm with:

```sql
SELECT public.get_reward_system_health();
```

Static readiness check (no live DB required):

```bash
node scripts/validate-reward-production-readiness.mjs
```

---

## 3. Wallet verification flow

1. Player connects a Solana wallet (e.g. Phantom).
2. Browser calls Edge Function `create-wallet-verification-challenge` with the wallet address.
3. Server stores a short-lived (5 min), single-use challenge whose message includes:
   - `RugTown Wallet Verification`
   - wallet address
   - authenticated player ID
   - nonce
   - issued / expires timestamps
   - environment (`SOLANA_CLUSTER`)
4. Browser signs the message; sends the base58 signature to `verify-wallet-signature`.
5. Server verifies the ed25519 signature (tweetnacl), rejects reused/expired challenges, and enforces one active wallet → one account.
6. On success, inserts/updates `verified_wallets` (server-only write). Historical settlements are never deleted on revoke.

Claims that pay SOL/SPL must reference the verified wallet used at claim time (`claimable_rewards.verified_wallet_id`).

---

## 4. Claim lifecycle

Explicit claim states (enum `reward_claim_state`):

`created → eligibility_pending → eligible | ineligible`
`eligible → awaiting_wallet | awaiting_review`
`awaiting_wallet → awaiting_review | cancelled | expired`
`awaiting_review → approved | ineligible`
`approved → settlement_preparing → settlement_submitted → settlement_confirming → completed`
Failures: `failed`, `cancelled`, `expired`. Retry: `failed → settlement_preparing`.

Transitions are enforced by `transition_reward_claim_status` (operator/system). Players may only self-cancel. Completing a SOL/SPL claim requires a confirmed/finalized settlement with a verified transaction signature.

Every transition writes an audit row to `reward_claim_audit`.

---

## 5. Settlement lifecycle

Settlement states (enum `reward_settlement_state`):

`not_started → prepared → submitted → processed → confirmed → finalized`
Side exits: `failed`, `reversed`, `manual_intervention`.

Modes (`settlement_mode`): `disabled` (default) · `manual_review` (safe default) · `multisig` · `automated`.

**Automated custody is NOT enabled by this phase.** Edge Functions prepare and verify; they do not sign or broadcast transfers. In `manual_review` / `multisig`, an operator executes the transfer out-of-band and records the signature via `submit-reward-settlement`.

Amounts are stored as `amount_atomic` (bigint) — never floating point.

Uniqueness:

- one completed settlement per claim
- unique transaction signatures
- unique settlement idempotency keys

---

## 6. Transaction verification

`verify-reward-settlement` independently fetches the transaction from the configured RPC and checks:

- transaction exists and succeeded
- destination wallet / mint / amount match
- confirmation level meets `SETTLEMENT_MIN_CONFIRMATIONS`
- transaction is after claim approval and within the verification window
- signature is not already assigned to another claim

Native SOL and SPL token transfers are both supported (including ATA creation). RPC credentials stay server-side. No claim is marked completed solely because a signature string exists.

---

## 7. Manual review

`claim_reviews` stores private notes, risk scores, holds, and approval/rejection timestamps. Review notes are **not** publicly readable (no owner SELECT policy).

Operator RPCs (require `reward_operators` row with role `reviewer` or `admin`):

- `list_pending_claims`
- `review_claim(action: approve|reject|hold|release)`
- Edge: `prepare-reward-settlement`, `submit-reward-settlement`, `verify-reward-settlement`, `retry-reward-settlement`

Authorization is never based on a client-provided `isAdmin` boolean.

---

## 8. Campaign operations

`RewardOperationsPanel` is visible only when `reward_operators` authorizes the user. Campaign RPCs:

- `upsert_sponsored_campaign` — draft only
- `set_campaign_status` — activation requires `funding_status IN ('verified','test_only')` and positive budget
- `reserve_campaign_budget` — row-locked atomic reservation

Atomic budget fields:

`budget_total_atomic`, `budget_reserved_atomic`, `budget_settled_atomic`, `budget_released_atomic`

Funding states: `unfunded | verification_pending | verified | partially_funded | insufficient | expired | test_only`.

---

## 9. Gameplay attestation & sessions

Authenticated players start a session via `start_game_session`. Heartbeats refresh `last_seen_at`. Action receipts (`submit_action_receipt`) require:

- an active session
- monotonically increasing sequence numbers
- unique per-player nonces

The same receipt cannot fund multiple rewards (`consumed_by_reward_id`). Guests continue local-only progression with no session requirement.

---

## 10. Notifications & Realtime

Trusted flows create rows in `player_notifications` via `rt_notify`. Clients can only mark read. Reward Centre and RewardService subscribe (RLS-safe) to:

- `player_notifications`
- `claimable_rewards`
- `reward_settlements`
- `mission_assignments`

Subscriptions are torn down on logout / unmount. Realtime payloads are never treated as authorization — they trigger re-fetch via RPC/select.

---

## 11. Season lifecycle

Statuses: `draft → scheduled → active → closing → finalized → archived | cancelled`.

`finalize_season` (admin) is idempotent and writes permanent rows to `season_leaderboard_snapshots`. After finalization, historical standings must not be re-derived from live mutable data.

### TEST season activation (manual, never automatic)

```sql
UPDATE public.seasons
SET status = 'active', lifecycle = 'active',
    starts_at = now(), ends_at = now() + interval '7 days'
WHERE id = 'test-season-2026' AND is_test = true;
```

TEST rewards must remain zero-value / non-transferable.

---

## 12. Scheduled jobs

`run_reward_maintenance()` is idempotent and:

- expires wallet challenges
- expires stale sessions
- expires overdue claims
- cleans expired notifications

Enable via `pg_cron` (commented in the migration) or an external cron invoking the function with the service-role key.

---

## 13. Abuse controls

- challenge attempt counts + pending challenge caps
- session sequence / nonce replay rejection
- one active wallet per address across accounts
- unique settlement signatures + idempotency keys
- campaign per-user/budget caps (atomic reservation)
- risk fields on reviews (`clear`/`review`/etc. via `player_progression.manual_review_status` and `claim_reviews.risk_score`)
- high-value claims enter `awaiting_review`

Heuristics flag for review; they do not auto-ban.

---

## 14. Failure recovery

`reconcile_reward_settlement(settlement_id)` reports DB state for operators. `retry-reward-settlement`:

- if a signature already exists → reset to `submitted` and require re-verification (never blind re-transfer)
- if no signature → reset to `prepared` for a fresh manual submission

Never blindly retry a transfer when prior transaction state is unknown.

---

## 15. Environment variables

### Browser-safe (`VITE_*`)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Server-only (Edge Function secrets)

See `.env.example`. Critical:

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server DB writes |
| `SOLANA_RPC_ENDPOINT` | Independent verification |
| `TREASURY_PUBLIC_ADDRESS` | Public address only |
| `SETTLEMENT_MODE` | Default `disabled` |
| `ALLOWED_ORIGINS` | CORS allowlist |

Never put service-role keys or treasury private keys in browser code or PostgreSQL.

---

## 16. Exact operator runbook

1. Apply Phase 10G migration.
2. Apply Phase 10H migration.
3. Deploy Edge Functions (`supabase functions deploy …`).
4. Set secrets (`supabase secrets set …`).
5. Confirm health: `SELECT get_reward_system_health();`.
6. Insert yourself into `reward_operators` (admin) via SQL editor (service role).
7. Activate TEST season (SQL above).
8. Create a test campaign with `funding_status = 'test_only'` and activate.
9. Verify a wallet through Reward Centre.
10. Create a test claim (dev RPC or campaign entitlement).
11. Approve via Reward Operations panel.
12. Prepare settlement → submit an out-of-band verified signature → verify on-chain.
13. Reconcile if needed: `SELECT reconcile_reward_settlement('<id>');`.
14. Finalize TEST season: Edge Function `close-season` or `SELECT finalize_season('test-season-2026');`.

---

## 17. Rollback

Phase 10H is additive. Safe rollback:

1. Set `settlement_config.mode = 'disabled'`.
2. Stop Edge Function traffic (undeploy / pause).
3. Leave tables in place (preserving ledger + settlements). Destructive drops of Phase 10H tables are **not** recommended once live claims exist.

---

## 18. Production checklist

- [ ] 10G + 10H migrations applied
- [ ] `get_reward_system_health()` healthy
- [ ] Edge Functions deployed + secrets set
- [ ] `SETTLEMENT_MODE` is `disabled` or `manual_review`
- [ ] No service-role / private keys in browser
- [ ] At least one `reward_operators` admin
- [ ] TEST season remains draft until intentionally activated
- [ ] Realtime publications enabled for notification/claim tables
- [ ] `run_reward_maintenance` scheduled
- [ ] Validation script green: `node scripts/validate-reward-production-readiness.mjs`

---

## 19. Remaining risks

- Gameplay award RPCs still accept client-reported source IDs (attestation layer is intermediate, not full sim).
- Guest→account migration remains forgeable on first merge.
- Automated custody and real treasury transfers are intentionally unimplemented.
- Live dual-account / on-chain tests require a deployed environment.
- Legacy `wallet_verifications` table from base schema remains owner-writable; prefer `verified_wallets` going forward.

---

## 20. Recommended next phase (10I)

- Server-defined achievement engine
- Title unlock conditions on the server
- Season pass foundation
- Reward analytics + operational monitoring dashboards
