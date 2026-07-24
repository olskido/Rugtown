# Phase 13: Chapter Missions and Progression Migration

**Migration file:** `database/migrations/20260722_phase13_chapter_one_missions_progression.sql`

**Status:** GENERATED BUT NOT APPLIED — review and run manually in Supabase.

## Prerequisites

Apply after all Phase 10G+ migrations, especially:

- `20260716_phase10g_rewards.sql` (`player_progression`, `reward_ledger`, `rt_ensure_progression`)
- Any later migrations your project already uses

## What this migration adds

| Object | Purpose |
| --- | --- |
| `player_progression.progression_curve_version` | Tracks XP curve v1 vs v2 |
| `rt_xp_required_for_level_v2()` | Matches `src/game/progression/XpCurve.ts` |
| `rt_recompute_level_v2()` | Level from lifetime XP (curve v2) |
| `rt_recompute_level()` | Updated to delegate to v2 |
| `chapter_mission_state` | Per-user Chapter One status |
| `rt_chapter_one_catalog()` | Server-side mission rewards catalog |
| `migrate_progression_curve_v2()` | Grandfather existing levels on upgrade |
| `ensure_chapter_missions()` | Init/sync chapter rows on login |
| `get_my_chapter_missions()` | Read chapter snapshot |
| `complete_chapter_mission(text)` | Authoritative XP/REP + unlock next |
| `migrate_local_progression()` | Extended to sync guest chapter IDs |

## Apply order

1. Open Supabase SQL Editor (or `supabase db push` if you use CLI migrations).
2. Paste and run the full contents of `20260722_phase13_chapter_one_missions_progression.sql`.
3. Confirm no errors.

## Verification queries

```sql
-- Curve helpers exist
SELECT public.rt_recompute_level_v2(455);  -- expect 4

-- RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'chapter_mission_state';

-- Test as authenticated user (replace mission id)
SELECT public.complete_chapter_mission('ch1_new_face');
```

## Duplicate reward test

Run the same RPC twice for one mission:

```sql
SELECT public.complete_chapter_mission('ch1_new_face');
SELECT public.complete_chapter_mission('ch1_new_face');
```

Second call must return `"duplicate": true` and must not increase `lifetime_xp` again.

## Inspect authoritative progression

```sql
SELECT player_id, lifetime_xp, level, rep, progression_curve_version, claimed_reward_keys
FROM public.player_progression
WHERE player_id = auth.uid();
```

## Client integration

After applying SQL, authenticated users call:

- `ensure_chapter_missions` on login (via `RewardService.initForUser`)
- `complete_chapter_mission` when a Chapter One mission completes (via `GamePage`)

Guests continue using localStorage idempotency keys.

## Rollback considerations

- Do not drop `chapter_mission_state` if players have progress.
- Reverting `rt_recompute_level` to v1 would affect all future XP awards.
- Safe rollback before live users: restore prior `rt_recompute_level` from Phase 10G backup.

## TypeScript types

No generated `database.types.ts` is maintained in-repo. RPC names used by the client:

- `ensure_chapter_missions`
- `get_my_chapter_missions`
- `complete_chapter_mission`
- `migrate_progression_curve_v2`

## Deprecated file

If you previously generated `20260722_phase13_*`'s predecessor `20260721_phase13_chapter_one_missions_progression.sql`, **use only the 20260722 file** — it supersedes it with curve helpers, sync logic, and guest migration.
