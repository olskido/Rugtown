# Phase 13 Integration Report

**Date:** 2026-07-22  
**Remote status:** CONNECTED, CODE UPDATED, SQL NOT YET APPLIED

---

## What was found

The repository already contained:

- Phase 10G–12 migrations
- Phase 13 Chapter One migration (`20260722_phase13_chapter_one_missions_progression.sql`)
- Phase 13B reward fix (`20260722_phase13b_mission_reward_fix.sql`)
- Release scripts, diagnostics, and apply-order docs
- Frontend `ChapterMissionService` + `RewardService.completeChapterMission`
- Existing Supabase client via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (untouched)

No new SQL bundle was pasted in this session beyond the prior Phase 13/13B work. Integration was completed against that SQL and the live connected client.

---

## Confirmed reward bug

**CONFIRMED** in `20260716_phase10g_rewards.sql`:

1. `claim_mission_reward()` passes `xpOverride` / `repOverride` / etc. in metadata.
2. `award_gameplay_reward()` ignores metadata and grants fixed `daily_claim` / `weekly_claim` catalog amounts.

**Fix:** `20260722_phase13b_mission_reward_fix.sql` reads amounts from `mission_definitions` only.

---

## What was integrated / updated this pass

| Area | Action |
|------|--------|
| Phase 13 migration | Already present — preserved |
| Phase 13B migration | Already present — preserved |
| Release scripts | Already present — preserved |
| Diagnostics | Extended Phase 13 presence flags |
| Frontend claim handler | Accepts 13B top-level `progression` return |
| Local DB types | Added Phase 13 tables/RPC shapes in `supabase.ts` |
| Progression snapshot type | Added `progression_curve_version` |
| World collision | **Disabled** (`WORLD_COLLISION_ENABLED = false`) |

---

## Migrations (do not rewrite history)

| File | Status |
|------|--------|
| `20260722_phase13_chapter_one_missions_progression.sql` | Ready to apply |
| `20260722_phase13b_mission_reward_fix.sql` | Ready to apply |

Existing project apply file:

`database/release/phase13_apply_existing_project.sql`

---

## Frontend changes

- `src/game/rewards/RewardService.ts` — claimMission handles 13B return shape
- `src/game/rewards/types.ts` — `progression_curve_version` optional field
- `src/lib/supabase.ts` — local Phase 13 types (`DbPlayerProgression`, `DbChapterMissionState`, `DbRpcMap`)
- `src/game/world/WorldMapScale.ts` — collision off
- Existing: `ChapterMissionService.ts`, GamePage chapter completion path

---

## Guest vs authenticated

| Mode | Behavior |
|------|----------|
| Guest | Local mission + XP/REP via ProgressionService; no RPC |
| Authenticated | `complete_chapter_mission` / `claim_mission_reward` server-authoritative |
| Duplicate tab | Ledger idempotency keys + `claimed_reward_keys` prevent double grants |

---

## Remaining risks

1. Remote SQL not applied — Chapter One RPCs will 404 until Phase 13 is run.
2. Daily/weekly rewards stay wrong until Phase 13B is applied.
3. Local types are manually maintained, not `supabase gen types`.
4. Collision is off — players can walk through buildings/river until re-enabled.

---

## Exact next step (when you ask)

1. Run `database/diagnostics/inspect_current_supabase_state.sql`
2. Confirm Phase 10G present
3. Run `database/release/phase13_apply_existing_project.sql`
4. Verify `rt_recompute_level_v2(455) = 4`
