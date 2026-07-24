-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 10I — Server achievement engine, titles, season pass,
-- reward analytics & operational monitoring.
--
-- Additive to Phase 10G + 10H. Apply AFTER both.
-- No SOL/SPL by default. Premium disabled by default. No fake rewards.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.achievement_category AS ENUM (
    'exploration','missions','progression','social','economy','collectibles',
    'events','seasons','consistency','hidden','special'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.achievement_rarity AS ENUM (
    'common','uncommon','rare','epic','legendary','mythic'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.achievement_def_status AS ENUM (
    'draft','active','paused','retired','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.achievement_progress_status AS ENUM (
    'locked','tracking','completed','claimed','expired','revoked','under_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.achievement_rule_type AS ENUM (
    'cumulative_counter','threshold','unique_set_count','consecutive_streak',
    'sequence_completion','mission_completion_count','specific_mission',
    'building_discovery_count','specific_landmark','specific_district',
    'specific_interior','tutorial_completion','player_level','rep_threshold',
    'season_rank','season_points','daily_mission_streak','weekly_mission_streak',
    'unique_login_days','social_interaction_count','event_participation',
    'title_collection_count','achievement_collection_count','fountain_claimed',
    'wave_sent','title_equipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.season_pass_status AS ENUM (
    'draft','scheduled','active','closing','finalized','archived','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pass_track AS ENUM ('free','premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pass_claim_mode AS ENUM (
    'automatic','manual_claim','claimable_reward','disabled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.entitlement_status AS ENUM (
    'pending','active','expired','revoked','test'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_severity AS ENUM ('info','warning','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_status AS ENUM ('open','acknowledged','resolved','suppressed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.eval_queue_status AS ENUM (
    'pending','processing','completed','failed','dead_letter','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Title definitions (server-owned; separate from ranks / holder tiers)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.title_definitions (
  id              text PRIMARY KEY,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  rarity          public.achievement_rarity NOT NULL DEFAULT 'common',
  icon_key        text,
  source_type     text NOT NULL DEFAULT 'achievement'
                    CHECK (source_type IN (
                      'rank','level','achievement','season_placement','event',
                      'quest','operator_grant','founder','holder','campaign','special'
                    )),
  source_reference text,
  unlock_rule     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_hidden       boolean NOT NULL DEFAULT false,
  is_equippable   boolean NOT NULL DEFAULT true,
  status          public.achievement_def_status NOT NULL DEFAULT 'active',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.title_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "title_definitions: public read active" ON public.title_definitions;
CREATE POLICY "title_definitions: public read active"
  ON public.title_definitions FOR SELECT
  USING (status = 'active' AND is_hidden = false);

-- ─── Player titles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_titles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title_id      text NOT NULL REFERENCES public.title_definitions (id),
  unlocked_at   timestamptz NOT NULL DEFAULT now(),
  source_type   text NOT NULL DEFAULT 'achievement',
  source_id     text,
  is_equipped   boolean NOT NULL DEFAULT false,
  equipped_at   timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, title_id)
);
-- At most one equipped title per player
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_one_equipped_title
  ON public.player_titles (player_id) WHERE is_equipped = true AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_player_titles_player ON public.player_titles (player_id) WHERE revoked_at IS NULL;
ALTER TABLE public.player_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_titles: owner read" ON public.player_titles;
CREATE POLICY "player_titles: owner read"
  ON public.player_titles FOR SELECT USING (auth.uid() = player_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Achievement definitions + versioned rules
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id              text PRIMARY KEY,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  category        public.achievement_category NOT NULL,
  icon_key        text,
  rarity          public.achievement_rarity NOT NULL DEFAULT 'common',
  visibility      text NOT NULL DEFAULT 'public'
                    CHECK (visibility IN ('public','secret','hidden_until_unlock')),
  is_secret       boolean NOT NULL DEFAULT false,
  is_repeatable   boolean NOT NULL DEFAULT false,
  repeat_limit    integer,
  rules_version   integer NOT NULL DEFAULT 1,
  status          public.achievement_def_status NOT NULL DEFAULT 'active',
  title_unlock_id text REFERENCES public.title_definitions (id),
  starts_at       timestamptz,
  ends_at         timestamptz,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "achievement_definitions: public catalog" ON public.achievement_definitions;
CREATE POLICY "achievement_definitions: public catalog"
  ON public.achievement_definitions FOR SELECT
  USING (status = 'active' AND visibility = 'public' AND is_secret = false);

CREATE TABLE IF NOT EXISTS public.achievement_rule_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id        text NOT NULL REFERENCES public.achievement_definitions (id) ON DELETE CASCADE,
  version               integer NOT NULL,
  rule_type             public.achievement_rule_type NOT NULL,
  rule_config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress_target       integer NOT NULL CHECK (progress_target > 0),
  evidence_requirement  text NOT NULL DEFAULT 'none'
                          CHECK (evidence_requirement IN ('none','receipt','ledger','session','operator')),
  minimum_session_trust integer NOT NULL DEFAULT 0,
  reward_xp             integer NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  reward_rep            integer NOT NULL DEFAULT 0 CHECK (reward_rep >= 0),
  reward_rug_points     integer NOT NULL DEFAULT 0 CHECK (reward_rug_points >= 0),
  reward_season_points  integer NOT NULL DEFAULT 0 CHECK (reward_season_points >= 0),
  reward_definition_id  text,
  effective_from        timestamptz NOT NULL DEFAULT now(),
  effective_until       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.profiles (id),
  is_active             boolean NOT NULL DEFAULT true,
  UNIQUE (achievement_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_achievement_one_active_rule
  ON public.achievement_rule_versions (achievement_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rule_versions_type ON public.achievement_rule_versions (rule_type) WHERE is_active = true;
ALTER TABLE public.achievement_rule_versions ENABLE ROW LEVEL SECURITY;
-- Rule configs for secret achievements are not publicly readable.
DROP POLICY IF EXISTS "rule_versions: public non-secret" ON public.achievement_rule_versions;
CREATE POLICY "rule_versions: public non-secret"
  ON public.achievement_rule_versions FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.achievement_definitions d
      WHERE d.id = achievement_id AND d.status = 'active'
        AND d.visibility = 'public' AND d.is_secret = false
    )
  );

-- ─── Player achievement progress ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_achievement_progress (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  achievement_id     text NOT NULL REFERENCES public.achievement_definitions (id),
  rule_version_id    uuid NOT NULL REFERENCES public.achievement_rule_versions (id),
  current_value      integer NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  target_value       integer NOT NULL CHECK (target_value > 0),
  progress_data      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             public.achievement_progress_status NOT NULL DEFAULT 'tracking',
  first_progress_at  timestamptz,
  last_progress_at   timestamptz,
  completed_at       timestamptz,
  last_evidence_id   uuid,
  evaluation_version integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, achievement_id, rule_version_id)
);
CREATE INDEX IF NOT EXISTS idx_ach_progress_player ON public.player_achievement_progress (player_id, status);
ALTER TABLE public.player_achievement_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ach_progress: owner read" ON public.player_achievement_progress;
CREATE POLICY "ach_progress: owner read"
  ON public.player_achievement_progress FOR SELECT USING (auth.uid() = player_id);

-- ─── Achievement unlock records ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_achievements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  achievement_id       text NOT NULL REFERENCES public.achievement_definitions (id),
  rule_version_id      uuid NOT NULL REFERENCES public.achievement_rule_versions (id),
  completion_number    integer NOT NULL DEFAULT 1,
  unlocked_at          timestamptz NOT NULL DEFAULT now(),
  reward_claimed_at    timestamptz,
  reward_ledger_id     uuid,
  source_type          text NOT NULL DEFAULT 'evaluation',
  source_id            text,
  verification_status  text NOT NULL DEFAULT 'verified'
                         CHECK (verification_status IN ('verified','guest_origin','under_review','revoked')),
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, achievement_id, completion_number)
);
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON public.player_achievements (player_id, unlocked_at DESC);
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_achievements: owner read" ON public.player_achievements;
CREATE POLICY "player_achievements: owner read"
  ON public.player_achievements FOR SELECT USING (auth.uid() = player_id);

-- ─── Evaluation queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.achievement_evaluation_queue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_type         text NOT NULL,
  event_id           text,
  event_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key    text NOT NULL,
  status             public.eval_queue_status NOT NULL DEFAULT 'pending',
  attempt_count      integer NOT NULL DEFAULT 0,
  available_at       timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  failed_at          timestamptz,
  error_code         text,
  error_message_safe text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_eval_queue_pending
  ON public.achievement_evaluation_queue (available_at)
  WHERE status = 'pending';
ALTER TABLE public.achievement_evaluation_queue ENABLE ROW LEVEL SECURITY;
-- No player policies — server/operator only.

CREATE TABLE IF NOT EXISTS public.achievement_evaluation_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL,
  achievement_id  text,
  event_type      text NOT NULL,
  result          text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eval_log_player ON public.achievement_evaluation_log (player_id, created_at DESC);
ALTER TABLE public.achievement_evaluation_log ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- Season pass
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.season_passes (
  id                         text PRIMARY KEY,
  season_id                  text NOT NULL REFERENCES public.seasons (id),
  name                       text NOT NULL,
  description                text NOT NULL DEFAULT '',
  status                     public.season_pass_status NOT NULL DEFAULT 'draft',
  starts_at                  timestamptz NOT NULL,
  ends_at                    timestamptz NOT NULL,
  max_tier                   integer NOT NULL DEFAULT 10 CHECK (max_tier > 0),
  points_per_tier            integer NOT NULL DEFAULT 100 CHECK (points_per_tier > 0),
  premium_enabled            boolean NOT NULL DEFAULT false,
  premium_entitlement_type   text,
  is_test                    boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_pass_per_season
  ON public.season_passes (season_id)
  WHERE status = 'active';
ALTER TABLE public.season_passes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "season_passes: public read non-draft" ON public.season_passes;
CREATE POLICY "season_passes: public read non-draft"
  ON public.season_passes FOR SELECT
  USING (status IN ('scheduled','active','closing','finalized','archived'));

CREATE TABLE IF NOT EXISTS public.season_pass_tiers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_pass_id   text NOT NULL REFERENCES public.season_passes (id) ON DELETE CASCADE,
  tier_number      integer NOT NULL CHECK (tier_number > 0),
  points_required  integer NOT NULL CHECK (points_required >= 0),
  name             text,
  icon_key         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_pass_id, tier_number)
);
ALTER TABLE public.season_pass_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pass_tiers: public read" ON public.season_pass_tiers;
CREATE POLICY "pass_tiers: public read"
  ON public.season_pass_tiers FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.season_pass_rewards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_pass_tier_id   uuid NOT NULL REFERENCES public.season_pass_tiers (id) ON DELETE CASCADE,
  track                 public.pass_track NOT NULL DEFAULT 'free',
  reward_type           text NOT NULL DEFAULT 'XP'
                          CHECK (reward_type IN ('XP','REP','RUG_POINTS','SEASON_POINTS','TITLE','COSMETIC','NONE')),
  quantity              integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  title_id              text REFERENCES public.title_definitions (id),
  reward_definition_id  text,
  claim_mode            public.pass_claim_mode NOT NULL DEFAULT 'manual_claim',
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','archived')),
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_pass_tier_id, track)
);
ALTER TABLE public.season_pass_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pass_rewards: public read" ON public.season_pass_rewards;
CREATE POLICY "pass_rewards: public read"
  ON public.season_pass_rewards FOR SELECT USING (status = 'active');

CREATE TABLE IF NOT EXISTS public.player_season_pass (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id               uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  season_pass_id          text NOT NULL REFERENCES public.season_passes (id),
  season_pass_points      integer NOT NULL DEFAULT 0 CHECK (season_pass_points >= 0),
  current_tier            integer NOT NULL DEFAULT 0 CHECK (current_tier >= 0),
  premium_entitled        boolean NOT NULL DEFAULT false,
  premium_entitlement_id  uuid,
  joined_at               timestamptz NOT NULL DEFAULT now(),
  last_progress_at        timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season_pass_id)
);
ALTER TABLE public.player_season_pass ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_season_pass: owner read" ON public.player_season_pass;
CREATE POLICY "player_season_pass: owner read"
  ON public.player_season_pass FOR SELECT USING (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.season_pass_reward_claims (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id              uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  season_pass_id         text NOT NULL REFERENCES public.season_passes (id),
  tier_id                uuid NOT NULL REFERENCES public.season_pass_tiers (id),
  season_pass_reward_id  uuid NOT NULL REFERENCES public.season_pass_rewards (id),
  track                  public.pass_track NOT NULL,
  status                 text NOT NULL DEFAULT 'claimed'
                           CHECK (status IN ('claimed','pending','failed','revoked')),
  reward_ledger_id       uuid,
  claimable_reward_id    uuid,
  claimed_at             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season_pass_reward_id)
);
ALTER TABLE public.season_pass_reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pass_claims: owner read" ON public.season_pass_reward_claims;
CREATE POLICY "pass_claims: owner read"
  ON public.season_pass_reward_claims FOR SELECT USING (auth.uid() = player_id);

-- ─── Entitlements (premium disabled by default; no browser trust) ──────────
CREATE TABLE IF NOT EXISTS public.player_entitlements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  entitlement_type     text NOT NULL,
  source_type          text NOT NULL
                         CHECK (source_type IN (
                           'operator_grant','verified_campaign','verified_nft',
                           'verified_token','payment_provider','test'
                         )),
  source_reference     text,
  starts_at            timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  status               public.entitlement_status NOT NULL DEFAULT 'pending',
  verification_method  text,
  verified_at          timestamptz,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entitlements_player ON public.player_entitlements (player_id, status);
ALTER TABLE public.player_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entitlements: owner read" ON public.player_entitlements;
CREATE POLICY "entitlements: owner read"
  ON public.player_entitlements FOR SELECT USING (auth.uid() = player_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Progression history (explanatory; ledger remains reward SoT)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.player_progression_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_type           text NOT NULL,
  source_type          text,
  source_id            text,
  xp_delta             integer NOT NULL DEFAULT 0,
  rep_delta            integer NOT NULL DEFAULT 0,
  rug_points_delta     integer NOT NULL DEFAULT 0,
  season_points_delta  integer NOT NULL DEFAULT 0,
  season_pass_points_delta integer NOT NULL DEFAULT 0,
  level_before         integer,
  level_after          integer,
  rank_before          text,
  rank_after           text,
  title_id             text,
  achievement_id       text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prog_history_player ON public.player_progression_history (player_id, created_at DESC);
ALTER TABLE public.player_progression_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prog_history: owner read" ON public.player_progression_history;
CREATE POLICY "prog_history: owner read"
  ON public.player_progression_history FOR SELECT USING (auth.uid() = player_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Analytics + operational monitoring
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reward_analytics_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  session_id      uuid,
  event_type      text NOT NULL,
  source_type     text,
  source_id       text,
  asset_type      text,
  amount          integer,
  campaign_id     text,
  season_id       text,
  achievement_id  text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON public.reward_analytics_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_player ON public.reward_analytics_events (player_id, occurred_at DESC);
ALTER TABLE public.reward_analytics_events ENABLE ROW LEVEL SECURITY;
-- No player INSERT/UPDATE — server only. Players cannot read raw analytics of others.
DROP POLICY IF EXISTS "analytics_events: owner read own" ON public.reward_analytics_events;
CREATE POLICY "analytics_events: owner read own"
  ON public.reward_analytics_events FOR SELECT USING (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.economy_daily_snapshots (
  snapshot_date                date PRIMARY KEY,
  active_players               integer NOT NULL DEFAULT 0,
  new_players                  integer NOT NULL DEFAULT 0,
  guest_estimate               integer NOT NULL DEFAULT 0,
  authenticated_players        integer NOT NULL DEFAULT 0,
  xp_emitted                   bigint NOT NULL DEFAULT 0,
  rep_emitted                  bigint NOT NULL DEFAULT 0,
  rug_points_emitted           bigint NOT NULL DEFAULT 0,
  season_points_emitted        bigint NOT NULL DEFAULT 0,
  season_pass_points_emitted   bigint NOT NULL DEFAULT 0,
  rewards_claimed              integer NOT NULL DEFAULT 0,
  rewards_pending              integer NOT NULL DEFAULT 0,
  claim_failures               integer NOT NULL DEFAULT 0,
  settlements_completed        integer NOT NULL DEFAULT 0,
  campaign_budget_reserved     bigint NOT NULL DEFAULT 0,
  campaign_budget_settled      bigint NOT NULL DEFAULT 0,
  achievement_unlock_count     integer NOT NULL DEFAULT 0,
  mission_completion_count     integer NOT NULL DEFAULT 0,
  wallet_verification_count    integer NOT NULL DEFAULT 0,
  suspicious_activity_count    integer NOT NULL DEFAULT 0,
  created_at                   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.economy_daily_snapshots ENABLE ROW LEVEL SECURITY;
-- Operator-only via RPC — no public policy.

CREATE TABLE IF NOT EXISTS public.operational_alerts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity           public.alert_severity NOT NULL DEFAULT 'info',
  category           text NOT NULL,
  code               text NOT NULL,
  title              text NOT NULL,
  message_safe       text NOT NULL DEFAULT '',
  source_type        text,
  source_id          text,
  status             public.alert_status NOT NULL DEFAULT 'open',
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  occurrence_count   integer NOT NULL DEFAULT 1,
  acknowledged_by    uuid REFERENCES public.profiles (id),
  acknowledged_at    timestamptz,
  resolved_by        uuid REFERENCES public.profiles (id),
  resolved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON public.operational_alerts (status, severity) WHERE status = 'open';
ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
-- No player policies.

CREATE TABLE IF NOT EXISTS public.analytics_job_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name           text NOT NULL,
  status             text NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running','completed','failed')),
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  rows_processed     integer NOT NULL DEFAULT 0,
  error_code         text,
  error_message_safe text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_job_runs ENABLE ROW LEVEL SECURITY;

-- Extend player_progression with season-pass points (separate from season points)
ALTER TABLE public.player_progression
  ADD COLUMN IF NOT EXISTS season_pass_points integer NOT NULL DEFAULT 0 CHECK (season_pass_points >= 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed title definitions (mirrors Phase 10F TitleCatalog — server SoT)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.title_definitions (id, slug, name, description, rarity, source_type, source_reference, sort_order)
VALUES
  ('title_early_citizen','early-citizen','Early Citizen','Claimed your first fountain REP.','common','achievement','ach_first_rep',10),
  ('title_spring_regular','spring-regular','Spring Water Regular','Discovered Spring Water Core.','common','achievement','ach_district_spring',20),
  ('title_west_scholar','west-scholar','West District Scholar','Explored the West District.','common','achievement','ach_district_west',30),
  ('title_market_wanderer','market-wanderer','Market Wanderer','Found the Meme Market.','uncommon','achievement','ach_landmark_market',40),
  ('title_alpha_seeker','alpha-seeker','Alpha Seeker','Entered the Alpha Lounge.','uncommon','achievement','ach_interior_alpha',50),
  ('title_whale_watcher','whale-watcher','Whale Watcher','Inspected the Whale Tower.','uncommon','achievement','ach_landmark_whale',60),
  ('title_vault_visitor','vault-visitor','Vault Visitor','Stepped into the Holder Vault.','rare','achievement','ach_interior_vault',70),
  ('title_bridge_crosser','bridge-crosser','Bridge Crosser','Crossed the Main Bridge.','uncommon','achievement','ach_landmark_bridge',80),
  ('title_arena_prospect','arena-prospect','Arena Prospect','Reached the Arena Grounds.','rare','achievement','ach_district_arena',90),
  ('title_town_explorer','town-explorer','Town Explorer','Visited all five districts.','epic','achievement','ach_all_districts',100),
  ('title_mission_runner','mission-runner','Mission Runner','Completed five missions.','uncommon','achievement','ach_missions_5',110),
  ('title_social_butterfly','social-butterfly','Social Butterfly','Met five unique players.','rare','achievement','ach_social_5',120),
  ('title_event_regular','event-regular','Event Regular','Joined three city events.','rare','achievement','ach_events_3',130),
  ('title_rug_survivor','rug-survivor','Rug Survivor','Reached level 10.','epic','achievement','ach_level_10',140),
  ('title_founder','founder','Founder','Reached level 25.','legendary','achievement','ach_level_25',150)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed achievement definitions + active rule versions
-- Helper: insert def + rule in one go via DO block
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rt_seed_achievement(
  p_id text, p_slug text, p_name text, p_desc text,
  p_category public.achievement_category, p_rarity public.achievement_rarity,
  p_rule public.achievement_rule_type, p_target integer, p_config jsonb,
  p_xp integer, p_rep integer, p_title text DEFAULT NULL,
  p_secret boolean DEFAULT false, p_sort integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  INSERT INTO public.achievement_definitions (
    id, slug, name, description, category, rarity, visibility, is_secret,
    title_unlock_id, status, sort_order
  ) VALUES (
    p_id, p_slug, p_name, p_desc, p_category, p_rarity,
    CASE WHEN p_secret THEN 'secret' ELSE 'public' END,
    p_secret, p_title, 'active', p_sort
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.achievement_rule_versions WHERE achievement_id = p_id AND is_active
  ) THEN
    INSERT INTO public.achievement_rule_versions (
      achievement_id, version, rule_type, rule_config, progress_target,
      reward_xp, reward_rep, is_active
    ) VALUES (
      p_id, 1, p_rule, coalesce(p_config, '{}'::jsonb), p_target, p_xp, p_rep, true
    );
  END IF;
END;
$$;

SELECT public.rt_seed_achievement('ach_district_west','district-west','West Bound','Enter the West District.','exploration','common','specific_district',1,'{"districtId":"west"}'::jsonb,40,5,'title_west_scholar',false,10);
SELECT public.rt_seed_achievement('ach_district_spring','district-spring','Spring Arrival','Enter Spring Water Core.','exploration','common','specific_district',1,'{"districtId":"spring_core"}'::jsonb,40,5,'title_spring_regular',false,20);
SELECT public.rt_seed_achievement('ach_district_east','district-east','East Markets','Enter the East District.','exploration','common','specific_district',1,'{"districtId":"east"}'::jsonb,40,5,NULL,false,30);
SELECT public.rt_seed_achievement('ach_district_financial','district-financial','Financial District','Enter the Financial District.','exploration','common','specific_district',1,'{"districtId":"financial"}'::jsonb,45,5,NULL,false,40);
SELECT public.rt_seed_achievement('ach_district_arena','district-arena','Arena Grounds','Enter the Arena Grounds.','exploration','rare','specific_district',1,'{"districtId":"arena_grounds"}'::jsonb,50,8,'title_arena_prospect',false,50);
SELECT public.rt_seed_achievement('ach_all_districts','all-districts','Town Explorer','Visit all five districts.','exploration','epic','unique_set_count',5,'{"setKey":"districts"}'::jsonb,120,25,'title_town_explorer',false,60);
SELECT public.rt_seed_achievement('ach_landmarks_5','landmarks-5','Landmark Scout','Discover five landmarks.','exploration','common','building_discovery_count',5,'{"kind":"landmarks"}'::jsonb,60,10,NULL,false,70);
SELECT public.rt_seed_achievement('ach_landmarks_10','landmarks-10','Landmark Hunter','Discover ten landmarks.','exploration','uncommon','building_discovery_count',10,'{"kind":"landmarks"}'::jsonb,100,15,NULL,false,80);
SELECT public.rt_seed_achievement('ach_landmarks_20','landmarks-20','Landmark Master','Discover twenty landmarks.','exploration','rare','building_discovery_count',20,'{"kind":"landmarks"}'::jsonb,200,40,NULL,false,90);
SELECT public.rt_seed_achievement('ach_landmark_market','landmark-market','Market Finder','Find the Meme Market.','exploration','uncommon','specific_landmark',1,'{"landmarkId":"meme_market"}'::jsonb,35,5,'title_market_wanderer',false,100);
SELECT public.rt_seed_achievement('ach_landmark_whale','landmark-whale','Whale Tower','Inspect the Whale Tower.','events','uncommon','specific_landmark',1,'{"landmarkId":"whale_tower"}'::jsonb,35,5,'title_whale_watcher',false,110);
SELECT public.rt_seed_achievement('ach_landmark_bridge','landmark-bridge','Main Bridge','Cross the Main Bridge.','exploration','uncommon','specific_landmark',1,'{"landmarkId":"main_bridge"}'::jsonb,40,8,'title_bridge_crosser',false,120);
SELECT public.rt_seed_achievement('ach_interior_alpha','interior-alpha','Alpha Lounge','Enter the Alpha Lounge.','exploration','uncommon','specific_interior',1,'{"interiorId":"alpha_lounge"}'::jsonb,45,8,'title_alpha_seeker',false,130);
SELECT public.rt_seed_achievement('ach_interior_vault','interior-vault','Holder Vault','Enter the Holder Vault.','exploration','rare','specific_interior',1,'{"interiorId":"holder_vault"}'::jsonb,50,10,'title_vault_visitor',false,140);
SELECT public.rt_seed_achievement('ach_interiors_3','interiors-3','Interior Tour','Enter three interiors.','exploration','common','building_discovery_count',3,'{"kind":"interiors"}'::jsonb,55,10,NULL,false,150);
SELECT public.rt_seed_achievement('ach_missions_1','missions-1','First Mission','Complete your first mission.','missions','common','mission_completion_count',1,'{}'::jsonb,50,5,NULL,false,160);
SELECT public.rt_seed_achievement('ach_missions_5','missions-5','Mission Runner','Complete five missions.','missions','uncommon','mission_completion_count',5,'{}'::jsonb,100,15,'title_mission_runner',false,170);
SELECT public.rt_seed_achievement('ach_missions_10','missions-10','Mission Veteran','Complete ten missions.','missions','rare','mission_completion_count',10,'{}'::jsonb,150,25,NULL,false,180);
SELECT public.rt_seed_achievement('ach_missions_25','missions-25','Mission Legend','Complete twenty-five missions.','missions','epic','mission_completion_count',25,'{}'::jsonb,250,50,NULL,false,190);
SELECT public.rt_seed_achievement('ach_daily_mission','daily-mission','Daily Duty','Complete a daily mission.','missions','common','cumulative_counter',1,'{"counter":"daily_missions"}'::jsonb,40,5,NULL,false,200);
SELECT public.rt_seed_achievement('ach_weekly_mission','weekly-mission','Weekly Duty','Complete a weekly mission.','missions','uncommon','cumulative_counter',1,'{"counter":"weekly_missions"}'::jsonb,80,15,NULL,false,210);
SELECT public.rt_seed_achievement('ach_social_1','social-1','First Hello','Meet one unique player.','social','common','social_interaction_count',1,'{}'::jsonb,30,5,NULL,false,220);
SELECT public.rt_seed_achievement('ach_social_5','social-5','Social Butterfly','Meet five unique players.','social','rare','social_interaction_count',5,'{}'::jsonb,90,15,'title_social_butterfly',false,230);
SELECT public.rt_seed_achievement('ach_wave_1','wave-1','Friendly Wave','Send a wave.','social','common','wave_sent',1,'{}'::jsonb,20,2,NULL,false,240);
SELECT public.rt_seed_achievement('ach_events_1','events-1','Event Goer','Join a city event.','events','common','event_participation',1,'{}'::jsonb,40,5,NULL,false,250);
SELECT public.rt_seed_achievement('ach_events_3','events-3','Event Regular','Join three city events.','events','rare','event_participation',3,'{}'::jsonb,90,15,'title_event_regular',false,260);
SELECT public.rt_seed_achievement('ach_first_rep','first-rep','First Fountain','Claim fountain REP.','progression','common','fountain_claimed',1,'{}'::jsonb,25,0,'title_early_citizen',false,270);
SELECT public.rt_seed_achievement('ach_level_2','level-2','Getting Started','Reach level 2.','progression','common','player_level',2,'{}'::jsonb,20,5,NULL,false,275);
SELECT public.rt_seed_achievement('ach_level_5','level-5','Level 5','Reach level 5.','progression','common','player_level',5,'{}'::jsonb,40,10,NULL,false,280);
SELECT public.rt_seed_achievement('ach_level_10','level-10','Level 10','Reach level 10.','progression','epic','player_level',10,'{}'::jsonb,80,20,'title_rug_survivor',false,290);
SELECT public.rt_seed_achievement('ach_level_20','level-20','Level 20','Reach level 20.','progression','rare','player_level',20,'{}'::jsonb,120,30,NULL,false,295);
SELECT public.rt_seed_achievement('ach_level_25','level-25','Level 25','Reach level 25.','progression','legendary','player_level',25,'{}'::jsonb,150,40,'title_founder',false,300);
SELECT public.rt_seed_achievement('ach_rep_100','rep-100','REP 100','Earn 100 REP.','progression','common','rep_threshold',100,'{}'::jsonb,50,0,NULL,false,310);
SELECT public.rt_seed_achievement('ach_rep_500','rep-500','REP 500','Earn 500 REP.','progression','uncommon','rep_threshold',500,'{}'::jsonb,100,0,NULL,false,320);
SELECT public.rt_seed_achievement('ach_season_first','season-first','Season Starter','Earn your first season point.','seasons','common','season_points',1,'{}'::jsonb,30,5,NULL,false,330);
SELECT public.rt_seed_achievement('ach_titles_3','titles-3','Title Collector','Collect three titles.','collectibles','uncommon','title_collection_count',3,'{}'::jsonb,60,10,NULL,false,340);
SELECT public.rt_seed_achievement('ach_achievements_5','achievements-5','Achiever','Unlock five achievements.','collectibles','common','achievement_collection_count',5,'{}'::jsonb,50,10,NULL,false,350);
SELECT public.rt_seed_achievement('ach_achievements_10','achievements-10','Overachiever','Unlock ten achievements.','collectibles','rare','achievement_collection_count',10,'{}'::jsonb,100,20,NULL,false,360);
SELECT public.rt_seed_achievement('ach_login_3','login-3','Three Day Citizen','Play on three unique UTC days.','consistency','common','unique_login_days',3,'{}'::jsonb,40,5,NULL,false,370);
SELECT public.rt_seed_achievement('ach_secret_bridge_twice','secret-bridge','Bridge Ritual','A hidden bridge secret.','hidden','epic','specific_landmark',2,'{"landmarkId":"main_bridge"}'::jsonb,75,15,NULL,true,999);

-- ═══════════════════════════════════════════════════════════════════════════
-- TEST season pass (draft, free track only, premium disabled)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.season_passes (
  id, season_id, name, description, status, starts_at, ends_at,
  max_tier, points_per_tier, premium_enabled, is_test
)
SELECT
  'test-pass-2026', 'test-season-2026',
  'TEST Season Pass', 'Zero-value TEST pass. Free track only. Premium disabled.',
  'draft', now(), now() + interval '30 days',
  10, 50, false, true
WHERE EXISTS (SELECT 1 FROM public.seasons WHERE id = 'test-season-2026')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  i integer;
  tid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.season_passes WHERE id = 'test-pass-2026') THEN RETURN; END IF;
  FOR i IN 1..10 LOOP
    INSERT INTO public.season_pass_tiers (season_pass_id, tier_number, points_required, name)
    VALUES ('test-pass-2026', i, (i - 1) * 50, 'TEST Tier ' || i)
    ON CONFLICT (season_pass_id, tier_number) DO NOTHING
    RETURNING id INTO tid;
    SELECT id INTO tid FROM public.season_pass_tiers WHERE season_pass_id = 'test-pass-2026' AND tier_number = i;
    INSERT INTO public.season_pass_rewards (season_pass_tier_id, track, reward_type, quantity, claim_mode)
    VALUES (tid, 'free', CASE WHEN i % 3 = 0 THEN 'REP' WHEN i % 2 = 0 THEN 'RUG_POINTS' ELSE 'XP' END,
            CASE WHEN i % 3 = 0 THEN 5 WHEN i % 2 = 0 THEN 10 ELSE 25 END, 'manual_claim')
    ON CONFLICT (season_pass_tier_id, track) DO NOTHING;
  END LOOP;
END $$;

-- Activate TEST pass (manual operator step documented — NOT auto):
--   UPDATE public.season_passes SET status = 'active', starts_at = now(), ends_at = now() + interval '14 days'
--   WHERE id = 'test-pass-2026' AND is_test = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers: analytics event, progression history, title grant
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rt_analytics_event(
  p_player uuid, p_event text, p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL, p_achievement text DEFAULT NULL,
  p_amount integer DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.reward_analytics_events
    (player_id, event_type, source_type, source_id, achievement_id, amount, metadata)
  VALUES (p_player, p_event, p_source_type, p_source_id, p_achievement, p_amount, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.rt_prog_history(
  p_player uuid, p_event text,
  p_xp integer DEFAULT 0, p_rep integer DEFAULT 0,
  p_rug integer DEFAULT 0, p_season integer DEFAULT 0, p_pass integer DEFAULT 0,
  p_level_before integer DEFAULT NULL, p_level_after integer DEFAULT NULL,
  p_title text DEFAULT NULL, p_achievement text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.player_progression_history (
    player_id, event_type, xp_delta, rep_delta, rug_points_delta,
    season_points_delta, season_pass_points_delta, level_before, level_after,
    title_id, achievement_id, metadata
  ) VALUES (
    p_player, p_event, p_xp, p_rep, p_rug, p_season, p_pass,
    p_level_before, p_level_after, p_title, p_achievement, p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rt_grant_title(
  p_player uuid, p_title_id text, p_source_type text, p_source_id text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count integer := 0;
BEGIN
  IF p_title_id IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.title_definitions
    WHERE id = p_title_id AND status = 'active' AND is_equippable
  ) THEN RETURN false; END IF;

  INSERT INTO public.player_titles (player_id, title_id, source_type, source_id)
  VALUES (p_player, p_title_id, p_source_type, p_source_id)
  ON CONFLICT (player_id, title_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.player_titles WHERE player_id = p_player AND is_equipped AND revoked_at IS NULL) THEN
      UPDATE public.player_titles SET is_equipped = true, equipped_at = now()
      WHERE player_id = p_player AND title_id = p_title_id;
      UPDATE public.player_progression SET equipped_title_id = p_title_id WHERE player_id = p_player;
    END IF;
    UPDATE public.player_progression
    SET unlocked_titles = (
      SELECT coalesce(jsonb_agg(DISTINCT t), '[]'::jsonb)
      FROM (
        SELECT jsonb_array_elements_text(coalesce(unlocked_titles, '[]'::jsonb)) AS t
        UNION SELECT p_title_id
      ) s
    )
    WHERE player_id = p_player;
    PERFORM public.rt_notify(p_player, 'title_unlocked', 'Title unlocked', 'You unlocked a new title.',
      'title', jsonb_build_object('titleId', p_title_id));
    PERFORM public.rt_prog_history(p_player, 'title_unlocked', 0,0,0,0,0, NULL,NULL, p_title_id, NULL);
    PERFORM public.rt_analytics_event(p_player, 'title_unlocked', p_source_type, p_source_id, NULL, NULL,
      jsonb_build_object('titleId', p_title_id));
  END IF;
  RETURN inserted_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_achievement_evaluation(
  p_player_id uuid,
  p_event_type text,
  p_event_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  key text := coalesce(p_idempotency_key, p_player_id::text || ':' || p_event_type || ':' || coalesce(p_event_id, gen_random_uuid()::text));
  row_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_player_id AND NOT public.rt_is_operator('operator') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.achievement_evaluation_queue (player_id, event_type, event_id, event_payload, idempotency_key)
  VALUES (p_player_id, p_event_type, p_event_id, p_payload, key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO row_id;
  RETURN jsonb_build_object('queued', row_id IS NOT NULL, 'id', row_id, 'key', key, 'idempotent', row_id IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_achievement_evaluation(uuid,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_achievement_evaluation(uuid,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rt_rule_value(p_player uuid, p_rule_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.achievement_rule_versions;
  p public.player_progression;
BEGIN
  SELECT * INTO r FROM public.achievement_rule_versions WHERE id = p_rule_id;
  SELECT * INTO p FROM public.player_progression WHERE player_id = p_player;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF r.rule_type = 'player_level' THEN RETURN p.level; END IF;
  IF r.rule_type = 'rep_threshold' THEN RETURN p.rep; END IF;
  IF r.rule_type = 'season_points' THEN RETURN p.season_points; END IF;
  IF r.rule_type = 'title_equipped' THEN RETURN CASE WHEN p.equipped_title_id IS NULL THEN 0 ELSE 1 END; END IF;
  IF r.rule_type = 'title_collection_count' THEN
    RETURN (SELECT count(*)::integer FROM public.player_titles WHERE player_id = p_player AND revoked_at IS NULL);
  END IF;
  IF r.rule_type = 'achievement_collection_count' THEN
    RETURN (SELECT count(*)::integer FROM public.player_achievements WHERE player_id = p_player AND verification_status <> 'revoked');
  END IF;
  IF r.rule_type = 'specific_district' THEN
    RETURN CASE WHEN coalesce(p.discoveries->'districts','[]'::jsonb) ? (r.rule_config->>'districtId') THEN 1 ELSE 0 END;
  END IF;
  IF r.rule_type = 'specific_landmark' THEN
    RETURN CASE WHEN coalesce(p.discoveries->'landmarks','[]'::jsonb) ? (r.rule_config->>'landmarkId') THEN 1 ELSE 0 END;
  END IF;
  IF r.rule_type = 'specific_interior' THEN
    RETURN CASE WHEN coalesce(p.discoveries->'interiors','[]'::jsonb) ? (r.rule_config->>'interiorId') THEN 1 ELSE 0 END;
  END IF;
  IF r.rule_type IN ('unique_set_count','building_discovery_count') THEN
    IF coalesce(r.rule_config->>'setKey', r.rule_config->>'kind') = 'districts' THEN
      RETURN jsonb_array_length(coalesce(p.discoveries->'districts','[]'::jsonb));
    ELSIF coalesce(r.rule_config->>'setKey', r.rule_config->>'kind') = 'landmarks' THEN
      RETURN jsonb_array_length(coalesce(p.discoveries->'landmarks','[]'::jsonb));
    ELSIF coalesce(r.rule_config->>'setKey', r.rule_config->>'kind') = 'interiors' THEN
      RETURN jsonb_array_length(coalesce(p.discoveries->'interiors','[]'::jsonb));
    END IF;
    RETURN 0;
  END IF;
  IF r.rule_type = 'mission_completion_count' THEN RETURN coalesce((p.statistics->>'missionsCompleted')::integer, 0); END IF;
  IF r.rule_type = 'social_interaction_count' THEN RETURN coalesce((p.statistics->>'uniquePlayers')::integer, 0); END IF;
  IF r.rule_type = 'event_participation' THEN RETURN coalesce((p.statistics->>'eventsJoined')::integer, 0); END IF;
  IF r.rule_type = 'fountain_claimed' THEN RETURN CASE WHEN coalesce(p.claimed_reward_keys,'[]'::jsonb) ? 'fountain:claim:first' THEN 1 ELSE 0 END; END IF;
  IF r.rule_type = 'wave_sent' THEN RETURN CASE WHEN coalesce(p.claimed_reward_keys,'[]'::jsonb) ? 'social:wave:once' THEN 1 ELSE 0 END; END IF;
  IF r.rule_type = 'unique_login_days' THEN RETURN coalesce((p.statistics->>'uniqueLoginDays')::integer, 0); END IF;
  IF r.rule_type = 'cumulative_counter' THEN RETURN coalesce((p.statistics->>(r.rule_config->>'counter'))::integer, 0); END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_player_achievements(p_player_id uuid DEFAULT NULL, p_event_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := coalesce(p_player_id, auth.uid());
  rec RECORD;
  value integer;
  prow public.player_achievement_progress;
  unlock_id uuid;
  unlocked integer := 0;
  progressed integer := 0;
  lvl_before integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> uid AND NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'not authorized'; END IF;
-- Local ensure (evaluate already authorizes; avoids nested auth.uid checks)
  INSERT INTO public.player_progression (player_id)
  VALUES (uid) ON CONFLICT (player_id) DO NOTHING;
  SELECT level INTO lvl_before FROM public.player_progression WHERE player_id = uid FOR UPDATE;

  FOR rec IN
    SELECT d.*, r.id AS rule_id, r.progress_target, r.reward_xp, r.reward_rep, r.reward_rug_points, r.reward_season_points
    FROM public.achievement_definitions d
    JOIN public.achievement_rule_versions r ON r.achievement_id = d.id AND r.is_active
    WHERE d.status = 'active' AND (d.starts_at IS NULL OR d.starts_at <= now()) AND (d.ends_at IS NULL OR d.ends_at >= now())
  LOOP
    IF NOT rec.is_repeatable AND EXISTS (
      SELECT 1 FROM public.player_achievements WHERE player_id = uid AND achievement_id = rec.id AND verification_status <> 'revoked'
    ) THEN CONTINUE; END IF;

    value := public.rt_rule_value(uid, rec.rule_id);
    INSERT INTO public.player_achievement_progress
      (player_id, achievement_id, rule_version_id, current_value, target_value, status, first_progress_at, last_progress_at)
    VALUES
      (uid, rec.id, rec.rule_id, value, rec.progress_target,
       CASE WHEN value >= rec.progress_target THEN 'completed' ELSE 'tracking' END,
       CASE WHEN value > 0 THEN now() ELSE NULL END,
       CASE WHEN value > 0 THEN now() ELSE NULL END)
    ON CONFLICT (player_id, achievement_id, rule_version_id) DO UPDATE SET
      current_value = GREATEST(public.player_achievement_progress.current_value, EXCLUDED.current_value),
      status = CASE
        WHEN public.player_achievement_progress.status IN ('claimed','revoked') THEN public.player_achievement_progress.status
        WHEN GREATEST(public.player_achievement_progress.current_value, EXCLUDED.current_value) >= rec.progress_target THEN 'completed'
        ELSE 'tracking' END,
      last_progress_at = CASE WHEN EXCLUDED.current_value > public.player_achievement_progress.current_value THEN now() ELSE public.player_achievement_progress.last_progress_at END,
      updated_at = now()
    RETURNING * INTO prow;
    progressed := progressed + 1;

    IF prow.status = 'completed' AND NOT EXISTS (
      SELECT 1 FROM public.player_achievements WHERE player_id = uid AND achievement_id = rec.id AND verification_status <> 'revoked'
    ) THEN
      INSERT INTO public.player_achievements (player_id, achievement_id, rule_version_id, completion_number, reward_claimed_at)
      VALUES (uid, rec.id, rec.rule_id, 1, now())
      ON CONFLICT (player_id, achievement_id, completion_number) DO NOTHING
      RETURNING id INTO unlock_id;
      IF unlock_id IS NOT NULL THEN
        UPDATE public.player_achievement_progress SET status = 'claimed', completed_at = now() WHERE id = prow.id;
        PERFORM public.rt_set_mutation_flag();
        UPDATE public.player_progression SET
          lifetime_xp = lifetime_xp + rec.reward_xp,
          rep = rep + rec.reward_rep,
          rug_points = rug_points + rec.reward_rug_points,
          season_points = season_points + rec.reward_season_points,
          level = public.rt_recompute_level(lifetime_xp + rec.reward_xp),
          claimed_reward_keys = claimed_reward_keys || jsonb_build_array('achievement:' || rec.id || ':reward')
        WHERE player_id = uid AND NOT (claimed_reward_keys ? ('achievement:' || rec.id || ':reward'));
        IF rec.reward_xp > 0 THEN
          INSERT INTO public.reward_ledger (player_id, reward_type, amount, reason, source_type, source_id, idempotency_key, metadata)
          VALUES (uid, 'XP', rec.reward_xp, 'Achievement unlock', 'achievement', rec.id, 'achievement:' || rec.id || ':xp',
            jsonb_build_object('rep', rec.reward_rep, 'rugPoints', rec.reward_rug_points, 'seasonPoints', rec.reward_season_points))
          ON CONFLICT (player_id, idempotency_key) DO NOTHING;
        END IF;
        IF rec.reward_rep > 0 THEN
          INSERT INTO public.reward_ledger (player_id, reward_type, amount, reason, source_type, source_id, idempotency_key)
          VALUES (uid, 'REP', rec.reward_rep, 'Achievement unlock', 'achievement', rec.id, 'achievement:' || rec.id || ':rep')
          ON CONFLICT (player_id, idempotency_key) DO NOTHING;
        END IF;
        -- mutation flag is transaction-local; no clear needed
        PERFORM public.rt_grant_title(uid, rec.title_unlock_id, 'achievement', rec.id);
        PERFORM public.rt_notify(uid, 'achievement_unlocked', 'Achievement unlocked', rec.name, 'achievement', jsonb_build_object('achievementId', rec.id));
        PERFORM public.rt_prog_history(uid, 'achievement_unlocked', rec.reward_xp, rec.reward_rep, rec.reward_rug_points, rec.reward_season_points, 0,
          lvl_before, (SELECT level FROM public.player_progression WHERE player_id = uid), rec.title_unlock_id, rec.id);
        PERFORM public.rt_analytics_event(uid, 'achievement_unlocked', 'evaluation', unlock_id::text, rec.id);
        unlocked := unlocked + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('playerId', uid, 'progressed', progressed, 'unlocked', unlocked, 'eventType', p_event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_player_achievements(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_player_achievements(uuid,text) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 10I continued — queue processor, titles, season pass, analytics
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_achievement_evaluation_queue(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE job uuid; q public.achievement_evaluation_queue; processed integer := 0; failed integer := 0;
BEGIN
  INSERT INTO public.analytics_job_runs (job_name, status) VALUES ('process_achievement_evaluation_queue', 'running') RETURNING id INTO job;
  FOR q IN SELECT * FROM public.achievement_evaluation_queue WHERE status = 'pending' AND available_at <= now()
           ORDER BY available_at ASC LIMIT least(greatest(coalesce(p_limit,50),1),200) FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.achievement_evaluation_queue SET status='processing', started_at=now(), attempt_count=attempt_count+1 WHERE id=q.id;
      PERFORM public.evaluate_player_achievements(q.player_id, q.event_type);
      UPDATE public.achievement_evaluation_queue SET status='completed', completed_at=now() WHERE id=q.id;
      processed := processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.achievement_evaluation_queue SET status=CASE WHEN attempt_count>=5 THEN 'dead_letter' ELSE 'failed' END,
        failed_at=now(), error_code='eval_error', error_message_safe=left(SQLERRM,200), available_at=now()+interval '5 minutes' WHERE id=q.id;
      failed := failed + 1;
    END;
  END LOOP;
  UPDATE public.analytics_job_runs SET status='completed', completed_at=now(), rows_processed=processed, metadata=jsonb_build_object('failed',failed) WHERE id=job;
  RETURN jsonb_build_object('processed',processed,'failed',failed,'jobId',job);
END; $$;
REVOKE ALL ON FUNCTION public.process_achievement_evaluation_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_achievement_evaluation_queue(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_titles()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', pt.id, 'titleId', pt.title_id, 'name', td.name, 'description', td.description,
    'rarity', td.rarity, 'isEquipped', pt.is_equipped, 'unlockedAt', pt.unlocked_at,
    'sourceType', pt.source_type, 'revokedAt', pt.revoked_at, 'isHidden', td.is_hidden
  ) ORDER BY pt.unlocked_at DESC), '[]'::jsonb)
  INTO rows
  FROM public.player_titles pt JOIN public.title_definitions td ON td.id = pt.title_id
  WHERE pt.player_id = uid;
  RETURN jsonb_build_object('titles', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_titles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_titles() TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_player_title(p_title_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.player_titles WHERE player_id=uid AND title_id=p_title_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'title not owned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.title_definitions WHERE id=p_title_id AND is_equippable AND status='active') THEN
    RAISE EXCEPTION 'title not equippable';
  END IF;
  UPDATE public.player_titles SET is_equipped=false, equipped_at=NULL WHERE player_id=uid AND is_equipped;
  UPDATE public.player_titles SET is_equipped=true, equipped_at=now() WHERE player_id=uid AND title_id=p_title_id;
  UPDATE public.player_progression SET equipped_title_id=p_title_id WHERE player_id=uid;
  PERFORM public.rt_analytics_event(uid, 'title_equipped', 'player', p_title_id);
  PERFORM public.enqueue_achievement_evaluation(uid, 'title', p_title_id, '{}'::jsonb, 'equip:'||uid::text||':'||p_title_id);
  RETURN jsonb_build_object('ok', true, 'equipped', p_title_id);
END; $$;
REVOKE ALL ON FUNCTION public.equip_player_title(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equip_player_title(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unequip_player_title()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.player_titles SET is_equipped=false, equipped_at=NULL WHERE player_id=uid AND is_equipped;
  UPDATE public.player_progression SET equipped_title_id=NULL WHERE player_id=uid;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.unequip_player_title() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unequip_player_title() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_player_title(p_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('playerId', p_player_id, 'titleId', td.id, 'name', td.name, 'rarity', td.rarity)
  INTO result
  FROM public.player_titles pt JOIN public.title_definitions td ON td.id = pt.title_id
  WHERE pt.player_id = p_player_id AND pt.is_equipped AND pt.revoked_at IS NULL AND td.is_hidden = false
  LIMIT 1;
  RETURN coalesce(result, jsonb_build_object('playerId', p_player_id, 'titleId', null));
END; $$;
REVOKE ALL ON FUNCTION public.get_public_player_title(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_player_title(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_achievement_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'slug', d.slug, 'name', d.name, 'description', d.description,
    'category', d.category, 'rarity', d.rarity, 'isSecret', d.is_secret,
    'titleUnlockId', d.title_unlock_id, 'sortOrder', d.sort_order,
    'target', r.progress_target, 'rewardXp', r.reward_xp, 'rewardRep', r.reward_rep
  ) ORDER BY d.sort_order), '[]'::jsonb)
  INTO rows
  FROM public.achievement_definitions d
  JOIN public.achievement_rule_versions r ON r.achievement_id = d.id AND r.is_active
  WHERE d.status = 'active' AND d.visibility = 'public' AND d.is_secret = false;
  RETURN jsonb_build_object('achievements', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_achievement_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_achievement_catalog() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_my_achievements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.unlocked_at DESC), '[]'::jsonb)
  INTO rows FROM public.player_achievements a WHERE a.player_id = uid AND a.verification_status <> 'revoked';
  RETURN jsonb_build_object('unlocks', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_achievements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_achievements() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_achievement_progress()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC), '[]'::jsonb)
  INTO rows FROM public.player_achievement_progress p WHERE p.player_id = uid;
  RETURN jsonb_build_object('progress', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_achievement_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_achievement_progress() TO authenticated;

-- ── Season pass ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_season_pass_catalog(p_pass_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pass_row public.season_passes; tiers jsonb;
BEGIN
  SELECT * INTO pass_row FROM public.season_passes
  WHERE (p_pass_id IS NOT NULL AND id = p_pass_id)
     OR (p_pass_id IS NULL AND status IN ('active','scheduled','closing'))
  ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END
  LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('pass', null, 'tiers', '[]'::jsonb); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'tierNumber', t.tier_number, 'pointsRequired', t.points_required, 'name', t.name,
    'freeReward', (SELECT jsonb_build_object('id', r.id, 'type', r.reward_type, 'quantity', r.quantity, 'claimMode', r.claim_mode)
                   FROM public.season_pass_rewards r WHERE r.season_pass_tier_id = t.id AND r.track='free' AND r.status='active' LIMIT 1),
    'premiumReward', (SELECT jsonb_build_object('id', r.id, 'type', r.reward_type, 'quantity', r.quantity, 'claimMode', r.claim_mode)
                      FROM public.season_pass_rewards r WHERE r.season_pass_tier_id = t.id AND r.track='premium' AND r.status='active' LIMIT 1)
  ) ORDER BY t.tier_number), '[]'::jsonb)
  INTO tiers FROM public.season_pass_tiers t WHERE t.season_pass_id = pass_row.id;

  RETURN jsonb_build_object(
    'pass', jsonb_build_object(
      'id', pass_row.id, 'seasonId', pass_row.season_id, 'name', pass_row.name,
      'description', pass_row.description, 'status', pass_row.status,
      'startsAt', pass_row.starts_at, 'endsAt', pass_row.ends_at,
      'maxTier', pass_row.max_tier, 'pointsPerTier', pass_row.points_per_tier,
      'premiumEnabled', pass_row.premium_enabled, 'isTest', pass_row.is_test
    ),
    'tiers', tiers
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_season_pass_catalog(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_pass_catalog(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_my_season_pass(p_pass_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pass_id text; psp public.player_season_pass; claims jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  pass_id := coalesce(p_pass_id, (SELECT id FROM public.season_passes WHERE status='active' ORDER BY starts_at DESC LIMIT 1));
  IF pass_id IS NULL THEN RETURN jsonb_build_object('pass', null); END IF;

  INSERT INTO public.player_season_pass (player_id, season_pass_id)
  VALUES (uid, pass_id) ON CONFLICT (player_id, season_pass_id) DO NOTHING;
  SELECT * INTO psp FROM public.player_season_pass WHERE player_id=uid AND season_pass_id=pass_id;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO claims
  FROM public.season_pass_reward_claims c WHERE c.player_id=uid AND c.season_pass_id=pass_id;

  RETURN jsonb_build_object(
    'playerPass', to_jsonb(psp),
    'claims', claims,
    'premiumEntitled', psp.premium_entitled
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_my_season_pass(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_season_pass(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_season_pass_progress(p_player_id uuid DEFAULT NULL, p_pass_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := coalesce(p_player_id, auth.uid());
  pass public.season_passes;
  psp public.player_season_pass;
  new_tier integer;
  old_tier integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO pass FROM public.season_passes
  WHERE id = coalesce(p_pass_id, id) AND status = 'active'
  ORDER BY starts_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_active_pass'); END IF;
  IF pass.status = 'finalized' THEN RETURN jsonb_build_object('ok', false, 'reason', 'finalized'); END IF;

  INSERT INTO public.player_season_pass (player_id, season_pass_id)
  VALUES (uid, pass.id) ON CONFLICT (player_id, season_pass_id) DO NOTHING;

  SELECT * INTO psp FROM public.player_season_pass WHERE player_id=uid AND season_pass_id=pass.id FOR UPDATE;
  old_tier := psp.current_tier;
  -- Derive tier from points (server-side only)
  SELECT coalesce(max(tier_number), 0) INTO new_tier
  FROM public.season_pass_tiers
  WHERE season_pass_id = pass.id AND points_required <= psp.season_pass_points;

  IF new_tier > old_tier THEN
    UPDATE public.player_season_pass SET current_tier = new_tier, last_progress_at = now(),
      completed_at = CASE WHEN new_tier >= pass.max_tier THEN now() ELSE completed_at END,
      updated_at = now()
    WHERE id = psp.id;
    PERFORM public.rt_notify(uid, 'season_pass_tier', 'Season Pass tier reached',
      'You reached tier ' || new_tier::text, 'pass', jsonb_build_object('tier', new_tier, 'passId', pass.id));
    PERFORM public.rt_prog_history(uid, 'season_pass_tier', 0,0,0,0,0, NULL,NULL, NULL, NULL,
      jsonb_build_object('tier', new_tier, 'passId', pass.id));
    PERFORM public.rt_analytics_event(uid, 'season_pass_tier_reached', 'season_pass', pass.id, NULL, new_tier);
  END IF;
  RETURN jsonb_build_object('ok', true, 'passId', pass.id, 'points', psp.season_pass_points, 'tier', GREATEST(old_tier, new_tier));
END; $$;
REVOKE ALL ON FUNCTION public.evaluate_season_pass_progress(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_season_pass_progress(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_season_pass_points(
  p_player_id uuid, p_pass_id text, p_points integer, p_idempotency_key text, p_source text DEFAULT 'system'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pass public.season_passes; psp public.player_season_pass;
BEGIN
  IF p_points <= 0 THEN RAISE EXCEPTION 'invalid points'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_player_id AND NOT public.rt_is_operator('operator') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO pass FROM public.season_passes WHERE id = p_pass_id FOR UPDATE;
  IF NOT FOUND OR pass.status <> 'active' THEN RAISE EXCEPTION 'pass not active'; END IF;

  -- Idempotency via analytics event uniqueness on source
  IF EXISTS (
    SELECT 1 FROM public.reward_analytics_events
    WHERE player_id = p_player_id AND event_type = 'season_pass_points' AND source_id = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  INSERT INTO public.player_season_pass (player_id, season_pass_id)
  VALUES (p_player_id, p_pass_id) ON CONFLICT (player_id, season_pass_id) DO NOTHING;

  UPDATE public.player_season_pass
  SET season_pass_points = season_pass_points + p_points, last_progress_at = now(), updated_at = now()
  WHERE player_id = p_player_id AND season_pass_id = p_pass_id
  RETURNING * INTO psp;

  UPDATE public.player_progression
  SET season_pass_points = season_pass_points + p_points WHERE player_id = p_player_id;

  PERFORM public.rt_analytics_event(p_player_id, 'season_pass_points', p_source, p_idempotency_key, NULL, p_points);
  PERFORM public.evaluate_season_pass_progress(p_player_id, p_pass_id);
  RETURN jsonb_build_object('ok', true, 'points', psp.season_pass_points, 'tier', psp.current_tier);
END; $$;
REVOKE ALL ON FUNCTION public.grant_season_pass_points(uuid,text,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_season_pass_points(uuid,text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_season_pass_reward(p_reward_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  reward public.season_pass_rewards;
  tier public.season_pass_tiers;
  pass public.season_passes;
  psp public.player_season_pass;
  claim_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO reward FROM public.season_pass_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR reward.status <> 'active' OR reward.claim_mode = 'disabled' THEN RAISE EXCEPTION 'reward unavailable'; END IF;
  SELECT * INTO tier FROM public.season_pass_tiers WHERE id = reward.season_pass_tier_id;
  SELECT * INTO pass FROM public.season_passes WHERE id = tier.season_pass_id;
  IF pass.status NOT IN ('active','closing') THEN RAISE EXCEPTION 'pass not claimable'; END IF;

  SELECT * INTO psp FROM public.player_season_pass WHERE player_id=uid AND season_pass_id=pass.id FOR UPDATE;
  IF NOT FOUND OR psp.current_tier < tier.tier_number THEN RAISE EXCEPTION 'tier not reached'; END IF;
  IF reward.track = 'premium' THEN
    IF NOT pass.premium_enabled THEN RAISE EXCEPTION 'premium disabled'; END IF;
    IF NOT psp.premium_entitled THEN RAISE EXCEPTION 'premium entitlement required'; END IF;
  END IF;

  INSERT INTO public.season_pass_reward_claims
    (player_id, season_pass_id, tier_id, season_pass_reward_id, track, status)
  VALUES (uid, pass.id, tier.id, reward.id, reward.track, 'claimed')
  ON CONFLICT (player_id, season_pass_reward_id) DO NOTHING
  RETURNING id INTO claim_id;
  IF claim_id IS NULL THEN RETURN jsonb_build_object('ok', true, 'idempotent', true); END IF;

  -- In-game grants only (no SOL/SPL)
  IF reward.reward_type IN ('XP','REP','RUG_POINTS','SEASON_POINTS') THEN
    PERFORM public.rt_set_mutation_flag();
    UPDATE public.player_progression SET
      lifetime_xp = lifetime_xp + CASE WHEN reward.reward_type='XP' THEN reward.quantity ELSE 0 END,
      rep = rep + CASE WHEN reward.reward_type='REP' THEN reward.quantity ELSE 0 END,
      rug_points = rug_points + CASE WHEN reward.reward_type='RUG_POINTS' THEN reward.quantity ELSE 0 END,
      season_points = season_points + CASE WHEN reward.reward_type='SEASON_POINTS' THEN reward.quantity ELSE 0 END,
      level = public.rt_recompute_level(lifetime_xp + CASE WHEN reward.reward_type='XP' THEN reward.quantity ELSE 0 END)
    WHERE player_id = uid;
    IF reward.quantity > 0 THEN
      INSERT INTO public.reward_ledger (player_id, reward_type, amount, reason, source_type, source_id, idempotency_key)
      VALUES (uid, reward.reward_type, reward.quantity, 'Season pass claim', 'season_pass', reward.id::text, 'pass_claim:'||uid::text||':'||reward.id::text)
      ON CONFLICT (player_id, idempotency_key) DO NOTHING;
    END IF;
    -- mutation flag is transaction-local; no clear needed
  ELSIF reward.reward_type = 'TITLE' AND reward.title_id IS NOT NULL THEN
    PERFORM public.rt_grant_title(uid, reward.title_id, 'season_pass', reward.id::text);
  END IF;

  PERFORM public.rt_notify(uid, 'season_pass_reward', 'Season Pass reward claimed', 'You claimed a season pass reward.', 'pass',
    jsonb_build_object('rewardId', reward.id, 'tier', tier.tier_number));
  PERFORM public.rt_analytics_event(uid, 'season_pass_reward_claimed', 'season_pass', reward.id::text, NULL, reward.quantity);
  RETURN jsonb_build_object('ok', true, 'claimId', claim_id);
END; $$;
REVOKE ALL ON FUNCTION public.claim_season_pass_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_season_pass_reward(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 10I part 3 — maintenance, snapshots, alerts, reconciliation, operators
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rt_raise_alert(
  p_severity public.alert_severity, p_category text, p_code text,
  p_title text, p_message text, p_source_type text DEFAULT NULL, p_source_id text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid;
BEGIN
  SELECT id INTO aid FROM public.operational_alerts
  WHERE code = p_code AND status = 'open' LIMIT 1;
  IF aid IS NOT NULL THEN
    UPDATE public.operational_alerts SET last_seen_at = now(), occurrence_count = occurrence_count + 1 WHERE id = aid;
    RETURN aid;
  END IF;
  INSERT INTO public.operational_alerts (severity, category, code, title, message_safe, source_type, source_id)
  VALUES (p_severity, p_category, p_code, p_title, p_message, p_source_type, p_source_id)
  RETURNING id INTO aid;
  RETURN aid;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_economy_daily_snapshot(p_date date DEFAULT (CURRENT_DATE - 1))
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE job uuid; snap public.economy_daily_snapshots;
BEGIN
  INSERT INTO public.analytics_job_runs (job_name, status, metadata)
  VALUES ('generate_economy_daily_snapshot', 'running', jsonb_build_object('date', p_date))
  RETURNING id INTO job;

  INSERT INTO public.economy_daily_snapshots AS s (
    snapshot_date, authenticated_players, xp_emitted, rep_emitted, rug_points_emitted,
    season_points_emitted, season_pass_points_emitted, rewards_claimed, rewards_pending,
    claim_failures, settlements_completed, achievement_unlock_count, mission_completion_count,
    wallet_verification_count
  )
  SELECT
    p_date,
    (SELECT count(*) FROM public.player_progression WHERE updated_at::date = p_date),
    coalesce((SELECT sum(amount) FROM public.reward_ledger WHERE reward_type='XP' AND created_at::date=p_date),0),
    coalesce((SELECT sum(amount) FROM public.reward_ledger WHERE reward_type='REP' AND created_at::date=p_date),0),
    coalesce((SELECT sum(amount) FROM public.reward_ledger WHERE reward_type='RUG_POINTS' AND created_at::date=p_date),0),
    coalesce((SELECT sum(amount) FROM public.reward_ledger WHERE reward_type='SEASON_POINTS' AND created_at::date=p_date),0),
    coalesce((SELECT sum(amount) FROM public.reward_analytics_events WHERE event_type='season_pass_points' AND occurred_at::date=p_date),0),
    (SELECT count(*) FROM public.claimable_rewards WHERE status='completed' AND claimed_at::date=p_date),
    (SELECT count(*) FROM public.claimable_rewards WHERE status NOT IN ('completed','failed','cancelled','expired')),
    (SELECT count(*) FROM public.claimable_rewards WHERE status='failed' AND created_at::date=p_date),
    (SELECT count(*) FROM public.reward_settlements WHERE status='finalized' AND finalized_at::date=p_date),
    (SELECT count(*) FROM public.player_achievements WHERE unlocked_at::date=p_date),
    coalesce((SELECT count(*) FROM public.reward_analytics_events WHERE event_type='mission_completed' AND occurred_at::date=p_date),0),
    (SELECT count(*) FROM public.verified_wallets WHERE verified_at::date=p_date)
  ON CONFLICT (snapshot_date) DO UPDATE SET
    authenticated_players = EXCLUDED.authenticated_players,
    xp_emitted = EXCLUDED.xp_emitted,
    rep_emitted = EXCLUDED.rep_emitted,
    rug_points_emitted = EXCLUDED.rug_points_emitted,
    season_points_emitted = EXCLUDED.season_points_emitted,
    season_pass_points_emitted = EXCLUDED.season_pass_points_emitted,
    rewards_claimed = EXCLUDED.rewards_claimed,
    rewards_pending = EXCLUDED.rewards_pending,
    claim_failures = EXCLUDED.claim_failures,
    settlements_completed = EXCLUDED.settlements_completed,
    achievement_unlock_count = EXCLUDED.achievement_unlock_count,
    mission_completion_count = EXCLUDED.mission_completion_count,
    wallet_verification_count = EXCLUDED.wallet_verification_count
  RETURNING * INTO snap;

  UPDATE public.analytics_job_runs SET status='completed', completed_at=now(), rows_processed=1 WHERE id=job;
  RETURN to_jsonb(snap);
END; $$;
REVOKE ALL ON FUNCTION public.generate_economy_daily_snapshot(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_economy_daily_snapshot(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_progression_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  job uuid;
  queue_result jsonb;
  pending integer;
  failed integer;
  snapshot jsonb;
BEGIN
  INSERT INTO public.analytics_job_runs (job_name, status) VALUES ('run_progression_maintenance', 'running') RETURNING id INTO job;

  -- Process evaluation queue
  queue_result := public.process_achievement_evaluation_queue(100);

  SELECT count(*) INTO pending FROM public.achievement_evaluation_queue WHERE status='pending';
  SELECT count(*) INTO failed FROM public.achievement_evaluation_queue WHERE status IN ('failed','dead_letter');
  IF pending > 200 THEN
    PERFORM public.rt_raise_alert('warning','achievements','eval_backlog','Achievement evaluation backlog',
      'Pending evaluations exceed 200', 'queue', NULL);
  END IF;
  IF failed > 20 THEN
    PERFORM public.rt_raise_alert('high','achievements','eval_failures','Repeated evaluation failures',
      'Failed/dead-letter evaluations exceed 20', 'queue', NULL);
  END IF;

  snapshot := public.generate_economy_daily_snapshot(CURRENT_DATE - 1);

  -- Detect stuck claims (eligible > 7 days)
  IF EXISTS (
    SELECT 1 FROM public.claimable_rewards
    WHERE status IN ('eligible','reserved') AND created_at < now() - interval '7 days'
  ) THEN
    PERFORM public.rt_raise_alert('warning','claims','stuck_claims','Stuck claims detected',
      'Claims eligible/reserved for more than 7 days', 'claims', NULL);
  END IF;

  UPDATE public.analytics_job_runs SET status='completed', completed_at=now(),
    metadata = jsonb_build_object('queue', queue_result, 'pending', pending, 'failed', failed)
  WHERE id = job;

  RETURN jsonb_build_object('ok', true, 'queue', queue_result, 'pending', pending, 'failed', failed, 'jobId', job);
END; $$;
REVOKE ALL ON FUNCTION public.run_progression_maintenance() FROM PUBLIC;
-- Scheduler / service role; operators may invoke via authenticated if they are operators
GRANT EXECUTE ON FUNCTION public.run_progression_maintenance() TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_player_achievement(p_player_id uuid, p_achievement_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_unlock boolean; has_ledger boolean;
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  has_unlock := EXISTS (SELECT 1 FROM public.player_achievements WHERE player_id=p_player_id AND achievement_id=p_achievement_id AND verification_status<>'revoked');
  has_ledger := EXISTS (SELECT 1 FROM public.reward_ledger WHERE player_id=p_player_id AND source_type='achievement' AND source_id=p_achievement_id);

  IF has_unlock AND NOT has_ledger THEN
    -- Unlock without reward: re-run evaluation path by re-claiming through evaluate (idempotent)
    PERFORM public.evaluate_player_achievements(p_player_id, 'full');
    RETURN jsonb_build_object('ok', true, 'action', 'reevaluated', 'hadUnlock', true, 'hadLedger', false);
  END IF;
  IF has_ledger AND NOT has_unlock THEN
    PERFORM public.rt_raise_alert('high','achievements','orphan_ledger','Reward without unlock record',
      'Ledger entry exists without achievement unlock', 'achievement', p_achievement_id);
    RETURN jsonb_build_object('ok', true, 'action', 'alerted', 'hadUnlock', false, 'hadLedger', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', 'none', 'hadUnlock', has_unlock, 'hadLedger', has_ledger);
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_player_achievement(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_player_achievement(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_season_pass_claim(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.season_pass_reward_claims;
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  SELECT * INTO c FROM public.season_pass_reward_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  RETURN jsonb_build_object('ok', true, 'claim', to_jsonb(c),
    'note', 'Season-pass claims are idempotent; re-claiming the same reward is a no-op.');
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_season_pass_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_season_pass_claim(uuid) TO authenticated;

-- Operator dashboard aggregate (safe fields only)
CREATE OR REPLACE FUNCTION public.get_progression_ops_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  RETURN jsonb_build_object(
    'pendingEvaluations', (SELECT count(*) FROM public.achievement_evaluation_queue WHERE status='pending'),
    'failedEvaluations', (SELECT count(*) FROM public.achievement_evaluation_queue WHERE status IN ('failed','dead_letter')),
    'openAlerts', (SELECT count(*) FROM public.operational_alerts WHERE status='open'),
    'activeSeasonPass', (SELECT id FROM public.season_passes WHERE status='active' LIMIT 1),
    'achievementUnlocksToday', (SELECT count(*) FROM public.player_achievements WHERE unlocked_at::date = CURRENT_DATE),
    'passPlayers', (SELECT count(*) FROM public.player_season_pass),
    'lastJob', (SELECT to_jsonb(j) FROM public.analytics_job_runs j ORDER BY started_at DESC LIMIT 1),
    'latestSnapshot', (SELECT to_jsonb(s) FROM public.economy_daily_snapshots s ORDER BY snapshot_date DESC LIMIT 1)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_progression_ops_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_progression_ops_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_operational_alerts(p_status text DEFAULT 'open')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb;
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.severity DESC, a.last_seen_at DESC), '[]'::jsonb)
  INTO rows FROM public.operational_alerts a WHERE a.status = p_status;
  RETURN jsonb_build_object('alerts', rows);
END; $$;
REVOKE ALL ON FUNCTION public.list_operational_alerts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_operational_alerts(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_operational_alert(p_alert_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  UPDATE public.operational_alerts SET status='acknowledged', acknowledged_by=auth.uid(), acknowledged_at=now()
  WHERE id = p_alert_id AND status='open';
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.acknowledge_operational_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_operational_alert(uuid) TO authenticated;

-- Operator title grant / revoke (audited)
CREATE OR REPLACE FUNCTION public.operator_grant_title(p_player_id uuid, p_title_id text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rt_is_operator('admin') THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;
  PERFORM public.rt_grant_title(p_player_id, p_title_id, 'operator_grant', auth.uid()::text);
  PERFORM public.rt_analytics_event(p_player_id, 'operator_title_grant', 'operator', auth.uid()::text, NULL, NULL,
    jsonb_build_object('titleId', p_title_id, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.operator_grant_title(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_grant_title(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.operator_revoke_title(p_player_id uuid, p_title_id text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rt_is_operator('admin') THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.player_titles SET revoked_at = now(), is_equipped = false
  WHERE player_id = p_player_id AND title_id = p_title_id AND revoked_at IS NULL;
  UPDATE public.player_progression SET equipped_title_id = NULL
  WHERE player_id = p_player_id AND equipped_title_id = p_title_id;
  PERFORM public.rt_analytics_event(p_player_id, 'operator_title_revoke', 'operator', auth.uid()::text, NULL, NULL,
    jsonb_build_object('titleId', p_title_id, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.operator_revoke_title(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_revoke_title(uuid,text,text) TO authenticated;

-- Test entitlement grant (premium remains disabled unless pass.premium_enabled)
CREATE OR REPLACE FUNCTION public.grant_test_entitlement(p_player_id uuid, p_type text DEFAULT 'season_pass_premium')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eid uuid;
BEGIN
  IF NOT public.rt_is_operator('admin') THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  INSERT INTO public.player_entitlements
    (player_id, entitlement_type, source_type, status, verification_method, verified_at, expires_at)
  VALUES (p_player_id, p_type, 'test', 'test', 'operator', now(), now() + interval '7 days')
  RETURNING id INTO eid;
  UPDATE public.player_season_pass SET premium_entitled = true, premium_entitlement_id = eid
  WHERE player_id = p_player_id;
  RETURN jsonb_build_object('ok', true, 'entitlementId', eid);
END; $$;
REVOKE ALL ON FUNCTION public.grant_test_entitlement(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_test_entitlement(uuid,text) TO authenticated;

COMMENT ON TABLE public.achievement_definitions IS 'Phase 10I server-owned achievement catalog.';
COMMENT ON TABLE public.season_passes IS 'Phase 10I season pass. Premium disabled by default. TEST pass is draft.';
COMMENT ON TABLE public.operational_alerts IS 'Phase 10I operator-only alerts. Never publicly readable.';
COMMENT ON FUNCTION public.evaluate_player_achievements IS 'Server-side achievement evaluation. Browser never decides completion.';
