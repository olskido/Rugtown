-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 13C — Post-bootstrap API grants + party RLS recursion fix
--
-- After DROP SCHEMA public CASCADE + full bootstrap, tables exist and RPCs
-- have EXECUTE grants, but PostgREST roles (anon/authenticated) often lack
-- table-level GRANTs. Without them, .from('profiles') and similar fail with
-- SQLSTATE 42501 even when RLS policies exist.
--
-- Also fixes party_members SELECT policy infinite recursion (SQLSTATE 42P17):
-- the policy queried party_members inside its own USING clause.
--
-- Safe to re-run. GENERATED FOR MANUAL APPLY.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Schema usage (idempotent) ──────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;

-- ─── 2. Table / sequence grants for PostgREST ──────────────────────────────
-- RLS still enforces row access; these grants only allow the API to see objects.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, service_role;

-- ─── 3. Fix party_members RLS recursion ────────────────────────────────────
-- Helper bypasses RLS so the policy can check membership without re-entering
-- the same policy (which caused SQLSTATE 42P17).
CREATE OR REPLACE FUNCTION public.rt_is_active_party_member(p_party uuid, p_player uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.party_members me
    WHERE me.party_id = p_party
      AND me.player_id = p_player
      AND me.status = 'active'
      AND me.left_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.rt_is_active_party_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rt_is_active_party_member(uuid, uuid) TO authenticated, anon;

DROP POLICY IF EXISTS "party_members: self or peer read" ON public.party_members;
CREATE POLICY "party_members: self or peer read"
  ON public.party_members FOR SELECT
  USING (
    player_id = auth.uid()
    OR public.rt_is_active_party_member(party_id, auth.uid())
  );

COMMENT ON FUNCTION public.rt_is_active_party_member(uuid, uuid) IS
  'SECURITY DEFINER membership check used by party_members RLS to avoid recursive policy evaluation.';

-- ─── 4. Verification ───────────────────────────────────────────────────────
SELECT 'phase13c_grants' AS section,
       has_table_privilege('authenticated', 'public.profiles', 'SELECT') AS auth_can_select_profiles,
       has_table_privilege('authenticated', 'public.chapter_mission_state', 'SELECT') AS auth_can_select_chapter,
       has_table_privilege('anon', 'public.mission_definitions', 'SELECT') AS anon_can_select_missions;

SELECT 'phase13c_party_rls' AS section,
       to_regprocedure('public.rt_is_active_party_member(uuid,uuid)') IS NOT NULL AS helper_exists;
