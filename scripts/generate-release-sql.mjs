import fs from 'fs';
import path from 'path';

const root = path.resolve('database/..');
const releaseDir = path.join(root, 'database/release');
fs.mkdirSync(releaseDir, { recursive: true });

const bootstrapFiles = [
  'database/schema.sql',
  'database/migrations/20260716_phase10g_rewards.sql',
  'database/migrations/20260716_phase10h_reward_operations.sql',
  'database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql',
  'database/migrations/20260716_phase10j_social_identity_moderation.sql',
  'database/migrations/20260716_phase10k_parties_shared_missions_matchmaking.sql',
  'database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql',
  'database/migrations/20260717_phase10mnpqs_living_world_security.sql',
  'database/migrations/20260717_phase11_bitmap_character_appearances.sql',
  'database/migrations/20260720_phase12_outfit_layer.sql',
  'database/migrations/20260722_phase13_chapter_one_missions_progression.sql',
  'database/migrations/20260722_phase13b_mission_reward_fix.sql',
  'database/migrations/20260723_phase13c_post_bootstrap_grants_and_party_rls.sql',
];

const header = `-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown FULL BOOTSTRAP — NEW EMPTY SUPABASE PROJECT ONLY
--
-- ⚠️  DO NOT RUN ON AN EXISTING DATABASE.
-- ⚠️  This will create duplicate objects if Phase 10+ is already applied.
--
-- Use database/release/phase13_apply_existing_project.sql instead if your
-- project already has Phase 10G+ objects.
--
-- Generated from repository sources on 2026-07-22.
-- pgcrypto is installed once at the top of database/schema.sql (first file).
-- ═══════════════════════════════════════════════════════════════════════════

`;

const bootstrapParts = [header];
for (const rel of bootstrapFiles) {
  bootstrapParts.push(`\n\n-- ===== BEGIN ${rel} =====\n\n`);
  bootstrapParts.push(fs.readFileSync(path.join(root, rel), 'utf8'));
  bootstrapParts.push(`\n\n-- ===== END ${rel} =====\n\n`);
}
fs.writeFileSync(path.join(releaseDir, 'full_bootstrap_new_project.sql'), bootstrapParts.join(''), 'utf8');

const p13 = fs.readFileSync(path.join(root, 'database/migrations/20260722_phase13_chapter_one_missions_progression.sql'), 'utf8');
const p13b = fs.readFileSync(path.join(root, 'database/migrations/20260722_phase13b_mission_reward_fix.sql'), 'utf8');

const applyHeader = `-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 13 apply script — EXISTING PROJECT ONLY
--
-- Run AFTER Phase 10G+ is already applied.
-- DO NOT include database/schema.sql or unrelated 10H-10L objects.
--
-- Step 1: Run database/diagnostics/inspect_current_supabase_state.sql
-- Step 2: Confirm phase_10g_player_progression = true in results
-- Step 3: Run this file
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.player_progression') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.player_progression (apply Phase 10G first)';
  END IF;
  IF to_regclass('public.reward_ledger') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.reward_ledger (apply Phase 10G first)';
  END IF;
  IF to_regprocedure('public.rt_ensure_progression(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: rt_ensure_progression(uuid) (apply Phase 10G first)';
  END IF;
  IF to_regprocedure('public.get_my_progression()') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: get_my_progression() (apply Phase 10G first)';
  END IF;
  IF to_regprocedure('public.award_gameplay_reward(text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: award_gameplay_reward(...) (apply Phase 10G first)';
  END IF;
  RAISE NOTICE 'Phase 13 prerequisites OK — applying migration';
END $$;

`;

const applyFooter = `
-- ─── Verification (read-only) ─────────────────────────────────────────────
SELECT public.rt_recompute_level_v2(455) AS expected_level_4_at_455_xp;
SELECT to_regclass('public.chapter_mission_state') IS NOT NULL AS chapter_mission_state_exists;
SELECT to_regprocedure('public.complete_chapter_mission(text)') IS NOT NULL AS complete_chapter_mission_exists;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='player_progression'
   AND column_name='progression_curve_version';
`;

fs.writeFileSync(
  path.join(releaseDir, 'phase13_apply_existing_project.sql'),
  applyHeader + p13 + '\n\n' + p13b + applyFooter,
  'utf8',
);

console.log('Generated release SQL scripts');
