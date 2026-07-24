-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 10G — Server-authoritative progression, ledger, missions,
-- seasons, claims, and reward RPCs.
--
-- Apply in Supabase SQL Editor after database/schema.sql, or via:
--   supabase db push
--
-- Safe to re-run with IF NOT EXISTS / CREATE OR REPLACE guards.
-- Does NOT perform SOL/SPL transfers.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Helper: allow SECURITY DEFINER functions to mutate reward columns ─────
CREATE OR REPLACE FUNCTION public.rt_allow_reward_mutation()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.rugtown_reward_mutation', true), '') = '1';
$$;

-- Protect profiles.rep / holder_tier from direct client forgery
CREATE OR REPLACE FUNCTION public.profiles_protect_reward_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.rt_allow_reward_mutation() THEN
    NEW.rep := OLD.rep;
    -- holder_tier remains client-mock for now; wallet verification still deferred
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_reward_columns ON public.profiles;
CREATE TRIGGER profiles_protect_reward_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_reward_columns();

-- ─── seasons ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seasons (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'ended', 'archived')),
  rules_version text NOT NULL DEFAULT '1',
  is_test       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seasons: public read" ON public.seasons;
CREATE POLICY "seasons: public read"
  ON public.seasons FOR SELECT USING (true);

-- ─── player_progression ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_progression (
  player_id              uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  schema_version         integer NOT NULL DEFAULT 1,
  lifetime_xp            bigint NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
  level                  integer NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 50),
  rep                    integer NOT NULL DEFAULT 0 CHECK (rep >= 0),
  rug_points             integer NOT NULL DEFAULT 0 CHECK (rug_points >= 0),
  season_id              text REFERENCES public.seasons (id),
  season_points          integer NOT NULL DEFAULT 0 CHECK (season_points >= 0),
  equipped_title_id      text,
  unlocked_titles        jsonb NOT NULL DEFAULT '[]'::jsonb,
  achievement_progress   jsonb NOT NULL DEFAULT '{}'::jsonb,
  statistics             jsonb NOT NULL DEFAULT '{}'::jsonb,
  discoveries            jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_reward_keys    jsonb NOT NULL DEFAULT '[]'::jsonb,
  unlocked_feature_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  migrated_from_local    boolean NOT NULL DEFAULT false,
  abuse_flags            jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_review_status   text NOT NULL DEFAULT 'clear'
                           CHECK (manual_review_status IN ('clear', 'review', 'restricted')),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_progression_season
  ON public.player_progression (season_id, season_points DESC);
CREATE INDEX IF NOT EXISTS idx_player_progression_level
  ON public.player_progression (level DESC);

ALTER TABLE public.player_progression ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_progression: owner read" ON public.player_progression;
CREATE POLICY "player_progression: owner read"
  ON public.player_progression FOR SELECT
  USING (auth.uid() = player_id);
-- No direct INSERT/UPDATE/DELETE for clients — RPCs only

-- ─── reward_definitions (server catalog) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_definitions (
  id              text PRIMARY KEY,
  source_type     text NOT NULL,
  reward_type     text NOT NULL
                    CHECK (reward_type IN (
                      'XP', 'REP', 'SEASON_POINTS', 'RUG_POINTS',
                      'TITLE_UNLOCK', 'COSMETIC_UNLOCK', 'CLAIMABLE_REWARD'
                    )),
  amount          integer NOT NULL CHECK (amount >= 0),
  rules_version   text NOT NULL DEFAULT '1',
  period_cap      integer,
  active          boolean NOT NULL DEFAULT true,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.reward_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_definitions: public read" ON public.reward_definitions;
CREATE POLICY "reward_definitions: public read"
  ON public.reward_definitions FOR SELECT USING (true);

-- ─── reward_ledger (append-only) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reward_type       text NOT NULL
                      CHECK (reward_type IN (
                        'XP', 'REP', 'SEASON_POINTS', 'RUG_POINTS',
                        'TITLE_UNLOCK', 'COSMETIC_UNLOCK', 'CLAIMABLE_REWARD',
                        'ADMIN_ADJUSTMENT'
                      )),
  amount            integer NOT NULL,
  reason            text NOT NULL,
  source_type       text NOT NULL,
  source_id         text NOT NULL,
  idempotency_key   text NOT NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_ledger_amount_check CHECK (
    amount > 0 OR (reward_type = 'ADMIN_ADJUSTMENT' AND amount <> 0)
  ),
  CONSTRAINT reward_ledger_player_idempotency UNIQUE (player_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_player_created
  ON public.reward_ledger (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_source
  ON public.reward_ledger (source_type, source_id);

ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_ledger: owner read" ON public.reward_ledger;
CREATE POLICY "reward_ledger: owner read"
  ON public.reward_ledger FOR SELECT
  USING (auth.uid() = player_id);
-- Append only via SECURITY DEFINER RPCs

-- ─── mission_definitions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mission_definitions (
  id              text PRIMARY KEY,
  period_type     text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'campaign')),
  title           text NOT NULL,
  description     text NOT NULL,
  objective_type  text NOT NULL,
  target          integer NOT NULL DEFAULT 1 CHECK (target > 0),
  objective_ref   text,
  xp_reward       integer NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  rep_reward      integer NOT NULL DEFAULT 0 CHECK (rep_reward >= 0),
  season_points   integer NOT NULL DEFAULT 0 CHECK (season_points >= 0),
  rug_points      integer NOT NULL DEFAULT 0 CHECK (rug_points >= 0),
  difficulty      text NOT NULL DEFAULT 'easy'
                    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  active          boolean NOT NULL DEFAULT true,
  rules_version   text NOT NULL DEFAULT '1',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.mission_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mission_definitions: public read" ON public.mission_definitions;
CREATE POLICY "mission_definitions: public read"
  ON public.mission_definitions FOR SELECT USING (true);

-- ─── mission_assignments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mission_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id              uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  mission_definition_id  text NOT NULL REFERENCES public.mission_definitions (id),
  period_type            text NOT NULL CHECK (period_type IN ('daily', 'weekly')),
  period_key             text NOT NULL,
  progress               integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target                 integer NOT NULL CHECK (target > 0),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'completed', 'claimed', 'expired')),
  assigned_at            timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  claimed_at             timestamptz,
  UNIQUE (player_id, mission_definition_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_mission_assignments_player_period
  ON public.mission_assignments (player_id, period_type, period_key);

ALTER TABLE public.mission_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mission_assignments: owner read" ON public.mission_assignments;
CREATE POLICY "mission_assignments: owner read"
  ON public.mission_assignments FOR SELECT
  USING (auth.uid() = player_id);

-- ─── sponsored_campaigns ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsored_campaigns (
  id                 text PRIMARY KEY,
  sponsor            text NOT NULL,
  name               text NOT NULL,
  description        text NOT NULL DEFAULT '',
  funding_reference  text,
  budget_total       numeric(18, 6) NOT NULL DEFAULT 0 CHECK (budget_total >= 0),
  budget_reserved    numeric(18, 6) NOT NULL DEFAULT 0 CHECK (budget_reserved >= 0),
  budget_distributed numeric(18, 6) NOT NULL DEFAULT 0 CHECK (budget_distributed >= 0),
  reward_asset       text NOT NULL DEFAULT 'NONE'
                       CHECK (reward_asset IN ('NONE', 'RUG_POINTS', 'SOL', 'SPL', 'COSMETIC')),
  per_player_cap     numeric(18, 6) NOT NULL DEFAULT 0 CHECK (per_player_cap >= 0),
  max_winners        integer,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  claim_deadline     timestamptz,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'active', 'paused', 'ended', 'cancelled')),
  reward_rules       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_budget_consistency CHECK (
    budget_reserved + budget_distributed <= budget_total + 0.000001
  )
);

ALTER TABLE public.sponsored_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sponsored_campaigns: public read active" ON public.sponsored_campaigns;
CREATE POLICY "sponsored_campaigns: public read active"
  ON public.sponsored_campaigns FOR SELECT
  USING (status IN ('active', 'ended', 'paused') AND funding_reference IS NOT NULL);

-- ─── prize_pools ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prize_pools (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  pool_type          text NOT NULL
                       CHECK (pool_type IN ('fixed_equal', 'ranked', 'milestone', 'community_goal')),
  funding_reference  text,
  total_allocation   numeric(18, 6) NOT NULL DEFAULT 0 CHECK (total_allocation >= 0),
  reserved_amount    numeric(18, 6) NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  distributed_amount numeric(18, 6) NOT NULL DEFAULT 0 CHECK (distributed_amount >= 0),
  rules_version      text NOT NULL DEFAULT '1',
  season_id          text REFERENCES public.seasons (id),
  event_id           text,
  per_player_cap     numeric(18, 6) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'funded', 'active', 'settled', 'cancelled')),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prize_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prize_pools: public read funded" ON public.prize_pools;
CREATE POLICY "prize_pools: public read funded"
  ON public.prize_pools FOR SELECT
  USING (status IN ('funded', 'active', 'settled') AND funding_reference IS NOT NULL);

-- ─── cashback_campaigns ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cashback_campaigns (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  funding_reference  text,
  supported_tx_type  text NOT NULL DEFAULT 'spl_transfer',
  percentage_bps     integer CHECK (percentage_bps IS NULL OR (percentage_bps >= 0 AND percentage_bps <= 10000)),
  fixed_reward       numeric(18, 6),
  per_wallet_cap     numeric(18, 6) NOT NULL DEFAULT 0,
  budget_total       numeric(18, 6) NOT NULL DEFAULT 0,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'inactive'
                       CHECK (status IN ('inactive', 'active', 'paused', 'ended')),
  anti_sybil_rules   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashback_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cashback_campaigns: public read active" ON public.cashback_campaigns;
CREATE POLICY "cashback_campaigns: public read active"
  ON public.cashback_campaigns FOR SELECT
  USING (status = 'active' AND funding_reference IS NOT NULL);

-- ─── claimable_rewards ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.claimable_rewards (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reward_asset         text NOT NULL
                         CHECK (reward_asset IN ('RUG_POINTS', 'SOL', 'SPL', 'COSMETIC', 'NONE')),
  amount               text NOT NULL,
  source               text NOT NULL,
  campaign_id          text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending', 'eligible', 'reserved', 'processing',
                           'completed', 'failed', 'expired', 'cancelled'
                         )),
  eligibility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  claimed_at           timestamptz,
  transaction_signature text,
  failure_reason       text
);

CREATE INDEX IF NOT EXISTS idx_claimable_rewards_player_status
  ON public.claimable_rewards (player_id, status, created_at DESC);

ALTER TABLE public.claimable_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claimable_rewards: owner read" ON public.claimable_rewards;
CREATE POLICY "claimable_rewards: owner read"
  ON public.claimable_rewards FOR SELECT
  USING (auth.uid() = player_id);

-- ─── guest_migrations (one-time merge records) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.guest_migrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_player_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  guest_identity    text NOT NULL,
  idempotency_key   text NOT NULL,
  summary           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_player_id, guest_identity),
  UNIQUE (idempotency_key)
);

ALTER TABLE public.guest_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guest_migrations: owner read" ON public.guest_migrations;
CREATE POLICY "guest_migrations: owner read"
  ON public.guest_migrations FOR SELECT
  USING (auth.uid() = auth_player_id);

-- ─── Public season leaderboard view (safe fields only) ─────────────────────
CREATE OR REPLACE VIEW public.season_leaderboard_public
WITH (security_invoker = true)
AS
SELECT
  p.username,
  pp.level,
  pp.season_id,
  pp.season_points,
  pp.equipped_title_id,
  rank() OVER (
    PARTITION BY pp.season_id
    ORDER BY pp.season_points DESC, pp.lifetime_xp DESC, p.username ASC
  ) AS season_rank
FROM public.player_progression pp
JOIN public.profiles p ON p.id = pp.player_id
WHERE pp.season_id IS NOT NULL
  AND pp.manual_review_status <> 'restricted';

GRANT SELECT ON public.season_leaderboard_public TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed reward definitions + mission definitions (rules_version = 1)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.reward_definitions (id, source_type, reward_type, amount, rules_version) VALUES
  ('src:mission_complete:XP', 'mission_complete', 'XP', 55, '1'),
  ('src:mission_complete:REP', 'mission_complete', 'REP', 0, '1'),
  ('src:landmark_first:XP', 'landmark_first', 'XP', 28, '1'),
  ('src:landmark_first:REP', 'landmark_first', 'REP', 2, '1'),
  ('src:district_first:XP', 'district_first', 'XP', 45, '1'),
  ('src:district_first:REP', 'district_first', 'REP', 4, '1'),
  ('src:interior_first:XP', 'interior_first', 'XP', 40, '1'),
  ('src:interior_first:REP', 'interior_first', 'REP', 3, '1'),
  ('src:player_interact:XP', 'player_interact', 'XP', 22, '1'),
  ('src:player_interact:REP', 'player_interact', 'REP', 1, '1'),
  ('src:wave_once:XP', 'wave_once', 'XP', 12, '1'),
  ('src:fountain_first:XP', 'fountain_first', 'XP', 20, '1'),
  ('src:event_join:XP', 'event_join', 'XP', 35, '1'),
  ('src:event_join:RUG', 'event_join', 'RUG_POINTS', 5, '1'),
  ('src:daily_claim:XP', 'daily_claim', 'XP', 40, '1'),
  ('src:daily_claim:REP', 'daily_claim', 'REP', 5, '1'),
  ('src:daily_claim:SEASON', 'daily_claim', 'SEASON_POINTS', 10, '1'),
  ('src:daily_claim:RUG', 'daily_claim', 'RUG_POINTS', 15, '1'),
  ('src:weekly_claim:XP', 'weekly_claim', 'XP', 120, '1'),
  ('src:weekly_claim:REP', 'weekly_claim', 'REP', 20, '1'),
  ('src:weekly_claim:SEASON', 'weekly_claim', 'SEASON_POINTS', 40, '1'),
  ('src:weekly_claim:RUG', 'weekly_claim', 'RUG_POINTS', 50, '1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mission_definitions
  (id, period_type, title, description, objective_type, target, objective_ref, xp_reward, rep_reward, season_points, rug_points, difficulty)
VALUES
  ('daily_visit_spring', 'daily', 'Spring Visit', 'Enter Spring Water Core.', 'visit_district', 1, 'spring_core', 40, 5, 8, 10, 'easy'),
  ('daily_visit_bridge', 'daily', 'Bridge Walk', 'Discover the Main Bridge.', 'visit_landmark', 1, 'bridge', 40, 5, 8, 10, 'easy'),
  ('daily_three_landmarks', 'daily', 'Three Stops', 'Discover 3 landmarks today.', 'discover_landmarks', 3, NULL, 55, 8, 12, 15, 'medium'),
  ('daily_enter_interior', 'daily', 'Step Inside', 'Enter any available interior.', 'enter_interior', 1, NULL, 45, 5, 10, 12, 'easy'),
  ('daily_meet_player', 'daily', 'City Hello', 'Interact with one unique real player.', 'meet_player', 1, NULL, 50, 5, 12, 15, 'medium'),
  ('daily_wave', 'daily', 'Friendly Wave', 'Wave at a real player.', 'wave_player', 1, NULL, 30, 2, 6, 8, 'easy'),
  ('daily_city_event', 'daily', 'Event Curious', 'Join one city event.', 'join_event', 1, NULL, 50, 5, 12, 15, 'medium'),
  ('weekly_ten_missions', 'weekly', 'Mission Week', 'Complete 10 missions this week.', 'complete_missions', 10, NULL, 150, 25, 50, 60, 'hard'),
  ('weekly_five_players', 'weekly', 'Social Circuit', 'Meet 5 unique real players.', 'meet_players', 5, NULL, 140, 20, 45, 55, 'hard'),
  ('weekly_all_districts', 'weekly', 'Full Tour', 'Visit all five districts.', 'visit_districts', 5, NULL, 160, 25, 55, 65, 'hard'),
  ('weekly_three_events', 'weekly', 'Event Regular', 'Join 3 city events.', 'join_events', 3, NULL, 130, 20, 40, 50, 'medium'),
  ('weekly_five_interiors', 'weekly', 'Door Opener', 'Enter 5 different interiors.', 'enter_interiors', 5, NULL, 140, 20, 45, 55, 'medium')
ON CONFLICT (id) DO NOTHING;

-- Optional TEST season (inactive by default — activate manually in SQL)
INSERT INTO public.seasons (id, name, starts_at, ends_at, status, rules_version, is_test)
VALUES (
  'test-season-2026',
  'TEST Season 2026',
  '2026-01-01T00:00:00Z',
  '2026-12-31T23:59:59Z',
  'draft',
  '1',
  true
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Internal helpers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rt_set_mutation_flag()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.rugtown_reward_mutation', '1', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rt_utc_daily_key(ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD');
$$;

CREATE OR REPLACE FUNCTION public.rt_utc_weekly_key(ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(date_trunc('week', ts AT TIME ZONE 'UTC'), 'IYYY-"W"IW');
$$;

CREATE OR REPLACE FUNCTION public.rt_ensure_progression(p_player uuid)
RETURNS public.player_progression
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.player_progression;
  profile_rep integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_player THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO row FROM public.player_progression WHERE player_id = p_player;
  IF FOUND THEN
    RETURN row;
  END IF;

  SELECT coalesce(rep, 0) INTO profile_rep FROM public.profiles WHERE id = p_player;
  PERFORM public.rt_set_mutation_flag();
  INSERT INTO public.player_progression (player_id, rep)
  VALUES (p_player, coalesce(profile_rep, 0))
  ON CONFLICT (player_id) DO NOTHING
  RETURNING * INTO row;

  IF row.player_id IS NULL THEN
    SELECT * INTO row FROM public.player_progression WHERE player_id = p_player;
  END IF;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.rt_recompute_level(p_xp bigint)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  lvl integer := 1;
  spent bigint := 0;
  need integer;
  t numeric;
BEGIN
  WHILE lvl < 50 LOOP
    t := (lvl - 1)::numeric / 49.0;
    need := round(80 + 160 * t + 280 * t * t);
    IF spent + need > p_xp THEN
      EXIT;
    END IF;
    spent := spent + need;
    lvl := lvl + 1;
  END LOOP;
  RETURN lvl;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- award_gameplay_reward — server decides amounts from catalog + source
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.award_gameplay_reward(
  p_source_type text,
  p_source_id text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prog public.player_progression;
  def RECORD;
  existing public.reward_ledger;
  inserted public.reward_ledger;
  results jsonb := '[]'::jsonb;
  new_xp bigint;
  new_rep integer;
  new_season integer;
  new_rug integer;
  new_level integer;
  active_season text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 3 THEN
    RAISE EXCEPTION 'invalid idempotency key';
  END IF;

  -- Idempotent return (base key or typed suffix keys)
  SELECT * INTO existing
  FROM public.reward_ledger
  WHERE player_id = uid
    AND (idempotency_key = p_idempotency_key OR idempotency_key LIKE p_idempotency_key || ':%')
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO prog FROM public.player_progression WHERE player_id = uid;
    RETURN jsonb_build_object(
      'awarded', false,
      'duplicate', true,
      'ledger_id', existing.id,
      'progression', to_jsonb(prog)
    );
  END IF;

  prog := public.rt_ensure_progression(uid);
  IF prog.manual_review_status = 'restricted' THEN
    RAISE EXCEPTION 'account restricted';
  END IF;

  SELECT id INTO active_season
  FROM public.seasons
  WHERE status = 'active' AND now() BETWEEN starts_at AND ends_at
  ORDER BY starts_at DESC
  LIMIT 1;

  PERFORM public.rt_set_mutation_flag();
  new_xp := prog.lifetime_xp;
  new_rep := prog.rep;
  new_season := prog.season_points;
  new_rug := prog.rug_points;

  FOR def IN
    SELECT * FROM public.reward_definitions
    WHERE source_type = p_source_type AND active = true AND amount > 0
    ORDER BY id
  LOOP
    INSERT INTO public.reward_ledger (
      player_id, reward_type, amount, reason, source_type, source_id,
      idempotency_key, metadata
    ) VALUES (
      uid, def.reward_type, def.amount,
      def.source_type || ':' || p_source_id,
      p_source_type, p_source_id,
      p_idempotency_key || ':' || def.reward_type,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('definition_id', def.id, 'rules_version', def.rules_version)
    )
    ON CONFLICT (player_id, idempotency_key) DO NOTHING
    RETURNING * INTO inserted;

    IF inserted.id IS NOT NULL THEN
      results := results || jsonb_build_array(to_jsonb(inserted));
      IF def.reward_type = 'XP' THEN new_xp := new_xp + def.amount; END IF;
      IF def.reward_type = 'REP' THEN new_rep := new_rep + def.amount; END IF;
      IF def.reward_type = 'SEASON_POINTS' AND active_season IS NOT NULL THEN
        new_season := new_season + def.amount;
      END IF;
      IF def.reward_type = 'RUG_POINTS' THEN new_rug := new_rug + def.amount; END IF;
    END IF;
  END LOOP;

  -- If no catalog rows matched, treat as unknown source
  IF jsonb_array_length(results) = 0 THEN
    RAISE EXCEPTION 'unknown or inactive reward source: %', p_source_type;
  END IF;

  new_level := public.rt_recompute_level(new_xp);

  UPDATE public.player_progression SET
    lifetime_xp = new_xp,
    level = new_level,
    rep = new_rep,
    rug_points = new_rug,
    season_id = coalesce(active_season, season_id),
    season_points = CASE WHEN active_season IS NOT NULL THEN new_season ELSE season_points END,
    claimed_reward_keys = claimed_reward_keys || jsonb_build_array(p_idempotency_key),
    updated_at = now()
  WHERE player_id = uid
  RETURNING * INTO prog;

  UPDATE public.profiles SET rep = new_rep, last_seen_at = now() WHERE id = uid;

  RETURN jsonb_build_object(
    'awarded', true,
    'duplicate', false,
    'entries', results,
    'progression', to_jsonb(prog)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_gameplay_reward(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_gameplay_reward(text, text, text, jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Progression read / one-time local migration
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_progression()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prog public.player_progression;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  prog := public.rt_ensure_progression(uid);
  RETURN to_jsonb(prog);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_progression() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_progression() TO authenticated;

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
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_idempotency_key IS NULL OR p_guest_identity IS NULL THEN
    RAISE EXCEPTION 'invalid migration request';
  END IF;

  SELECT * INTO existing FROM public.guest_migrations
  WHERE idempotency_key = p_idempotency_key OR (auth_player_id = uid AND guest_identity = p_guest_identity);
  IF FOUND THEN
    prog := public.rt_ensure_progression(uid);
    RETURN jsonb_build_object('merged', false, 'duplicate', true, 'progression', to_jsonb(prog), 'summary', existing.summary);
  END IF;

  prog := public.rt_ensure_progression(uid);

  -- After first migration flag, refuse continuous highest-wins
  IF prog.migrated_from_local THEN
    RETURN jsonb_build_object(
      'merged', false,
      'duplicate', false,
      'refused', true,
      'reason', 'server already authoritative',
      'progression', to_jsonb(prog)
    );
  END IF;

  local_xp := greatest(0, coalesce((p_local->>'lifetimeXp')::bigint, 0));
  local_rep := greatest(0, coalesce((p_local->>'rep')::integer, 0));
  -- Initial migration only: take max once
  merged_xp := greatest(prog.lifetime_xp, local_xp);
  merged_rep := greatest(prog.rep, local_rep);
  merged_keys := coalesce(prog.claimed_reward_keys, '[]'::jsonb) || coalesce(p_local->'claimedRewardKeys', '[]'::jsonb);
  merged_titles := coalesce(prog.unlocked_titles, '[]'::jsonb) || coalesce(p_local->'unlockedTitleIds', '[]'::jsonb);

  PERFORM public.rt_set_mutation_flag();
  UPDATE public.player_progression SET
    lifetime_xp = merged_xp,
    level = public.rt_recompute_level(merged_xp),
    rep = merged_rep,
    claimed_reward_keys = (
      SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(merged_keys) AS value
    ),
    unlocked_titles = (
      SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(merged_titles) AS value
    ),
    discoveries = coalesce(discoveries, '{}'::jsonb) || coalesce(p_local->'discoveries', '{}'::jsonb),
    achievement_progress = coalesce(achievement_progress, '{}'::jsonb) || coalesce(p_local->'achievementProgress', '{}'::jsonb),
    migrated_from_local = true,
    updated_at = now()
  WHERE player_id = uid
  RETURNING * INTO prog;

  UPDATE public.profiles SET rep = merged_rep WHERE id = uid;

  summary := jsonb_build_object(
    'guestIdentity', p_guest_identity,
    'guestXp', local_xp,
    'authXpBefore', greatest(0, coalesce((p_local->>'authLifetimeXpBefore')::bigint, 0)),
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Daily / weekly mission assignment + progress + claim
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_period_missions(p_period_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  period_key text;
  def RECORD;
  assigned integer := 0;
  rows jsonb;
  pick_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_period_type NOT IN ('daily', 'weekly') THEN RAISE EXCEPTION 'invalid period'; END IF;

  PERFORM public.rt_ensure_progression(uid);
  period_key := CASE WHEN p_period_type = 'daily'
    THEN public.rt_utc_daily_key(now())
    ELSE public.rt_utc_weekly_key(now())
  END;
  pick_count := CASE WHEN p_period_type = 'daily' THEN 4 ELSE 3 END;

  -- Deterministic pick: hash player+period, order by md5
  FOR def IN
    SELECT *
    FROM public.mission_definitions
    WHERE period_type = p_period_type AND active = true
    ORDER BY md5(id || uid::text || period_key)
    LIMIT pick_count
  LOOP
    INSERT INTO public.mission_assignments (
      player_id, mission_definition_id, period_type, period_key, progress, target, status
    ) VALUES (
      uid, def.id, p_period_type, period_key, 0, def.target, 'active'
    ) ON CONFLICT DO NOTHING;
    assigned := assigned + 1;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.assigned_at), '[]'::jsonb)
  INTO rows
  FROM public.mission_assignments a
  WHERE a.player_id = uid AND a.period_type = p_period_type AND a.period_key = period_key;

  RETURN jsonb_build_object(
    'periodType', p_period_type,
    'periodKey', period_key,
    'timezone', 'UTC',
    'assignments', rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_period_missions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_period_missions(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_mission_progress(
  p_assignment_id uuid,
  p_progress integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  a public.mission_assignments;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO a FROM public.mission_assignments WHERE id = p_assignment_id AND player_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF a.status NOT IN ('active') THEN
    RETURN to_jsonb(a);
  END IF;

  -- Server clock already locked period; reject stale period keys older than current
  IF a.period_type = 'daily' AND a.period_key <> public.rt_utc_daily_key(now()) THEN
    UPDATE public.mission_assignments SET status = 'expired' WHERE id = a.id RETURNING * INTO a;
    RETURN to_jsonb(a);
  END IF;
  IF a.period_type = 'weekly' AND a.period_key <> public.rt_utc_weekly_key(now()) THEN
    UPDATE public.mission_assignments SET status = 'expired' WHERE id = a.id RETURNING * INTO a;
    RETURN to_jsonb(a);
  END IF;

  a.progress := least(a.target, greatest(a.progress, coalesce(p_progress, 0)));
  IF a.progress >= a.target THEN
    a.status := 'completed';
    a.completed_at := now();
  END IF;

  UPDATE public.mission_assignments SET
    progress = a.progress,
    status = a.status,
    completed_at = a.completed_at
  WHERE id = a.id
  RETURNING * INTO a;

  RETURN to_jsonb(a);
END;
$$;

REVOKE ALL ON FUNCTION public.report_mission_progress(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_mission_progress(uuid, integer) TO authenticated;

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
  source_type text;
  award_result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO a FROM public.mission_assignments WHERE id = p_assignment_id AND player_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF a.status = 'claimed' THEN
    RETURN jsonb_build_object('claimed', false, 'duplicate', true, 'assignment', to_jsonb(a));
  END IF;
  IF a.status <> 'completed' THEN
    RAISE EXCEPTION 'mission not completed';
  END IF;

  SELECT * INTO def FROM public.mission_definitions WHERE id = a.mission_definition_id;
  source_type := CASE WHEN a.period_type = 'daily' THEN 'daily_claim' ELSE 'weekly_claim' END;

  -- Upsert temporary definition amounts from mission row into ledger via custom inserts
  PERFORM public.rt_set_mutation_flag();

  -- Use catalog claim source + mission-specific amounts recorded in metadata
  award_result := public.award_gameplay_reward(
    source_type,
    a.mission_definition_id,
    'mission_claim:' || a.id::text,
    jsonb_build_object(
      'assignmentId', a.id,
      'missionDefinitionId', a.mission_definition_id,
      'xpOverride', def.xp_reward,
      'repOverride', def.rep_reward,
      'seasonOverride', def.season_points,
      'rugOverride', def.rug_points
    )
  );

  UPDATE public.mission_assignments SET status = 'claimed', claimed_at = now()
  WHERE id = a.id RETURNING * INTO a;

  RETURN jsonb_build_object('claimed', true, 'duplicate', false, 'assignment', to_jsonb(a), 'award', award_result);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mission_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_mission_reward(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Eligibility + claim lifecycle (no settlement)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.evaluate_reward_eligibility(
  p_campaign_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  reasons text[] := ARRAY[]::text[];
  eligible boolean := true;
  camp public.sponsored_campaigns;
  prog public.player_progression;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reasons', ARRAY['authentication required'],
      'playerId', NULL
    );
  END IF;

  prog := public.rt_ensure_progression(uid);
  IF prog.manual_review_status = 'restricted' THEN
    eligible := false;
    reasons := array_append(reasons, 'account under review');
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    SELECT * INTO camp FROM public.sponsored_campaigns WHERE id = p_campaign_id;
    IF NOT FOUND THEN
      eligible := false;
      reasons := array_append(reasons, 'campaign not found');
    ELSIF camp.status <> 'active' THEN
      eligible := false;
      reasons := array_append(reasons, 'campaign not active');
    ELSIF camp.funding_reference IS NULL THEN
      eligible := false;
      reasons := array_append(reasons, 'campaign not funded');
    ELSIF now() < camp.starts_at OR now() > camp.ends_at THEN
      eligible := false;
      reasons := array_append(reasons, 'outside campaign window');
    ELSIF camp.budget_distributed >= camp.budget_total THEN
      eligible := false;
      reasons := array_append(reasons, 'campaign budget exhausted');
    END IF;
  END IF;

  IF eligible AND array_length(reasons, 1) IS NULL THEN
    reasons := array_append(reasons, 'ok');
  END IF;

  RETURN jsonb_build_object(
    'eligible', eligible AND (reasons = ARRAY['ok'] OR reasons @> ARRAY['ok']),
    'reasons', reasons,
    'playerId', uid,
    'campaignId', p_campaign_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_reward_eligibility(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_reward_eligibility(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_dev_claim(
  p_amount text,
  p_asset text DEFAULT 'RUG_POINTS',
  p_source text DEFAULT 'dev_mock'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.claimable_rewards;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  -- Development helper: only allow non-SOL/SPL assets here
  IF p_asset IN ('SOL', 'SPL') THEN
    RAISE EXCEPTION 'real asset claims require funded settlement adapter';
  END IF;

  INSERT INTO public.claimable_rewards (
    player_id, reward_asset, amount, source, status, eligibility_snapshot, expires_at
  ) VALUES (
    uid, p_asset, p_amount, p_source, 'eligible',
    jsonb_build_object('mode', 'development'),
    now() + interval '7 days'
  ) RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_dev_claim(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dev_claim(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_claim_status(
  p_claim_id uuid,
  p_next_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.claimable_rewards;
  allowed boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO row FROM public.claimable_rewards WHERE id = p_claim_id AND player_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;

  -- Valid transitions (no completed without settlement evidence)
  IF row.status = 'pending' AND p_next_status IN ('eligible', 'cancelled', 'expired') THEN allowed := true; END IF;
  IF row.status = 'eligible' AND p_next_status IN ('reserved', 'cancelled', 'expired') THEN allowed := true; END IF;
  IF row.status = 'reserved' AND p_next_status IN ('processing', 'cancelled', 'expired') THEN allowed := true; END IF;
  IF row.status = 'processing' AND p_next_status IN ('failed', 'cancelled') THEN allowed := true; END IF;
  -- completed requires transaction_signature — blocked here for real assets
  IF row.status = 'processing' AND p_next_status = 'completed' THEN
    IF row.reward_asset IN ('SOL', 'SPL') THEN
      RAISE EXCEPTION 'completed claim requires verified settlement evidence';
    END IF;
    -- Dev-only completion for RUG_POINTS / COSMETIC / NONE
    allowed := true;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid claim transition % -> %', row.status, p_next_status;
  END IF;

  UPDATE public.claimable_rewards SET
    status = p_next_status,
    claimed_at = CASE WHEN p_next_status = 'completed' THEN now() ELSE claimed_at END
  WHERE id = row.id
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_claim_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_claim_status(uuid, text) TO authenticated;

-- ─── Public leaderboard RPC with pagination ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_season_leaderboard(
  p_season_id text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows jsonb;
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  off integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT * FROM public.season_leaderboard_public
    WHERE season_id = p_season_id
    ORDER BY season_rank
    LIMIT lim OFFSET off
  ) x;

  RETURN jsonb_build_object('seasonId', p_season_id, 'limit', lim, 'offset', off, 'rows', rows);
END;
$$;

REVOKE ALL ON FUNCTION public.get_season_leaderboard(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_leaderboard(text, integer, integer) TO anon, authenticated;

COMMENT ON TABLE public.reward_ledger IS 'Append-only reward ledger. Clients cannot insert.';
COMMENT ON TABLE public.claimable_rewards IS 'Claim lifecycle without Solana settlement in Phase 10G.';
COMMENT ON FUNCTION public.award_gameplay_reward IS 'Server-authoritative gameplay reward grant with idempotency.';
