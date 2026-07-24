# Supabase Idempotency Audit

**Status:** IMPLEMENTED BUT NOT LIVE-VERIFIED  
**Date:** 2026-07-22

---

## Summary

| Severity | Count | Action |
|----------|------:|--------|
| High (rerun fails) | 1 file | Patch schema.sql or skip reruns |
| Medium (stale data) | 3 | Document; optional corrective migration |
| Low (intentional replace) | 5+ | Expected behavior |

---

## High severity

### schema.sql — policies without DROP

| File | ~Line | Object | Failure | SQLSTATE | Fix |
|------|------:|--------|---------|----------|-----|
| `database/schema.sql` | 49–195 | 8 RLS policies | `policy "…" already exists` | `42710` | Add `DROP POLICY IF EXISTS` before each `CREATE POLICY` |

**Recommendation:** Patch `schema.sql` for greenfield reruns. Do **not** rerun on production; use incremental migrations instead.

---

## Medium severity

### Seed data uses ON CONFLICT DO NOTHING

| File | ~Line | Object | Issue | Fix |
|------|------:|--------|-------|-----|
| `10g_rewards.sql` | 359–399 | `reward_definitions`, `mission_definitions` | Changed seed values won't update on rerun | Use corrective migration with `ON CONFLICT DO UPDATE` if values change |
| `10g_rewards.sql` | 402–411 | TEST season | Stays `draft` forever on rerun | Manual activation only (intentional) |
| `10i_achievements…` | (seeds) | Achievement/title catalog | Same | Corrective migration if catalog changes |

### Phase 13 global UPDATE

| File | ~Line | Object | Issue | Fix |
|------|------:|--------|-------|-----|
| `20260722_phase13…` | 181–185 | `player_progression` | Re-runs `greatest(level, v2)` on all rows where version < 2 | Safe after first run (version becomes 2). No patch needed. |

### claim_mission_reward metadata bug (fixed in 13B)

| File | ~Line | Object | Issue | Fix |
|------|------:|--------|-------|-----|
| `10g_rewards.sql` | 890–902 | `claim_mission_reward` | Passes overrides metadata that `award_gameplay_reward` ignores | **Fixed in `20260722_phase13b_mission_reward_fix.sql`** |

---

## Low severity (intentional function replacement)

| From | To | Object | Notes |
|------|-----|--------|-------|
| 10G | 13 | `rt_recompute_level` | Replaced with v2 curve wrapper |
| 10G | 13 | `migrate_local_progression` | Extended for chapter sync |
| 10G | 10H | `create_dev_claim` | Operator-gated in 10H |
| 10J | 10K | `block_player` | Redefined in 10K |
| 11 | 12 | `get/save_my_character_appearance` | outfitId support |
| 10G | 13B | `claim_mission_reward` | Mission-specific rewards |

These are **not bugs** — later phases intentionally supersede earlier function bodies.

---

## Generally safe patterns (all phase migrations)

- `CREATE TABLE IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP POLICY IF EXISTS` + `CREATE POLICY` (10G–13, not schema.sql)
- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`
- Enum creation with `duplicate_object` exception handler (10H, 10I)
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
- Ledger idempotency via `UNIQUE (player_id, idempotency_key)`

---

## Files patched in this audit

| File | Change |
|------|--------|
| `database/migrations/20260722_phase13b_mission_reward_fix.sql` | **Created** — fixes confirmed reward bug |

No historical migrations (10G–12) were modified to preserve migration history immutability.

---

## Rerun safety by file

| File | Safe to rerun? |
|------|----------------|
| `schema.sql` | **No** (policies) |
| `10g`–`13` | **Mostly yes** (CREATE OR REPLACE, IF NOT EXISTS) |
| `13b` | **Yes** |
| Combined bundle | **No** on existing DB |
| `phase13_apply_existing_project.sql` | **Yes** (prerequisite checks + REPLACE) |
| `full_bootstrap_new_project.sql` | **New project only** |
