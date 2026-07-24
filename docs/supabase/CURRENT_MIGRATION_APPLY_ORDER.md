# RugTown Supabase Migration Apply Order

**Status:** GENERATED BUT NOT APPLIED  
**Last updated:** 2026-07-22

Do **not** paste `database/supabase-combined-20260722.sql` into an existing project. Use the targeted release scripts in `database/release/`.

---

## 1. Base schema (completely new Supabase project)

| Order | File | Required |
|------:|------|----------|
| 1 | `database/schema.sql` | **Yes** |

Creates: `profiles`, legacy `character_appearance`, badges, inventory, districts, wallet verifications, signup trigger, base RLS.

---

## 2. Incremental migrations (already-initialized project)

Apply in this exact order:

| Order | File | Phase | Required for current app |
|------:|------|-------|--------------------------|
| 2 | `20260716_phase10g_rewards.sql` | 10G | **Yes** — progression, ledger, daily/weekly missions |
| 3 | `20260716_phase10h_reward_operations.sql` | 10H | **Yes** — sessions, settlements, notifications |
| 4 | `20260716_phase10i_achievements_season_pass_analytics.sql` | 10I | **Yes** — achievements, titles, season pass |
| 5 | `20260716_phase10j_social_identity_moderation.sql` | 10J | **Yes** — friends, DMs, moderation |
| 6 | `20260716_phase10k_parties_shared_missions_matchmaking.sql` | 10K | **Yes** — parties |
| 7 | `20260716_phase10l_characters_events_tournaments_guilds.sql` | 10L | **Partial** — guilds, tournaments, world events, slot cosmetics |
| 8 | `20260717_phase10mnpqs_living_world_security.sql` | 10M–S | **Partial** — tournament discovery, welcome cosmetic |
| 9 | `20260717_phase11_bitmap_character_appearances.sql` | 11 | **Yes** — bitmap appearance RPCs |
| 10 | `20260720_phase12_outfit_layer.sql` | 12 | **Yes** — outfitId in appearance JSON |
| 11 | `20260722_phase13_chapter_one_missions_progression.sql` | 13 | **Yes** — Chapter One missions, XP curve v2 |
| 12 | `20260722_phase13b_mission_reward_fix.sql` | 13B | **Yes** — fixes daily/weekly mission reward amounts |

### Dependency chain

```
schema.sql
  └─ 10G (player_progression, reward_ledger, missions)
       ├─ 10H (sessions, settlements)
       │    └─ 10I (achievements — uses rt_recompute_level, rt_notify)
       ├─ 13 (chapter missions — requires 10G)
       └─ 13B (claim_mission_reward fix — requires 10G missions)
10J (social — uses profiles, rt_notify)
  └─ 10K (parties — uses social helpers)
10L (guilds/events — uses 10H receipts, 10J rate limits)
  └─ 10MNPQS (tournament discovery)
11 (bitmap appearances — uses profiles, rt_social_restricted)
  └─ 12 (outfit layer — replaces Phase 11 appearance RPCs)
```

---

## 3. Latest mission/progression update only

If Phase 10G+ is **already applied**, run only:

```
database/release/phase13_apply_existing_project.sql
```

This includes:
- Prerequisite checks (fails clearly if 10G missing)
- Phase 13 migration
- Phase 13B mission reward fix
- Verification queries

---

## 4. Optional / test-only

| Item | Location | Notes |
|------|----------|-------|
| TEST season seed | 10G `INSERT INTO seasons … status='draft'` | Inactive by default |
| Operator seed rows | 10H `reward_operators`, 10J `social_operators` | Manual ops setup |
| `create_dev_claim` | 10G → restricted in 10H | Dev/operator only |
| Combined bundle | `database/supabase-combined-20260722.sql` | **New projects only** |

---

## 5. Do not rerun blindly

| File / object | Why |
|---------------|-----|
| `database/schema.sql` policies | No `DROP POLICY IF EXISTS` — reruns fail with duplicate policy (SQLSTATE `42710`) |
| Full combined bundle on existing DB | Duplicate tables/functions |
| Phase 13 `UPDATE player_progression SET progression_curve_version = 2` | Safe but re-grandfathers levels each run |
| Phase 10G seed `ON CONFLICT DO NOTHING` | Won't update changed reward values |
| Function replacements (10J→10K `block_player`, 11→12 appearance) | Later phases intentionally overwrite earlier definitions |

---

## Quick decision guide

| Your situation | Run this |
|----------------|----------|
| Brand-new empty Supabase project | `database/release/full_bootstrap_new_project.sql` |
| Have 10G+, need Chapter One + curve v2 | `database/release/phase13_apply_existing_project.sql` |
| Unsure what's applied | `database/diagnostics/inspect_current_supabase_state.sql` first |
| Migration failed | Fill `docs/supabase/SUPABASE_ERROR_PACKAGE_TEMPLATE.md` |
