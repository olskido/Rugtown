-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 13 — Chapter One missions, slower XP curve (v2), and
-- server-authoritative campaign completion.
--
-- Apply AFTER Phase 10G (player_progression, reward_ledger, rt_* helpers).
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE guards throughout.
--
-- GENERATED FOR MANUAL REVIEW — not applied remotely by this repository.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Progression curve version ─────────────────────────────────────────────
ALTER TABLE public.player_progression
  ADD COLUMN IF NOT EXISTS progression_curve_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.player_progression.progression_curve_version IS
  '1 = legacy soft curve, 2 = Chapter One slower curve (120 + 27n + 3n² per level).';

-- ─── XP curve v2 helpers (match src/game/progression/XpCurve.ts) ─────────────
-- IMPORTANT: do NOT recursively call this function from itself.
-- LANGUAGE sql + self-call causes PostgreSQL inliner stack overflow (SQLSTATE 54001).
CREATE OR REPLACE FUNCTION public.rt_xp_required_for_level_v2(p_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_level, 1) >= 50 THEN 0
    ELSE round(
      120
      + 27 * (greatest(coalesce(p_level, 1), 1) - 1)
      + 3 * (greatest(coalesce(p_level, 1), 1) - 1)
          * (greatest(coalesce(p_level, 1), 1) - 1)
    )::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.rt_recompute_level_v2(p_xp bigint)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  lvl integer := 1;
  spent bigint := 0;
  need integer;
  xp bigint := greatest(coalesce(p_xp, 0), 0);
BEGIN
  WHILE lvl < 50 LOOP
    need := public.rt_xp_required_for_level_v2(lvl);
    IF spent + need > xp THEN
      EXIT;
    END IF;
    spent := spent + need;
    lvl := lvl + 1;
  END LOOP;
  RETURN lvl;
END;
$$;

-- Canonical level helper used by all reward RPCs after this migration.
-- Thin alias only — must not form a cycle with rt_xp_required_for_level_v2.
CREATE OR REPLACE FUNCTION public.rt_recompute_level(p_xp bigint)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.rt_recompute_level_v2(p_xp);
$$;

COMMENT ON FUNCTION public.rt_recompute_level(bigint) IS
  'Derives player level from lifetime XP using curve v2.';

-- ─── Chapter mission state ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chapter_mission_state (
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_id        text NOT NULL,
  mission_version   integer NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'locked'
                     CHECK (status IN ('locked', 'active', 'completed')),
  progress          jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at        timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  reward_claimed_at timestamptz,
  PRIMARY KEY (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_mission_state_user_status
  ON public.chapter_mission_state (user_id, status);

CREATE OR REPLACE FUNCTION public.chapter_mission_state_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chapter_mission_state_touch ON public.chapter_mission_state;
CREATE TRIGGER chapter_mission_state_touch
  BEFORE UPDATE ON public.chapter_mission_state
  FOR EACH ROW
  EXECUTE FUNCTION public.chapter_mission_state_touch_updated_at();

ALTER TABLE public.chapter_mission_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chapter_mission_state: owner read" ON public.chapter_mission_state;
CREATE POLICY "chapter_mission_state: owner read"
  ON public.chapter_mission_state FOR SELECT
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — mutations via SECURITY DEFINER RPCs only.

COMMENT ON TABLE public.chapter_mission_state IS
  'Per-player Chapter One campaign progress. Clients read; RPCs write.';

-- ─── Internal: chapter catalog (single source of truth for rewards) ──────────
CREATE OR REPLACE FUNCTION public.rt_chapter_one_catalog(p_mission_id text DEFAULT NULL)
RETURNS TABLE (
  mission_id text,
  mission_order integer,
  xp_reward integer,
  rep_reward integer,
  next_mission_id text,
  title text
)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT *
  FROM (VALUES
    ('ch1_new_face',               1,  20,  3, 'ch1_water_before_rumours', 'A New Face'),
    ('ch1_water_before_rumours',   2,  25,  3, 'ch1_empty_cart',           'Water Before Rumours'),
    ('ch1_empty_cart',             3,  35,  5, 'ch1_milo_heard',           'The Empty Cart'),
    ('ch1_milo_heard',             4,  30,  4, 'ch1_notice_never_posted',  'What Milo Heard'),
    ('ch1_notice_never_posted',    5,  40,  5, 'ch1_proof_not_panic',      'The Notice Never Posted'),
    ('ch1_proof_not_panic',        6,  45,  7, 'ch1_patterns_in_ink',      'Proof, Not Panic'),
    ('ch1_patterns_in_ink',        7,  50,  7, 'ch1_bridge_keeps_count',   'Patterns in Ink'),
    ('ch1_bridge_keeps_count',     8,  55,  8, 'ch1_whales_shadow',        'The Bridge Keeps Count'),
    ('ch1_whales_shadow',          9,  60,  9, 'ch1_missing_ledger',       'The Whale''s Shadow'),
    ('ch1_missing_ledger',        10,  95, 14, NULL,                       'The Missing Ledger')
  ) AS v(mission_id, mission_order, xp_reward, rep_reward, next_mission_id, title)
  WHERE p_mission_id IS NULL OR v.mission_id = p_mission_id;
$$;

-- ─── Migrate existing players to curve v2 (grandfather level) ────────────────
CREATE OR REPLACE FUNCTION public.migrate_progression_curve_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prog public.player_progression;
  computed integer;
  merged integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  prog := public.rt_ensure_progression(uid);
  IF prog.progression_curve_version >= 2 THEN
    RETURN jsonb_build_object('migrated', false, 'already', true, 'progression', to_jsonb(prog));
  END IF;

  computed := public.rt_recompute_level_v2(prog.lifetime_xp);
  merged := greatest(prog.level, computed);

  PERFORM public.rt_set_mutation_flag();
  UPDATE public.player_progression
  SET level = merged,
      progression_curve_version = 2,
      updated_at = now()
  WHERE player_id = uid
  RETURNING * INTO prog;

  RETURN jsonb_build_object(
    'migrated', true,
    'computedLevel', computed,
    'grandfatheredLevel', merged,
    'progression', to_jsonb(prog)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_progression_curve_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_progression_curve_v2() TO authenticated;

-- One-time backfill for all existing rows (idempotent).
UPDATE public.player_progression
SET level = greatest(level, public.rt_recompute_level_v2(lifetime_xp)),
    progression_curve_version = 2,
    updated_at = now()
WHERE progression_curve_version < 2;

-- ─── Sync chapter rows from ledger / claimed keys ────────────────────────────
CREATE OR REPLACE FUNCTION public.rt_sync_chapter_mission_state(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat RECORD;
  receipt_key text;
  completed_count integer := 0;
  next_id text := 'ch1_new_face';
  has_active boolean := false;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;

  -- Seed all chapter rows (locked by default).
  INSERT INTO public.chapter_mission_state (user_id, mission_id, status)
  SELECT p_user, c.mission_id, 'locked'
  FROM public.rt_chapter_one_catalog() c
  ON CONFLICT (user_id, mission_id) DO NOTHING;

  -- Mark completed from reward ledger or claimed_reward_keys.
  FOR cat IN SELECT * FROM public.rt_chapter_one_catalog() ORDER BY mission_order LOOP
    receipt_key := 'mission:' || cat.mission_id || ':complete';
    IF EXISTS (
      SELECT 1 FROM public.reward_ledger
      WHERE player_id = p_user
        AND idempotency_key IN (receipt_key || ':XP', receipt_key || ':REP', receipt_key)
    ) OR EXISTS (
      SELECT 1 FROM public.player_progression pp
      WHERE pp.player_id = p_user
        AND coalesce(pp.claimed_reward_keys, '[]'::jsonb) ? receipt_key
    ) THEN
      UPDATE public.chapter_mission_state
      SET status = 'completed',
          progress = jsonb_build_object('complete', true),
          completed_at = coalesce(completed_at, now()),
          reward_claimed_at = coalesce(reward_claimed_at, now()),
          updated_at = now()
      WHERE user_id = p_user AND mission_id = cat.mission_id;
      completed_count := completed_count + 1;
      next_id := cat.next_mission_id;
    END IF;
  END LOOP;

  -- Activate the next incomplete mission.
  IF next_id IS NOT NULL THEN
    UPDATE public.chapter_mission_state
    SET status = 'active',
        started_at = coalesce(started_at, now()),
        updated_at = now()
    WHERE user_id = p_user AND mission_id = next_id AND status = 'locked';
    has_active := true;
  END IF;

  -- Brand-new player: first mission active.
  IF completed_count = 0 AND NOT has_active THEN
    UPDATE public.chapter_mission_state
    SET status = 'active',
        started_at = coalesce(started_at, now()),
        updated_at = now()
    WHERE user_id = p_user AND mission_id = 'ch1_new_face';
  END IF;
END;
$$;

-- ─── ensure_chapter_missions — call on login / world load ────────────────────
CREATE OR REPLACE FUNCTION public.ensure_chapter_missions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.rt_ensure_progression(uid);
  PERFORM public.migrate_progression_curve_v2();
  PERFORM public.rt_sync_chapter_mission_state(uid);

  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY c.mission_order), '[]'::jsonb)
  INTO rows
  FROM public.chapter_mission_state s
  JOIN public.rt_chapter_one_catalog() c ON c.mission_id = s.mission_id
  WHERE s.user_id = uid;

  RETURN jsonb_build_object('missions', rows);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_chapter_missions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_chapter_missions() TO authenticated;

-- ─── get_my_chapter_missions — read-only snapshot ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_chapter_missions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.rt_sync_chapter_mission_state(uid);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'missionId', s.mission_id,
      'status', s.status,
      'missionVersion', s.mission_version,
      'progress', s.progress,
      'startedAt', s.started_at,
      'completedAt', s.completed_at,
      'rewardClaimedAt', s.reward_claimed_at,
      'title', c.title,
      'xpReward', c.xp_reward,
      'repReward', c.rep_reward,
      'missionOrder', c.mission_order
    ) ORDER BY c.mission_order
  ), '[]'::jsonb)
  INTO rows
  FROM public.chapter_mission_state s
  JOIN public.rt_chapter_one_catalog() c ON c.mission_id = s.mission_id
  WHERE s.user_id = uid;

  RETURN jsonb_build_object('missions', rows);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_chapter_missions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_chapter_missions() TO authenticated;

-- ─── complete_chapter_mission — authoritative rewards ────────────────────────
CREATE OR REPLACE FUNCTION public.complete_chapter_mission(p_mission_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cat RECORD;
  state_row public.chapter_mission_state;
  prog public.player_progression;
  new_xp bigint;
  new_rep integer;
  new_level integer;
  receipt_key text;
  xp_inserted uuid;
  rep_inserted uuid;
  active_mission text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_mission_id IS NULL OR length(trim(p_mission_id)) = 0 THEN
    RAISE EXCEPTION 'invalid mission id';
  END IF;

  SELECT * INTO cat FROM public.rt_chapter_one_catalog(p_mission_id);
  IF cat.mission_id IS NULL THEN RAISE EXCEPTION 'unknown chapter mission'; END IF;

  PERFORM public.rt_ensure_progression(uid);
  PERFORM public.migrate_progression_curve_v2();
  PERFORM public.rt_sync_chapter_mission_state(uid);

  SELECT * INTO prog FROM public.player_progression WHERE player_id = uid FOR UPDATE;
  receipt_key := 'mission:' || p_mission_id || ':complete';

  -- Idempotent: already rewarded.
  IF coalesce(prog.claimed_reward_keys, '[]'::jsonb) ? receipt_key
     OR EXISTS (
       SELECT 1 FROM public.reward_ledger
       WHERE player_id = uid AND idempotency_key = receipt_key || ':XP'
     ) THEN
    SELECT * INTO prog FROM public.player_progression WHERE player_id = uid;
    RETURN jsonb_build_object(
      'awarded', false, 'duplicate', true,
      'missionId', p_mission_id, 'progression', to_jsonb(prog)
    );
  END IF;

  SELECT mission_id INTO active_mission
  FROM public.chapter_mission_state
  WHERE user_id = uid AND status = 'active'
  ORDER BY (
    SELECT mission_order FROM public.rt_chapter_one_catalog(mission_id)
  )
  LIMIT 1;

  IF active_mission IS DISTINCT FROM p_mission_id THEN
    RAISE EXCEPTION 'mission is not active (expected %)', coalesce(active_mission, 'none');
  END IF;

  SELECT * INTO state_row
  FROM public.chapter_mission_state
  WHERE user_id = uid AND mission_id = p_mission_id
  FOR UPDATE;

  IF state_row.status = 'completed' THEN
    SELECT * INTO prog FROM public.player_progression WHERE player_id = uid;
    RETURN jsonb_build_object(
      'awarded', false, 'duplicate', true,
      'missionId', p_mission_id, 'progression', to_jsonb(prog)
    );
  END IF;

  PERFORM public.rt_set_mutation_flag();

  INSERT INTO public.reward_ledger (
    player_id, reward_type, amount, reason, source_type, source_id,
    idempotency_key, metadata
  ) VALUES
    (uid, 'XP', cat.xp_reward,
      'chapter_mission:' || p_mission_id, 'chapter_mission', p_mission_id,
      receipt_key || ':XP', jsonb_build_object('curve_version', 2, 'mission_version', 1)),
    (uid, 'REP', cat.rep_reward,
      'chapter_mission:' || p_mission_id, 'chapter_mission', p_mission_id,
      receipt_key || ':REP', jsonb_build_object('curve_version', 2, 'mission_version', 1))
  ON CONFLICT (player_id, idempotency_key) DO NOTHING
  RETURNING id INTO xp_inserted;

  -- If both inserts conflicted, treat as duplicate.
  IF xp_inserted IS NULL AND EXISTS (
    SELECT 1 FROM public.reward_ledger
    WHERE player_id = uid AND idempotency_key = receipt_key || ':XP'
  ) THEN
    SELECT * INTO prog FROM public.player_progression WHERE player_id = uid;
    RETURN jsonb_build_object(
      'awarded', false, 'duplicate', true,
      'missionId', p_mission_id, 'progression', to_jsonb(prog)
    );
  END IF;

  new_xp := prog.lifetime_xp + cat.xp_reward;
  new_rep := prog.rep + cat.rep_reward;
  new_level := public.rt_recompute_level_v2(new_xp);

  UPDATE public.player_progression
  SET lifetime_xp = new_xp,
      rep = new_rep,
      level = new_level,
      progression_curve_version = 2,
      claimed_reward_keys = (
        SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM jsonb_array_elements_text(
          coalesce(claimed_reward_keys, '[]'::jsonb) || jsonb_build_array(receipt_key)
        ) AS value
      ),
      statistics = jsonb_set(
        coalesce(statistics, '{}'::jsonb),
        '{missionsCompleted}',
        to_jsonb(coalesce((statistics->>'missionsCompleted')::integer, 0) + 1),
        true
      ),
      updated_at = now()
  WHERE player_id = uid
  RETURNING * INTO prog;

  UPDATE public.profiles SET rep = new_rep, last_seen_at = now() WHERE id = uid;

  UPDATE public.chapter_mission_state
  SET status = 'completed',
      progress = jsonb_build_object('complete', true),
      completed_at = now(),
      reward_claimed_at = now(),
      updated_at = now()
  WHERE user_id = uid AND mission_id = p_mission_id;

  IF cat.next_mission_id IS NOT NULL THEN
    INSERT INTO public.chapter_mission_state (user_id, mission_id, status, started_at)
    VALUES (uid, cat.next_mission_id, 'active', now())
    ON CONFLICT (user_id, mission_id) DO UPDATE
      SET status = CASE
            WHEN chapter_mission_state.status IN ('locked', 'active') THEN 'active'
            ELSE chapter_mission_state.status
          END,
          started_at = coalesce(chapter_mission_state.started_at, now()),
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'awarded', true,
    'duplicate', false,
    'missionId', p_mission_id,
    'xpAwarded', cat.xp_reward,
    'repAwarded', cat.rep_reward,
    'progression', to_jsonb(prog)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_chapter_mission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_chapter_mission(text) TO authenticated;

COMMENT ON FUNCTION public.complete_chapter_mission(text) IS
  'Atomically completes an active Chapter One mission, grants XP/REP once, unlocks next.';

-- ─── Extend guest migration to sync chapter state ────────────────────────────
CREATE OR REPLACE FUNCTION public.migrate_local_progression(
  p_guest_identity text,
  p_idempotency_key text,
  p_local jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prog public.player_progression;
  existing public.guest_migrations;
  local_xp bigint;
  local_rep integer;
  merged_xp bigint;
  merged_rep integer;
  merged_keys jsonb;
  merged_titles jsonb;
  summary jsonb;
  mid text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_idempotency_key IS NULL OR p_guest_identity IS NULL THEN
    RAISE EXCEPTION 'invalid migration request';
  END IF;

  SELECT * INTO existing FROM public.guest_migrations
  WHERE idempotency_key = p_idempotency_key
     OR (auth_player_id = uid AND guest_identity = p_guest_identity);
  IF FOUND THEN
    prog := public.rt_ensure_progression(uid);
    PERFORM public.rt_sync_chapter_mission_state(uid);
    RETURN jsonb_build_object(
      'merged', false, 'duplicate', true,
      'progression', to_jsonb(prog), 'summary', existing.summary
    );
  END IF;

  prog := public.rt_ensure_progression(uid);

  IF prog.migrated_from_local THEN
    PERFORM public.rt_sync_chapter_mission_state(uid);
    RETURN jsonb_build_object(
      'merged', false, 'duplicate', false, 'refused', true,
      'reason', 'server already authoritative', 'progression', to_jsonb(prog)
    );
  END IF;

  local_xp := greatest(0, coalesce((p_local->>'lifetimeXp')::bigint, 0));
  local_rep := greatest(0, coalesce((p_local->>'rep')::integer, 0));
  merged_xp := greatest(prog.lifetime_xp, local_xp);
  merged_rep := greatest(prog.rep, local_rep);
  merged_keys := coalesce(prog.claimed_reward_keys, '[]'::jsonb)
    || coalesce(p_local->'claimedRewardKeys', '[]'::jsonb);
  merged_titles := coalesce(prog.unlocked_titles, '[]'::jsonb)
    || coalesce(p_local->'unlockedTitleIds', '[]'::jsonb);

  PERFORM public.rt_set_mutation_flag();
  UPDATE public.player_progression SET
    lifetime_xp = merged_xp,
    level = greatest(prog.level, public.rt_recompute_level_v2(merged_xp)),
    rep = merged_rep,
    progression_curve_version = 2,
    claimed_reward_keys = (
      SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(merged_keys) AS value
    ),
    unlocked_titles = (
      SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(merged_titles) AS value
    ),
    discoveries = coalesce(discoveries, '{}'::jsonb) || coalesce(p_local->'discoveries', '{}'::jsonb),
    achievement_progress = coalesce(achievement_progress, '{}'::jsonb)
      || coalesce(p_local->'achievementProgress', '{}'::jsonb),
    migrated_from_local = true,
    updated_at = now()
  WHERE player_id = uid
  RETURNING * INTO prog;

  UPDATE public.profiles SET rep = merged_rep WHERE id = uid;

  -- Sync chapter rows from guest completedMissions array (no duplicate rewards).
  IF jsonb_typeof(p_local->'completedMissions') = 'array' THEN
    FOR mid IN
      SELECT value FROM jsonb_array_elements_text(p_local->'completedMissions') AS value
      WHERE value LIKE 'ch1_%'
    LOOP
      PERFORM public.rt_sync_chapter_mission_state(uid);
      -- Only advance state; rewards must still go through complete_chapter_mission.
      UPDATE public.chapter_mission_state
      SET status = 'completed',
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
      WHERE user_id = uid AND mission_id = mid AND reward_claimed_at IS NULL;
    END LOOP;
    PERFORM public.rt_sync_chapter_mission_state(uid);
  END IF;

  summary := jsonb_build_object(
    'guestIdentity', p_guest_identity,
    'guestXp', local_xp,
    'mergedXp', merged_xp,
    'guestRep', local_rep,
    'mergedRep', merged_rep
  );

  INSERT INTO public.guest_migrations (auth_player_id, guest_identity, idempotency_key, summary)
  VALUES (uid, p_guest_identity, p_idempotency_key, summary);

  RETURN jsonb_build_object('merged', true, 'duplicate', false, 'progression', to_jsonb(prog), 'summary', summary);
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_local_progression(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_local_progression(text, text, jsonb) TO authenticated;
