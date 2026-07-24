# RugTown Production-Readiness Report (Post-Bootstrap Audit)

**Date:** 2026-07-23  
**Project:** `zdffsxlrdelykpkpbokk.supabase.co`  
**Bootstrap:** Completed successfully (after pgcrypto + recursion fixes)  
**Remote status:** INSTALLED — POST-BOOTSTRAP FIXES REQUIRED

---

## Executive verdict

| Area | Status |
|------|--------|
| Schema / objects installed | **PASS** |
| Phase 13 / 13B functions present | **PASS** |
| Seed catalogs (missions/rewards) | **PASS** |
| Auth-gated RPC EXECUTE grants | **PASS** (expected 401 for anon) |
| PostgREST table GRANTs to anon/authenticated | **FAIL** — requires Phase 13C |
| Party RLS (party_members) | **FAIL** — infinite recursion (42P17); fixed in Phase 13C |
| Frontend TypeScript / build | **PASS** |
| Authenticated browser smoke (signup, missions, claims) | **NOT LIVE-VERIFIED** (no auth session in audit tooling) |
| Production-ready to ship | **NO** until Phase 13C is applied, then re-verify with a logged-in user |

---

## 1. Expected RPCs

Probed via anon key against live API.

| RPC | Result | Interpretation |
|-----|--------|----------------|
| `get_reward_system_health` | **200** | Exists; anon-allowed |
| `get_season_leaderboard` | **200** | Exists; anon-allowed |
| `get_open_tournaments` | **200** | Exists |
| `get_achievement_catalog` | **200** | Exists; returns seeded data |
| `get_my_progression` | **401 / 42501** | Exists; authenticated-only (correct) |
| `ensure_chapter_missions` | **401 / 42501** | Exists; Phase 13 present |
| `get_my_chapter_missions` | **401 / 42501** | Exists |
| `complete_chapter_mission` | **401 / 42501** | Exists |
| `claim_mission_reward` | **401 / 42501** | Exists (13B body installed with bootstrap) |
| `ensure_period_missions` | **401 / 42501** | Exists |
| `get_my_character_appearance` | **401 / 42501** | Exists |
| `check_username_availability` | **401 / 42501** | Exists; authenticated-only |
| `get_active_world_events` | **401 / 42501** | Exists; authenticated-only |

No `PGRST202` / “function not found” errors for Chapter One or progression RPCs.

Frontend RPC names used in `src/` match the installed SQL signatures for core Phase 13 paths (`p_mission_id`, `p_assignment_id`, etc.).

---

## 2. Required tables

Confirmed via `get_reward_system_health` and table probes:

| Object | Evidence |
|--------|----------|
| `player_progression` | health.tables = true |
| `reward_ledger` | health.tables = true; ledger_rows = 0 |
| `mission_definitions` | count = **12** |
| `reward_definitions` | count = **24** |
| `game_sessions`, `verified_wallets`, `player_notifications`, … | health.tables = true |
| `profiles`, `chapter_mission_state`, `player_bitmap_appearances`, `friendships` | Table exists (API returns **42501**, not 42P01 missing) |
| `parties` / `party_members` | Exists; SELECT hits RLS bug (below) |

---

## 3. RLS policies

| Check | Result |
|-------|--------|
| Authenticated-only RPCs reject anon | **PASS** (42501) |
| Owner-read pattern intended for progression/missions | Present in SQL |
| `party_members` SELECT policy | **FAIL** — self-referential EXISTS causes **42P17 infinite recursion** |

Corrective migration:

`database/migrations/20260723_phase13c_post_bootstrap_grants_and_party_rls.sql`  
→ also copied to `database/release/phase13c_apply_post_bootstrap_fix.sql`

---

## 4. Authentication / profiles

| Check | Result |
|-------|--------|
| `handle_new_user` trigger in schema | Present in bootstrap |
| `fetchProfile()` uses `.from('profiles')` | Yes (`src/lib/profile.ts`) |
| Live anon SELECT on `profiles` | **42501** — missing table GRANT after schema reset |

Until Phase 13C grants are applied, authenticated PostgREST `.from('profiles')` may also fail even with a valid JWT.

Signup/login **browser path was not executed** in this audit (no interactive auth session).

---

## 5. Chapter One missions

| Check | Result |
|-------|--------|
| `ensure_chapter_missions` / `complete_chapter_mission` installed | **PASS** (401 = exists) |
| Frontend `ChapterMissionService` + `GamePage` wiring | **PASS** (code review) |
| Guest local Chapter One (`MissionSystem` / localStorage) | **PASS** (local path) |
| Authenticated chapter load against live RPC | **NOT LIVE-VERIFIED** (needs logged-in user after 13C) |

---

## 6. Daily / weekly rewards (Phase 13B)

| Check | Result |
|-------|--------|
| 13B `claim_mission_reward` reads `mission_definitions` | **PASS** (in installed bootstrap SQL) |
| Does not call `award_gameplay_reward` for period claims | **PASS** (13B definition) |
| Frontend accepts top-level `progression` / `xpAwarded` | **PASS** (`RewardService.claimMission`) |
| Live claim with completed assignment | **NOT LIVE-VERIFIED** |

---

## 7. Frontend / schema mismatches

| Item | Status |
|------|--------|
| Chapter RPC arg/return shapes | Aligned |
| `claim_mission_reward` 13B return shape | Aligned |
| Local types in `src/lib/supabase.ts` | Present (manually maintained) |
| Direct table access without GRANTs | **Mismatch with live DB** until 13C |
| Party feature via table/policies | **Broken** until 13C RLS fix |

---

## 8. Browser console / network

| Check | Result |
|-------|--------|
| Automated browser session | **Not run** |
| Anon network probes | Health + public catalogs OK; private RPCs correctly 401 |
| Expected post-login failures without 13C | `profiles` / mission table queries → 42501; parties → 42P17 |

---

## Local validation

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |

---

## Required next step (apply now on the live project)

Run in Supabase SQL Editor:

```text
database/release/phase13c_apply_post_bootstrap_fix.sql
```

This applies:

1. `GRANT` table/sequence privileges to `anon` + `authenticated` (RLS still enforces rows)
2. Non-recursive `party_members` policy via `rt_is_active_party_member`

Then re-test with a real logged-in account:

1. Signup / login → profile row loads  
2. `ensure_chapter_missions` → Chapter One list  
3. Complete one chapter mission → XP/REP once  
4. Complete + claim a daily mission → amounts from `mission_definitions`  
5. Claim same mission twice → `duplicate: true`  
6. Open parties UI → no 42P17  
7. Presence / multiplayer heartbeat

---

## Final status

**PARTIALLY READY — BOOTSTRAP SUCCESSFUL, PHASE 13C REQUIRED**

Core progression, catalogs, and Phase 13/13B RPCs are installed.  
Ship blocker: post-reset API grants + party RLS recursion. Apply Phase 13C, then authenticated smoke tests.
