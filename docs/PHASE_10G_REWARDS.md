# Phase 10G — Server-authoritative reward economy

## Apply the migration

1. Open Supabase Dashboard → SQL Editor
2. Ensure `database/schema.sql` has already been applied
3. Run `database/migrations/20260716_phase10g_rewards.sql`
4. Confirm RPCs exist: `get_my_progression`, `award_gameplay_reward`, `ensure_period_missions`, …

Until this SQL is applied, the client stays in **local** authority mode (guest-safe, no monetary claims).

## Authority model

```
Client request (sourceType + sourceId + idempotencyKey)
  → supabase.rpc('award_gameplay_reward')
  → SECURITY DEFINER validates catalog amounts
  → append-only reward_ledger (unique player_id + idempotency_key)
  → player_progression + profiles.rep update
  → JSON snapshot response
```

Direct browser `UPDATE profiles.rep` is neutralized by trigger
`profiles_protect_reward_columns` unless `app.rugtown_reward_mutation=1`
(set only inside reward RPCs).

## Guest → auth merge

- RPC: `migrate_local_progression(guest_identity, idempotency_key, local jsonb)`
- One-time per guest identity / account pair
- Initial migration may take `max(local, server)` for XP/REP once
- After `migrated_from_local=true`, highest-wins is refused
- Guests cannot create SOL/SPL claims

## Rug Points

Off-chain reward points separate from REP and season points.
UI disclaimer: not guaranteed monetary value.

## Solana settlement

`RewardSettlementAdapter` / `NoopSettlementAdapter` — no transfers, no treasury keys,
no fabricated signatures for SOL/SPL. Phase 11+ must add custody, multisig,
simulation, rate limits, pause, and audit logs.

## Activate a TEST season

```sql
UPDATE public.seasons
SET status = 'active'
WHERE id = 'test-season-2026';
```

Season UI appears only when an active season row exists and `now()` is in range.
