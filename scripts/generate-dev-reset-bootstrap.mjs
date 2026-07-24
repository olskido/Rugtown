import fs from 'fs';
import path from 'path';

const root = path.resolve('.');
const bootstrapPath = path.join(root, 'database/release/full_bootstrap_new_project.sql');
const outPath = path.join(root, 'database/release/dev_public_schema_reset_then_bootstrap.sql');

const resetPreamble = `-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown DEV RESET + FULL BOOTSTRAP
--
-- ⚠️  DESTROYS ALL public-schema RugTown data.
-- ⚠️  Preserves Supabase-managed schemas: auth, storage, realtime, extensions.
-- ⚠️  DO NOT run on a project with data you care about.
--
-- This file:
--   1. DROP SCHEMA public CASCADE
--   2. CREATE SCHEMA public + standard grants
--   3. Runs full_bootstrap_new_project.sql (schema → 10G…13B)
--
-- Apply with a privileged DB connection (postgres role / connection pooler
-- session mode), NOT the anon key.
-- ═══════════════════════════════════════════════════════════════════════════

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;

-- Restore default privileges commonly expected by Supabase
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, service_role;

-- pgcrypto is installed by database/schema.sql (first file in the bootstrap below).

`;

const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
const verify = `
-- ═══════════════════════════════════════════════════════════════════════════
-- Post-install verification
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'verify_tables' AS section, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'player_progression', 'reward_ledger', 'mission_definitions',
    'chapter_mission_state', 'player_bitmap_appearances', 'parties', 'friendships'
  )
ORDER BY table_name;

SELECT 'verify_rpcs' AS section, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'complete_chapter_mission', 'ensure_chapter_missions', 'claim_mission_reward',
    'rt_recompute_level_v2', 'get_my_progression', 'award_gameplay_reward'
  )
ORDER BY p.proname;

SELECT 'verify_curve' AS section, public.rt_recompute_level_v2(455) AS level_at_455_xp;

SELECT 'verify_claim_body' AS section,
       CASE
         WHEN pg_get_functiondef('public.claim_mission_reward(uuid)'::regprocedure)
              ILIKE '%mission_definitions%'
          AND pg_get_functiondef('public.claim_mission_reward(uuid)'::regprocedure)
              NOT ILIKE '%award_gameplay_reward%'
         THEN 'phase13b_fix_present'
         ELSE 'phase13b_fix_missing_or_old'
       END AS claim_mission_reward_status;
`;

fs.writeFileSync(outPath, resetPreamble + '\n' + bootstrap + '\n' + verify, 'utf8');
console.log('Wrote', outPath);
console.log('Bytes', fs.statSync(outPath).size);
