-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 13B — Fix daily/weekly mission reward amounts.
--
-- BUG: claim_mission_reward() passed xpOverride/repOverride metadata to
-- award_gameplay_reward(), but award_gameplay_reward() ignores metadata and
-- grants fixed catalog amounts for source_type daily_claim / weekly_claim.
--
-- FIX: claim_mission_reward() now reads trusted amounts from
-- mission_definitions and writes ledger entries directly (same pattern as
-- complete_chapter_mission in Phase 13).
--
-- Apply AFTER Phase 10G. Safe to re-run (CREATE OR REPLACE).
-- GENERATED FOR MANUAL REVIEW — not applied remotely.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_mission_reward(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  a public.mission_assignments;
  def public.mission_definitions;
  prog public.player_progression;
  receipt_key text;
  new_xp bigint;
  new_rep integer;
  new_season integer;
  new_rug integer;
  new_level integer;
  active_season text;
  xp_inserted uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO a
  FROM public.mission_assignments
  WHERE id = p_assignment_id AND player_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF a.status = 'claimed' THEN
    RETURN jsonb_build_object('claimed', false, 'duplicate', true, 'assignment', to_jsonb(a));
  END IF;
  IF a.status <> 'completed' THEN
    RAISE EXCEPTION 'mission not completed';
  END IF;

  SELECT * INTO def FROM public.mission_definitions WHERE id = a.mission_definition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mission definition not found'; END IF;

  receipt_key := 'mission_claim:' || a.id::text;

  PERFORM public.rt_ensure_progression(uid);
  SELECT * INTO prog FROM public.player_progression WHERE player_id = uid FOR UPDATE;

  -- Idempotent: already claimed via ledger or claimed_reward_keys.
  IF coalesce(prog.claimed_reward_keys, '[]'::jsonb) ? receipt_key
     OR EXISTS (
       SELECT 1 FROM public.reward_ledger
       WHERE player_id = uid AND idempotency_key = receipt_key || ':XP'
     ) THEN
    SELECT * INTO a FROM public.mission_assignments WHERE id = p_assignment_id;
    RETURN jsonb_build_object('claimed', false, 'duplicate', true, 'assignment', to_jsonb(a));
  END IF;

  SELECT id INTO active_season
  FROM public.seasons
  WHERE status = 'active' AND now() BETWEEN starts_at AND ends_at
  ORDER BY starts_at DESC
  LIMIT 1;

  PERFORM public.rt_set_mutation_flag();

  -- Trusted amounts from mission_definitions — never from client metadata.
  INSERT INTO public.reward_ledger (
    player_id, reward_type, amount, reason, source_type, source_id,
    idempotency_key, metadata
  ) VALUES
    (uid, 'XP', def.xp_reward,
      'period_mission:' || def.id, a.period_type || '_claim', def.id,
      receipt_key || ':XP',
      jsonb_build_object('assignmentId', a.id, 'periodType', a.period_type, 'missionDefinitionId', def.id)),
    (uid, 'REP', def.rep_reward,
      'period_mission:' || def.id, a.period_type || '_claim', def.id,
      receipt_key || ':REP',
      jsonb_build_object('assignmentId', a.id, 'periodType', a.period_type, 'missionDefinitionId', def.id))
  ON CONFLICT (player_id, idempotency_key) DO NOTHING
  RETURNING id INTO xp_inserted;

  IF def.season_points > 0 AND active_season IS NOT NULL THEN
    INSERT INTO public.reward_ledger (
      player_id, reward_type, amount, reason, source_type, source_id,
      idempotency_key, metadata
    ) VALUES (
      uid, 'SEASON_POINTS', def.season_points,
      'period_mission:' || def.id, a.period_type || '_claim', def.id,
      receipt_key || ':SEASON_POINTS',
      jsonb_build_object('assignmentId', a.id, 'periodType', a.period_type, 'missionDefinitionId', def.id)
    ) ON CONFLICT (player_id, idempotency_key) DO NOTHING;
  END IF;

  IF def.rug_points > 0 THEN
    INSERT INTO public.reward_ledger (
      player_id, reward_type, amount, reason, source_type, source_id,
      idempotency_key, metadata
    ) VALUES (
      uid, 'RUG_POINTS', def.rug_points,
      'period_mission:' || def.id, a.period_type || '_claim', def.id,
      receipt_key || ':RUG_POINTS',
      jsonb_build_object('assignmentId', a.id, 'periodType', a.period_type, 'missionDefinitionId', def.id)
    ) ON CONFLICT (player_id, idempotency_key) DO NOTHING;
  END IF;

  IF xp_inserted IS NULL AND EXISTS (
    SELECT 1 FROM public.reward_ledger
    WHERE player_id = uid AND idempotency_key = receipt_key || ':XP'
  ) THEN
    SELECT * INTO a FROM public.mission_assignments WHERE id = p_assignment_id;
    RETURN jsonb_build_object('claimed', false, 'duplicate', true, 'assignment', to_jsonb(a));
  END IF;

  new_xp := prog.lifetime_xp + def.xp_reward;
  new_rep := prog.rep + def.rep_reward;
  new_season := prog.season_points + CASE WHEN active_season IS NOT NULL THEN def.season_points ELSE 0 END;
  new_rug := prog.rug_points + def.rug_points;
  new_level := public.rt_recompute_level(new_xp);

  UPDATE public.player_progression SET
    lifetime_xp = new_xp,
    level = new_level,
    rep = new_rep,
    rug_points = new_rug,
    season_id = coalesce(active_season, season_id),
    season_points = CASE WHEN active_season IS NOT NULL THEN new_season ELSE season_points END,
    claimed_reward_keys = (
      SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        coalesce(claimed_reward_keys, '[]'::jsonb) || jsonb_build_array(receipt_key)
      ) AS value
    ),
    updated_at = now()
  WHERE player_id = uid
  RETURNING * INTO prog;

  UPDATE public.profiles SET rep = new_rep, last_seen_at = now() WHERE id = uid;

  UPDATE public.mission_assignments
  SET status = 'claimed', claimed_at = now()
  WHERE id = a.id
  RETURNING * INTO a;

  RETURN jsonb_build_object(
    'claimed', true,
    'duplicate', false,
    'assignment', to_jsonb(a),
    'xpAwarded', def.xp_reward,
    'repAwarded', def.rep_reward,
    'seasonPointsAwarded', def.season_points,
    'rugPointsAwarded', def.rug_points,
    'progression', to_jsonb(prog)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mission_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_mission_reward(uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_mission_reward(uuid) IS
  'Claims a completed daily/weekly mission. Rewards read from mission_definitions (Phase 13B fix).';
