-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown — read-only Supabase state inspection
--
-- Run in Supabase SQL Editor. Does NOT mutate anything.
-- NOTE: Sections 4, 7, 12–15 error if Phase 10G objects are missing.
-- That failure itself indicates prerequisites are not met.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. RugTown tables ─────────────────────────────────────────────────────
SELECT '1_rugtown_tables' AS section,
       table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND (
    table_name IN (
      'profiles', 'character_appearance', 'player_badges', 'player_inventory',
      'district_unlocks', 'wallet_verifications', 'seasons', 'player_progression',
      'reward_definitions', 'reward_ledger', 'mission_definitions', 'mission_assignments',
      'chapter_mission_state', 'guest_migrations', 'claimable_rewards',
      'player_bitmap_appearances', 'character_bitmap_catalog'
    )
    OR table_name LIKE 'achievement%'
    OR table_name LIKE 'season_pass%'
    OR table_name LIKE 'party%'
    OR table_name LIKE 'guild%'
    OR table_name LIKE 'tournament%'
    OR table_name LIKE 'world_event%'
    OR table_name LIKE 'conversation%'
    OR table_name LIKE 'friend%'
    OR table_name LIKE 'moderation%'
    OR table_name LIKE 'reward_%'
    OR table_name LIKE 'game_%'
    OR table_name LIKE 'verified_%'
    OR table_name LIKE 'social_%'
    OR table_name LIKE 'player_%'
  )
ORDER BY table_name;

-- ─── 2. profiles columns ───────────────────────────────────────────────────
SELECT '2_profiles_columns' AS section,
       column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- ─── 3. player_progression columns ─────────────────────────────────────────
SELECT '3_player_progression_columns' AS section,
       column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'player_progression'
ORDER BY ordinal_position;

-- ─── 4. progression curve version distribution ─────────────────────────────
-- NOTE: Errors if player_progression does not exist (Phase 10G not applied).
SELECT '4_progression_curve_version' AS section,
       progression_curve_version,
       count(*) AS players,
       min(level) AS min_level,
       max(level) AS max_level,
       min(lifetime_xp) AS min_xp,
       max(lifetime_xp) AS max_xp
FROM public.player_progression
GROUP BY progression_curve_version
ORDER BY progression_curve_version;

-- ─── 5. Phase presence flags ───────────────────────────────────────────────
SELECT '5_phase_presence' AS section,
       to_regclass('public.player_progression') IS NOT NULL AS phase_10g_player_progression,
       to_regclass('public.reward_ledger') IS NOT NULL AS phase_10g_reward_ledger,
       to_regclass('public.mission_definitions') IS NOT NULL AS phase_10g_mission_definitions,
       to_regclass('public.game_sessions') IS NOT NULL AS phase_10h_game_sessions,
       to_regclass('public.achievement_definitions') IS NOT NULL AS phase_10i_achievements,
       to_regclass('public.friendships') IS NOT NULL AS phase_10j_social,
       to_regclass('public.parties') IS NOT NULL AS phase_10k_parties,
       to_regclass('public.guilds') IS NOT NULL AS phase_10l_guilds,
       to_regclass('public.player_bitmap_appearances') IS NOT NULL AS phase_11_bitmap_appearances,
       to_regclass('public.chapter_mission_state') IS NOT NULL AS phase_13_chapter_missions,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'player_progression'
           AND column_name = 'progression_curve_version'
       ) AS phase_13_curve_version_column,
       to_regprocedure('public.complete_chapter_mission(text)') IS NOT NULL AS phase_13_complete_rpc,
       to_regprocedure('public.rt_recompute_level_v2(bigint)') IS NOT NULL AS phase_13_curve_v2,
       -- Phase 13B: claim_mission_reward must not call award_gameplay_reward for period claims.
       -- Presence of xpAwarded in return is not visible here; check function body separately.
       to_regprocedure('public.claim_mission_reward(uuid)') IS NOT NULL AS claim_mission_reward_exists;

-- ─── 6. Key RPC functions and signatures ───────────────────────────────────
SELECT '6_key_functions' AS section,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'rt_ensure_progression',
    'rt_recompute_level',
    'rt_recompute_level_v2',
    'rt_xp_required_for_level_v2',
    'award_gameplay_reward',
    'claim_mission_reward',
    'complete_chapter_mission',
    'ensure_chapter_missions',
    'get_my_chapter_missions',
    'migrate_local_progression',
    'migrate_progression_curve_v2',
    'get_my_progression',
    'ensure_period_missions',
    'get_my_character_appearance',
    'save_my_character_appearance'
  )
ORDER BY p.proname, arguments;

-- ─── 7. rt_recompute_level implementation check ────────────────────────────
SELECT '7_level_curve_check' AS section,
       CASE
         WHEN to_regprocedure('public.rt_recompute_level(bigint)') IS NULL THEN 'rt_recompute_level MISSING'
         ELSE 'rt_recompute_level present'
       END AS recompute_status,
       CASE
         WHEN to_regprocedure('public.rt_recompute_level_v2(bigint)') IS NOT NULL THEN 'v2 helper present'
         ELSE 'v2 helper MISSING'
       END AS v2_helper,
       CASE WHEN to_regprocedure('public.rt_recompute_level(bigint)') IS NOT NULL
            THEN public.rt_recompute_level(455) END AS level_at_455_xp,
       CASE WHEN to_regprocedure('public.rt_recompute_level_v2(bigint)') IS NOT NULL
            THEN public.rt_recompute_level_v2(455) END AS v2_level_at_455_xp;

-- ─── 8. RLS policies on critical tables ────────────────────────────────────
SELECT '8_rls_policies' AS section,
       schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'player_progression', 'reward_ledger', 'chapter_mission_state',
    'mission_assignments', 'player_bitmap_appearances'
  )
ORDER BY tablename, policyname;

-- ─── 9. Triggers on critical tables ────────────────────────────────────────
SELECT '9_triggers' AS section,
       event_object_table AS table_name,
       trigger_name,
       action_timing,
       event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'profiles', 'player_progression', 'chapter_mission_state', 'auth.users'
  )
ORDER BY event_object_table, trigger_name;

-- ─── 10. Views ─────────────────────────────────────────────────────────────
SELECT '10_views' AS section,
       table_name AS view_name,
       view_definition IS NOT NULL AS has_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ─── 11. Function grants (authenticated / anon) ────────────────────────────
SELECT '11_function_grants' AS section,
       routine_name,
       grantee,
       privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND grantee IN ('authenticated', 'anon', 'public')
  AND routine_name IN (
    'complete_chapter_mission',
    'ensure_chapter_missions',
    'get_my_chapter_missions',
    'claim_mission_reward',
    'award_gameplay_reward',
    'get_my_progression',
    'migrate_local_progression'
  )
ORDER BY routine_name, grantee;

-- ─── 12. mission_definitions sample (daily/weekly rewards) ─────────────────
SELECT '12_mission_definitions' AS section,
       id, period_type, xp_reward, rep_reward, season_points, rug_points, active
FROM public.mission_definitions
WHERE to_regclass('public.mission_definitions') IS NOT NULL
  AND period_type IN ('daily', 'weekly')
ORDER BY period_type, id
LIMIT 20;

-- ─── 13. reward_definitions for period claims ──────────────────────────────
SELECT '13_reward_definitions_period_claims' AS section,
       id, source_type, reward_type, amount, active
FROM public.reward_definitions
WHERE source_type IN ('daily_claim', 'weekly_claim', 'mission_complete')
ORDER BY source_type, reward_type;

-- ─── 14. chapter_mission_state summary ─────────────────────────────────────
SELECT '14_chapter_mission_state' AS section,
       status,
       count(*) AS rows
FROM public.chapter_mission_state
GROUP BY status
ORDER BY status;

-- ─── 15. Seed / catalog counts ─────────────────────────────────────────────
SELECT '15_catalog_counts' AS section,
       (SELECT count(*) FROM public.reward_definitions) AS reward_definitions,
       (SELECT count(*) FROM public.mission_definitions) AS mission_definitions,
       (SELECT count(*) FROM public.seasons) AS seasons,
       (SELECT count(*) FROM public.player_progression) AS player_progression_rows,
       (SELECT count(*) FROM public.reward_ledger) AS reward_ledger_rows;
