-- ═══════════════════════════════════════════════════════════════════════════
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



-- ===== BEGIN database/schema.sql =====

-- ──────────────────────────────────────────────────────────────────────────────
-- RugTown — Supabase PostgreSQL Schema
-- ──────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query) or push
-- via the Supabase CLI:
--   supabase db push
--
-- The file is idempotent — safe to re-run with CREATE … IF NOT EXISTS and
-- DROP TRIGGER IF EXISTS guards.
--
-- Tables
--   profiles               core user record (auto-created on auth signup)
--   character_appearance   modular character customisation
--   player_badges          badges earned in gameplay
--   player_inventory       items owned by the player
--   district_unlocks       which city districts have been unlocked
--   wallet_verifications   Phase 3 placeholder (Solana wallet linking)
--
-- Every table has Row-Level Security enabled so that users can only access
-- their own rows.  The public anon key used by the browser client never has
-- privileged access.
-- ──────────────────────────────────────────────────────────────────────────────

-- Required for gen_random_uuid() defaults used throughout RugTown migrations.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users entry.  Created automatically by the trigger at the
-- bottom of this file so application code never has to INSERT here directly.

CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username       text        NOT NULL UNIQUE,
  display_name   text,
  avatar_url     text,
  rep            integer     NOT NULL DEFAULT 0,
  holder_tier    text        NOT NULL DEFAULT 'None'
                               CHECK (holder_tier IN ('None', 'Bronze', 'Silver', 'Gold')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles               IS 'Core user profile, one row per auth.users entry.';
COMMENT ON COLUMN public.profiles.username      IS 'Unique display handle chosen at signup.';
COMMENT ON COLUMN public.profiles.rep           IS 'Accumulated reputation points.';
COMMENT ON COLUMN public.profiles.holder_tier   IS 'Mock holder tier; driven by wallet verification in Phase 3.';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read any profile (needed for leaderboard and future multiplayer).
CREATE POLICY "profiles: public read"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Users can only update their own row.
CREATE POLICY "profiles: owner update"
  ON public.profiles
  FOR UPDATE
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Direct inserts are handled by the trigger; deny manual inserts from clients.
CREATE POLICY "profiles: trigger insert only"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);


-- ─── character_appearance ────────────────────────────────────────────────────
-- Stores the player's current character creator selections.
-- Column names mirror the CharacterAppearance interface in
-- src/game/world/CharacterAppearance.ts.

CREATE TABLE IF NOT EXISTS public.character_appearance (
  user_id     uuid        PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  skin_tone   text        NOT NULL DEFAULT 'tan',
  hairstyle   text        NOT NULL DEFAULT 'hoodieHood',
  facial_hair text        NOT NULL DEFAULT 'none',
  hat         text        NOT NULL DEFAULT 'none',
  glasses     text        NOT NULL DEFAULT 'none',
  accessory   text        NOT NULL DEFAULT 'none',
  jacket      text        NOT NULL DEFAULT 'degenHoodie',
  pants       text        NOT NULL DEFAULT 'darkDenim',
  shoes       text        NOT NULL DEFAULT 'sneakersBlack',
  backpack    text        NOT NULL DEFAULT 'none',
  handheld    text        NOT NULL DEFAULT 'none',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.character_appearance IS 'Modular character appearance; defaults reproduce the in-game look at first login.';

ALTER TABLE public.character_appearance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "character_appearance: owner all"
  ON public.character_appearance
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── player_badges ───────────────────────────────────────────────────────────
-- One row per badge earned.  badge_id values match the BADGES array
-- in src/components/GamePage.tsx (e.g. 'first-rep', 'whale-watcher-plus').

CREATE TABLE IF NOT EXISTS public.player_badges (
  id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id   uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_id  text        NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

COMMENT ON TABLE public.player_badges IS 'Badges earned in-game; badge_id matches the BADGES constant in GamePage.tsx.';

ALTER TABLE public.player_badges ENABLE ROW LEVEL SECURITY;

-- Owner can read/write their own badges.
CREATE POLICY "player_badges: owner all"
  ON public.player_badges
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read badges (for profile display / leaderboard).
CREATE POLICY "player_badges: public read"
  ON public.player_badges
  FOR SELECT
  USING (true);


-- ─── player_inventory ────────────────────────────────────────────────────────
-- Items owned by the player.  item_id values will match a future item
-- catalog; for now they correspond to MOCK_ITEMS in GamePage.tsx.

CREATE TABLE IF NOT EXISTS public.player_inventory (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  item_id     text        NOT NULL,
  quantity    integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

COMMENT ON TABLE public.player_inventory IS 'Items owned by a player; item_id will join to a future item catalog.';

ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_inventory: owner all"
  ON public.player_inventory
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── district_unlocks ────────────────────────────────────────────────────────
-- Tracks which city districts each player has unlocked.
-- district_id values match the DISTRICTS array in GamePage.tsx
-- (e.g. 'spawn-plaza', 'meme-market', 'hall-of-fame').

CREATE TABLE IF NOT EXISTS public.district_unlocks (
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  district_id text        NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, district_id)
);

COMMENT ON TABLE public.district_unlocks IS 'City districts the player has unlocked; district_id matches the DISTRICTS constant in GamePage.tsx.';

ALTER TABLE public.district_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "district_unlocks: owner all"
  ON public.district_unlocks
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── wallet_verifications ────────────────────────────────────────────────────
-- Phase 3 placeholder — not used until Solana wallet linking is implemented.
-- Defined now so migrations remain clean and no ALTER TABLE is needed later.

CREATE TABLE IF NOT EXISTS public.wallet_verifications (
  user_id        uuid        PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  wallet_address text        NOT NULL UNIQUE,
  chain          text        NOT NULL DEFAULT 'solana',
  verified_at    timestamptz,
  token_balance  numeric,
  holder_tier    text        CHECK (holder_tier IN ('None', 'Bronze', 'Silver', 'Gold')),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wallet_verifications IS 'Phase 3: Solana wallet ownership proofs and on-chain holder-tier cache.';

ALTER TABLE public.wallet_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_verifications: owner all"
  ON public.wallet_verifications
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── Trigger: auto-create profile on signup ──────────────────────────────────
-- Fires after every INSERT into auth.users so application code never needs
-- to create the profile row manually.
--
-- Username preference order:
--   1. The username chosen at signup — passed by the client via
--      supabase.auth.signUp({ options: { data: { username, display_name } } }),
--      which lands in NEW.raw_user_meta_data.
--   2. The email local-part (for any legacy / metadata-less signups).
--   3. A generic 'degen' handle.
-- The chosen handle is sanitised, and a short random suffix is appended if the
-- username is already taken so the UNIQUE constraint never blocks signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER            -- runs with the privileges of the function owner
SET search_path = public    -- prevent search_path injection
AS $$
DECLARE
  raw_username text;
  raw_display  text;
  base_name    text;
  candidate    text;
  final_name   text;
  attempt      int := 0;
BEGIN
  raw_username := NEW.raw_user_meta_data->>'username';
  raw_display  := NEW.raw_user_meta_data->>'display_name';

  -- Sanitise the chosen username; fall back to the email prefix, then 'degen'.
  base_name := lower(regexp_replace(coalesce(raw_username, ''), '[^a-z0-9_]', '', 'g'));
  IF base_name = '' THEN
    base_name := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  END IF;
  base_name := left(coalesce(nullif(base_name, ''), 'degen'), 24);

  -- Try the plain handle first, adding a short random suffix on collision.
  candidate := base_name;
  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, display_name)
      VALUES (
        NEW.id,
        candidate,
        coalesce(nullif(raw_display, ''), nullif(raw_username, ''), candidate)
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;                        -- inserted, or id row already existed
    EXCEPTION WHEN unique_violation THEN  -- username already taken
      attempt := attempt + 1;
      IF attempt >= 5 THEN
        -- Last resort: append 8 hex chars from the UUID (guaranteed unique).
        final_name := left(base_name, 15) || '_' || substr(replace(NEW.id::text, '-', ''), 1, 8);
        INSERT INTO public.profiles (id, username, display_name)
        VALUES (NEW.id, final_name, coalesce(nullif(raw_display, ''), final_name))
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END IF;
      candidate := left(base_name, 18) || '_' || substr(md5(random()::text || NEW.id::text), 1, 5);
    END;
  END LOOP;
END;
$$;

-- Drop before re-create so this file is safe to run multiple times.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Leaderboard sort (profiles ordered by rep descending).
CREATE INDEX IF NOT EXISTS idx_profiles_rep
  ON public.profiles (rep DESC);

-- Lookup all badges for a user.
CREATE INDEX IF NOT EXISTS idx_player_badges_user_id
  ON public.player_badges (user_id);

-- Lookup inventory for a user.
CREATE INDEX IF NOT EXISTS idx_player_inventory_user_id
  ON public.player_inventory (user_id);

-- Lookup unlocked districts for a user.
CREATE INDEX IF NOT EXISTS idx_district_unlocks_user_id
  ON public.district_unlocks (user_id);


-- ===== END database/schema.sql =====



-- ===== BEGIN database/migrations/20260716_phase10g_rewards.sql =====

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


-- ===== END database/migrations/20260716_phase10g_rewards.sql =====



-- ===== BEGIN database/migrations/20260716_phase10h_reward_operations.sql =====

-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 10H — Production reward operations, settlement, wallet
-- verification, attestation, sessions, notifications, season lifecycle.
--
-- Additive to 20260716_phase10g_rewards.sql. Apply AFTER 10G.
-- No SOL/SPL transfers. No secrets. No fake signatures.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Enums (idempotent) ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.reward_claim_state AS ENUM (
    'created', 'eligibility_pending', 'eligible', 'ineligible',
    'awaiting_wallet', 'awaiting_review', 'approved',
    'settlement_preparing', 'settlement_submitted', 'settlement_confirming',
    'completed', 'failed', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reward_settlement_state AS ENUM (
    'not_started', 'prepared', 'submitted', 'processed',
    'confirmed', 'finalized', 'failed', 'reversed', 'manual_intervention'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.settlement_mode AS ENUM (
    'disabled', 'manual_review', 'multisig', 'automated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.season_state AS ENUM (
    'draft', 'scheduled', 'active', 'closing', 'finalized', 'archived', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.funding_state AS ENUM (
    'unfunded', 'verification_pending', 'verified',
    'partially_funded', 'insufficient', 'expired', 'test_only'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Operator roles (server-validated, not client boolean) ─────────────────
CREATE TABLE IF NOT EXISTS public.reward_operators (
  player_id   uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'operator'
                CHECK (role IN ('operator', 'reviewer', 'admin')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES public.profiles (id),
  active      boolean NOT NULL DEFAULT true
);
ALTER TABLE public.reward_operators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_operators: self read" ON public.reward_operators;
CREATE POLICY "reward_operators: self read"
  ON public.reward_operators FOR SELECT USING (auth.uid() = player_id);

CREATE OR REPLACE FUNCTION public.rt_is_operator(p_min_role text DEFAULT 'operator')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reward_operators o
    WHERE o.player_id = auth.uid()
      AND o.active = true
      AND (
        p_min_role = 'operator'
        OR (p_min_role = 'reviewer' AND o.role IN ('reviewer', 'admin'))
        OR (p_min_role = 'admin' AND o.role = 'admin')
      )
  );
$$;

-- ─── Settlement configuration (server-only readable) ───────────────────────
CREATE TABLE IF NOT EXISTS public.settlement_config (
  id                     text PRIMARY KEY DEFAULT 'default',
  mode                   public.settlement_mode NOT NULL DEFAULT 'disabled',
  network                text NOT NULL DEFAULT 'devnet',
  min_confirmations      text NOT NULL DEFAULT 'finalized',
  verification_window_s  integer NOT NULL DEFAULT 3600,
  treasury_public_address text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settlement_config ENABLE ROW LEVEL SECURITY;
-- No client policy: only SECURITY DEFINER / service role reads this.

INSERT INTO public.settlement_config (id, mode, network)
VALUES ('default', 'disabled', 'devnet')
ON CONFLICT (id) DO NOTHING;

-- ─── Game sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  client_build   text,
  device_hash    text,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'ended', 'invalidated', 'expired')),
  session_nonce  text NOT NULL,
  risk_score     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_player ON public.game_sessions (player_id, status);
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "game_sessions: owner read" ON public.game_sessions;
CREATE POLICY "game_sessions: owner read"
  ON public.game_sessions FOR SELECT USING (auth.uid() = player_id);

-- ─── Gameplay action receipts (attestation) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gameplay_action_receipts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  session_id          uuid REFERENCES public.game_sessions (id) ON DELETE SET NULL,
  action_type         text NOT NULL,
  target_id           text,
  sequence_number     bigint NOT NULL,
  client_timestamp    timestamptz,
  server_received_at  timestamptz NOT NULL DEFAULT now(),
  nonce               text NOT NULL,
  evidence_hash       text,
  status              text NOT NULL DEFAULT 'accepted'
                        CHECK (status IN ('accepted', 'rejected', 'consumed', 'flagged')),
  risk_flags          jsonb NOT NULL DEFAULT '[]'::jsonb,
  consumed_by_reward_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, nonce),
  UNIQUE (player_id, session_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_action_receipts_player ON public.gameplay_action_receipts (player_id, action_type, status);
ALTER TABLE public.gameplay_action_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "action_receipts: owner read" ON public.gameplay_action_receipts;
CREATE POLICY "action_receipts: owner read"
  ON public.gameplay_action_receipts FOR SELECT USING (auth.uid() = player_id);

-- ─── Wallet verification challenges ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_verification_challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  nonce          text NOT NULL,
  message        text NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'used', 'expired', 'failed')),
  attempt_count  integer NOT NULL DEFAULT 0,
  ip_hash        text,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nonce)
);
CREATE INDEX IF NOT EXISTS idx_wallet_challenges_player ON public.wallet_verification_challenges (player_id, status);
ALTER TABLE public.wallet_verification_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_challenges: owner read" ON public.wallet_verification_challenges;
CREATE POLICY "wallet_challenges: owner read"
  ON public.wallet_verification_challenges FOR SELECT USING (auth.uid() = player_id);

-- ─── Verified wallets (server-write only) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verified_wallets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  wallet_address      text NOT NULL,
  verification_method text NOT NULL DEFAULT 'signature',
  is_primary          boolean NOT NULL DEFAULT false,
  verified_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, wallet_address)
);
-- Prevent one wallet across multiple accounts (unless revoked)
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_wallet_active
  ON public.verified_wallets (wallet_address)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_verified_wallets_player ON public.verified_wallets (player_id) WHERE revoked_at IS NULL;
ALTER TABLE public.verified_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "verified_wallets: owner read" ON public.verified_wallets;
CREATE POLICY "verified_wallets: owner read"
  ON public.verified_wallets FOR SELECT USING (auth.uid() = player_id);

-- ─── Reward settlements ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_settlements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            uuid NOT NULL REFERENCES public.claimable_rewards (id) ON DELETE CASCADE,
  player_id           uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  wallet_address      text,
  asset_type          text NOT NULL DEFAULT 'NONE'
                        CHECK (asset_type IN ('NONE', 'RUG_POINTS', 'SOL', 'SPL', 'COSMETIC')),
  mint_address        text,
  amount_atomic       bigint NOT NULL DEFAULT 0 CHECK (amount_atomic >= 0),
  decimals            integer NOT NULL DEFAULT 0,
  network             text NOT NULL DEFAULT 'devnet',
  settlement_mode     public.settlement_mode NOT NULL DEFAULT 'disabled',
  status              public.reward_settlement_state NOT NULL DEFAULT 'not_started',
  transaction_signature text,
  transaction_slot    bigint,
  block_time          timestamptz,
  confirmation_status text,
  error_code          text,
  error_message_safe  text,
  idempotency_key     text NOT NULL,
  attempt_count       integer NOT NULL DEFAULT 0,
  prepared_at         timestamptz,
  submitted_at        timestamptz,
  confirmed_at        timestamptz,
  finalized_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
-- One completed settlement per claim
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_completed_claim
  ON public.reward_settlements (claim_id)
  WHERE status IN ('confirmed', 'finalized');
-- No duplicate transaction signatures
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_signature
  ON public.reward_settlements (transaction_signature)
  WHERE transaction_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlements_player ON public.reward_settlements (player_id, status);
ALTER TABLE public.reward_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_settlements: owner read" ON public.reward_settlements;
CREATE POLICY "reward_settlements: owner read"
  ON public.reward_settlements FOR SELECT USING (auth.uid() = player_id);

-- ─── Claim audit log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_claim_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        uuid NOT NULL REFERENCES public.claimable_rewards (id) ON DELETE CASCADE,
  from_state      text,
  to_state        text NOT NULL,
  actor_type      text NOT NULL CHECK (actor_type IN ('system', 'player', 'operator', 'scheduler', 'reconciler')),
  actor_id        uuid,
  note_safe       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claim_audit_claim ON public.reward_claim_audit (claim_id, created_at);
ALTER TABLE public.reward_claim_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claim_audit: owner read" ON public.reward_claim_audit;
CREATE POLICY "claim_audit: owner read"
  ON public.reward_claim_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.claimable_rewards c WHERE c.id = claim_id AND c.player_id = auth.uid()));

-- ─── Manual review (private notes) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.claim_reviews (
  claim_id        uuid PRIMARY KEY REFERENCES public.claimable_rewards (id) ON DELETE CASCADE,
  review_status   text NOT NULL DEFAULT 'pending'
                    CHECK (review_status IN ('pending', 'approved', 'rejected', 'on_hold')),
  reviewer_id     uuid REFERENCES public.profiles (id),
  review_notes    text,
  risk_score      integer NOT NULL DEFAULT 0,
  risk_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_at     timestamptz,
  rejected_at     timestamptz,
  payout_batch    text,
  operational_hold boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.claim_reviews ENABLE ROW LEVEL SECURITY;
-- Private: only operators (via RPC) — no owner/public policy.

-- ─── Player notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  message     text NOT NULL DEFAULT '',
  icon        text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read     boolean NOT NULL DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notifications_player ON public.player_notifications (player_id, is_read, created_at DESC);
ALTER TABLE public.player_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications: owner read" ON public.player_notifications;
CREATE POLICY "notifications: owner read"
  ON public.player_notifications FOR SELECT USING (auth.uid() = player_id);
DROP POLICY IF EXISTS "notifications: owner update read state" ON public.player_notifications;
CREATE POLICY "notifications: owner update read state"
  ON public.player_notifications FOR UPDATE
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- ─── Season snapshots (immutable finalized standings) ──────────────────────
CREATE TABLE IF NOT EXISTS public.season_leaderboard_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id          text NOT NULL REFERENCES public.seasons (id),
  player_id          uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  final_rank         integer NOT NULL,
  season_points      integer NOT NULL,
  level              integer NOT NULL,
  equipped_title_id  text,
  reward_allocation_ref text,
  snapshot_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_season_snapshots ON public.season_leaderboard_snapshots (season_id, final_rank);
ALTER TABLE public.season_leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "season_snapshots: public read" ON public.season_leaderboard_snapshots;
CREATE POLICY "season_snapshots: public read"
  ON public.season_leaderboard_snapshots FOR SELECT USING (true);

-- ─── Extend seasons with lifecycle state + funding ─────────────────────────
ALTER TABLE public.seasons ADD COLUMN IF NOT EXISTS lifecycle public.season_state;
UPDATE public.seasons SET lifecycle = 'draft'::public.season_state WHERE lifecycle IS NULL;
ALTER TABLE public.seasons ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.seasons ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- ─── Extend campaigns/pools with atomic budgets + funding ──────────────────
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS budget_total_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS budget_reserved_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS budget_settled_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS budget_released_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS funding_status public.funding_state NOT NULL DEFAULT 'unfunded';
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS treasury_wallet text;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS expected_mint text;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS verified_balance_atomic bigint;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS verification_slot bigint;
ALTER TABLE public.sponsored_campaigns ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.prize_pools ADD COLUMN IF NOT EXISTS total_allocation_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.prize_pools ADD COLUMN IF NOT EXISTS reserved_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.prize_pools ADD COLUMN IF NOT EXISTS distributed_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.prize_pools ADD COLUMN IF NOT EXISTS finalized boolean NOT NULL DEFAULT false;

-- ─── Extend claimable_rewards with production fields ───────────────────────
ALTER TABLE public.claimable_rewards ADD COLUMN IF NOT EXISTS claim_state public.reward_claim_state NOT NULL DEFAULT 'created';
ALTER TABLE public.claimable_rewards ADD COLUMN IF NOT EXISTS verified_wallet_id uuid REFERENCES public.verified_wallets (id);
ALTER TABLE public.claimable_rewards ADD COLUMN IF NOT EXISTS amount_atomic bigint NOT NULL DEFAULT 0;
ALTER TABLE public.claimable_rewards ADD COLUMN IF NOT EXISTS decimals integer NOT NULL DEFAULT 0;
ALTER TABLE public.claimable_rewards ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_claimable_idempotency
  ON public.claimable_rewards (player_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reward system health (safe operational info)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_reward_system_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  has_active_season boolean;
  settlement_row public.settlement_config;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.seasons
    WHERE status = 'active' AND now() BETWEEN starts_at AND ends_at
  ) INTO has_active_season;

  SELECT * INTO settlement_row FROM public.settlement_config WHERE id = 'default';

  result := jsonb_build_object(
    'tables', jsonb_build_object(
      'player_progression', to_regclass('public.player_progression') IS NOT NULL,
      'reward_ledger', to_regclass('public.reward_ledger') IS NOT NULL,
      'reward_settlements', to_regclass('public.reward_settlements') IS NOT NULL,
      'verified_wallets', to_regclass('public.verified_wallets') IS NOT NULL,
      'wallet_challenges', to_regclass('public.wallet_verification_challenges') IS NOT NULL,
      'game_sessions', to_regclass('public.game_sessions') IS NOT NULL,
      'action_receipts', to_regclass('public.gameplay_action_receipts') IS NOT NULL,
      'player_notifications', to_regclass('public.player_notifications') IS NOT NULL,
      'season_snapshots', to_regclass('public.season_leaderboard_snapshots') IS NOT NULL
    ),
    'rpcs', jsonb_build_object(
      'award_gameplay_reward', to_regprocedure('public.award_gameplay_reward(text,text,text,jsonb)') IS NOT NULL,
      'transition_reward_claim_status', to_regprocedure('public.transition_reward_claim_status(uuid,text,text,text)') IS NOT NULL,
      'start_game_session', to_regprocedure('public.start_game_session(text,text,text)') IS NOT NULL,
      'submit_action_receipt', to_regprocedure('public.submit_action_receipt(uuid,text,text,bigint,text,text)') IS NOT NULL
    ),
    'has_active_season', has_active_season,
    'reward_definitions', (SELECT count(*) FROM public.reward_definitions),
    'mission_definitions', (SELECT count(*) FROM public.mission_definitions),
    'ledger_rows', (SELECT count(*) FROM public.reward_ledger),
    'pending_claims', (SELECT count(*) FROM public.claimable_rewards WHERE status NOT IN ('completed','failed','cancelled','expired')),
    'failed_claims', (SELECT count(*) FROM public.claimable_rewards WHERE status = 'failed'),
    'settlement_mode', coalesce(settlement_row.mode::text, 'disabled'),
    'settlement_configured', settlement_row.treasury_public_address IS NOT NULL,
    'last_settlement_at', (SELECT max(finalized_at) FROM public.reward_settlements WHERE status = 'finalized')
  );
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_reward_system_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reward_system_health() TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- Game sessions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.start_game_session(
  p_client_build text DEFAULT NULL,
  p_device_hash text DEFAULT NULL,
  p_session_nonce text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.game_sessions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  -- Invalidate stale active sessions (> 12h)
  UPDATE public.game_sessions SET status = 'expired'
  WHERE player_id = uid AND status = 'active' AND last_seen_at < now() - interval '12 hours';

  INSERT INTO public.game_sessions (player_id, client_build, device_hash, session_nonce)
  VALUES (uid, p_client_build, p_device_hash, coalesce(p_session_nonce, gen_random_uuid()::text))
  RETURNING * INTO row;
  RETURN to_jsonb(row);
END;
$$;
REVOKE ALL ON FUNCTION public.start_game_session(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_game_session(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.heartbeat_game_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.game_sessions
  SET last_seen_at = now()
  WHERE id = p_session_id AND player_id = auth.uid() AND status = 'active';
END;
$$;
REVOKE ALL ON FUNCTION public.heartbeat_game_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_game_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_game_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.game_sessions
  SET status = 'ended', ended_at = now()
  WHERE id = p_session_id AND player_id = auth.uid() AND status = 'active';
END;
$$;
REVOKE ALL ON FUNCTION public.end_game_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_game_session(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Action receipts (attestation)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_action_receipt(
  p_session_id uuid,
  p_action_type text,
  p_target_id text,
  p_sequence_number bigint,
  p_nonce text,
  p_evidence_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  sess public.game_sessions;
  last_seq bigint;
  row public.gameplay_action_receipts;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO sess FROM public.game_sessions WHERE id = p_session_id AND player_id = uid;
  IF NOT FOUND OR sess.status <> 'active' THEN
    RAISE EXCEPTION 'invalid or inactive session';
  END IF;

  -- Reject impossible ordering (sequence must increase within session)
  SELECT max(sequence_number) INTO last_seq
  FROM public.gameplay_action_receipts
  WHERE player_id = uid AND session_id = p_session_id;
  IF last_seq IS NOT NULL AND p_sequence_number <= last_seq THEN
    RAISE EXCEPTION 'sequence replay rejected';
  END IF;

  INSERT INTO public.gameplay_action_receipts (
    player_id, session_id, action_type, target_id, sequence_number,
    client_timestamp, nonce, evidence_hash
  ) VALUES (
    uid, p_session_id, p_action_type, p_target_id, p_sequence_number,
    now(), p_nonce, p_evidence_hash
  ) RETURNING * INTO row;

  UPDATE public.game_sessions SET last_seen_at = now() WHERE id = p_session_id;
  RETURN to_jsonb(row);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_action_receipt(uuid,text,text,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_action_receipt(uuid,text,text,bigint,text,text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Claim state machine + audit
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rt_valid_claim_transition(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_from, p_to) IN (
    ('created', 'eligibility_pending'),
    ('eligibility_pending', 'eligible'),
    ('eligibility_pending', 'ineligible'),
    ('eligible', 'awaiting_wallet'),
    ('eligible', 'awaiting_review'),
    ('awaiting_wallet', 'awaiting_review'),
    ('awaiting_wallet', 'cancelled'),
    ('awaiting_review', 'approved'),
    ('awaiting_review', 'ineligible'),
    ('approved', 'settlement_preparing'),
    ('settlement_preparing', 'settlement_submitted'),
    ('settlement_submitted', 'settlement_confirming'),
    ('settlement_confirming', 'completed'),
    ('settlement_preparing', 'failed'),
    ('settlement_submitted', 'failed'),
    ('settlement_confirming', 'failed'),
    ('created', 'cancelled'),
    ('created', 'expired'),
    ('eligible', 'expired'),
    ('awaiting_wallet', 'expired'),
    ('failed', 'settlement_preparing')
  );
$$;

CREATE OR REPLACE FUNCTION public.transition_reward_claim_status(
  p_claim_id uuid,
  p_next_state text,
  p_actor_type text DEFAULT 'system',
  p_note_safe text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.claimable_rewards;
  cur text;
  is_op boolean := public.rt_is_operator('reviewer');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO row FROM public.claimable_rewards WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;

  -- Players may only self-cancel their own claim; all else requires operator/system
  IF NOT is_op THEN
    IF row.player_id <> uid OR p_next_state <> 'cancelled' THEN
      RAISE EXCEPTION 'not authorized for this transition';
    END IF;
  END IF;

  cur := coalesce(row.claim_state::text, 'created');
  IF cur = p_next_state THEN
    RETURN jsonb_build_object('changed', false, 'idempotent', true, 'claim', to_jsonb(row));
  END IF;
  IF NOT public.rt_valid_claim_transition(cur, p_next_state) THEN
    RAISE EXCEPTION 'invalid claim transition % -> %', cur, p_next_state;
  END IF;

  -- completed requires a confirmed/finalized settlement for real assets
  IF p_next_state = 'completed' AND row.reward_asset IN ('SOL', 'SPL') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.reward_settlements s
      WHERE s.claim_id = row.id AND s.status IN ('confirmed', 'finalized')
        AND s.transaction_signature IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'completed real-asset claim requires verified settlement';
    END IF;
  END IF;

  UPDATE public.claimable_rewards
  SET claim_state = p_next_state::public.reward_claim_state,
      status = CASE
        WHEN p_next_state = 'completed' THEN 'completed'
        WHEN p_next_state = 'failed' THEN 'failed'
        WHEN p_next_state = 'cancelled' THEN 'cancelled'
        WHEN p_next_state = 'expired' THEN 'expired'
        WHEN p_next_state IN ('eligible') THEN 'eligible'
        ELSE status
      END,
      claimed_at = CASE WHEN p_next_state = 'completed' THEN now() ELSE claimed_at END
  WHERE id = row.id
  RETURNING * INTO row;

  INSERT INTO public.reward_claim_audit (claim_id, from_state, to_state, actor_type, actor_id, note_safe)
  VALUES (row.id, cur, p_next_state, p_actor_type, uid, p_note_safe);

  RETURN jsonb_build_object('changed', true, 'claim', to_jsonb(row));
END;
$$;
REVOKE ALL ON FUNCTION public.transition_reward_claim_status(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_reward_claim_status(uuid,text,text,text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Notifications
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rt_notify(
  p_player uuid, p_type text, p_title text, p_message text,
  p_icon text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_notifications (player_id, type, title, message, icon, metadata)
  VALUES (p_player, p_type, p_title, p_message, p_icon, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rows jsonb;
  unread integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT count(*) INTO unread FROM public.player_notifications WHERE player_id = uid AND is_read = false;
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT * FROM public.player_notifications
    WHERE player_id = uid
    ORDER BY created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
  ) n;
  RETURN jsonb_build_object('unread', unread, 'notifications', rows);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_ids IS NULL THEN
    UPDATE public.player_notifications SET is_read = true, read_at = now()
    WHERE player_id = uid AND is_read = false;
  ELSE
    UPDATE public.player_notifications SET is_read = true, read_at = now()
    WHERE player_id = uid AND id = ANY(p_ids);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Season lifecycle operations (operator only)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.finalize_season(p_season_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap_count integer;
BEGIN
  IF NOT public.rt_is_operator('admin') THEN RAISE EXCEPTION 'operator authorization required'; END IF;

  -- Idempotent: if already finalized, return existing snapshot count
  IF EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id AND lifecycle = 'finalized') THEN
    SELECT count(*) INTO snap_count FROM public.season_leaderboard_snapshots WHERE season_id = p_season_id;
    RETURN jsonb_build_object('finalized', true, 'idempotent', true, 'snapshots', snap_count);
  END IF;

  INSERT INTO public.season_leaderboard_snapshots
    (season_id, player_id, final_rank, season_points, level, equipped_title_id)
  SELECT
    pp.season_id, pp.player_id,
    rank() OVER (ORDER BY pp.season_points DESC, pp.lifetime_xp DESC),
    pp.season_points, pp.level, pp.equipped_title_id
  FROM public.player_progression pp
  WHERE pp.season_id = p_season_id
  ON CONFLICT (season_id, player_id) DO NOTHING;

  UPDATE public.seasons
  SET lifecycle = 'finalized', status = 'ended', finalized_at = now()
  WHERE id = p_season_id;

  SELECT count(*) INTO snap_count FROM public.season_leaderboard_snapshots WHERE season_id = p_season_id;
  RETURN jsonb_build_object('finalized', true, 'idempotent', false, 'snapshots', snap_count);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_season(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_season(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Scheduled maintenance (idempotent; callable by pg_cron or scheduler)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.run_reward_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_challenges integer;
  expired_sessions integer;
  expired_claims integer;
  cleaned_notifications integer;
BEGIN
  UPDATE public.wallet_verification_challenges
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS expired_challenges = ROW_COUNT;

  UPDATE public.game_sessions
  SET status = 'expired'
  WHERE status = 'active' AND last_seen_at < now() - interval '12 hours';
  GET DIAGNOSTICS expired_sessions = ROW_COUNT;

  UPDATE public.claimable_rewards
  SET status = 'expired', claim_state = 'expired'
  WHERE status NOT IN ('completed','failed','cancelled','expired')
    AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS expired_claims = ROW_COUNT;

  DELETE FROM public.player_notifications
  WHERE expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS cleaned_notifications = ROW_COUNT;

  RETURN jsonb_build_object(
    'expiredChallenges', expired_challenges,
    'expiredSessions', expired_sessions,
    'expiredClaims', expired_claims,
    'cleanedNotifications', cleaned_notifications
  );
END;
$$;
REVOKE ALL ON FUNCTION public.run_reward_maintenance() FROM PUBLIC;
-- Grant to service_role only (scheduler). No client grant.

-- ═══════════════════════════════════════════════════════════════════════════
-- Settlement reconciliation (server/operator)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reconcile_reward_settlement(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.reward_settlements;
BEGIN
  IF NOT public.rt_is_operator('admin') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  SELECT * INTO s FROM public.reward_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement not found'; END IF;

  -- This function only reports current DB state; on-chain verification happens
  -- in the verify-reward-settlement Edge Function which then updates status.
  RETURN jsonb_build_object(
    'settlementId', s.id,
    'claimId', s.claim_id,
    'status', s.status,
    'hasSignature', s.transaction_signature IS NOT NULL,
    'attemptCount', s.attempt_count,
    'requiresManualIntervention', s.status = 'manual_intervention',
    'note', 'On-chain verification handled by verify-reward-settlement Edge Function.'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_reward_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_reward_settlement(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Manual review workflow (operator/reviewer only)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.list_pending_claims(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows jsonb;
BEGIN
  IF NOT public.rt_is_operator('reviewer') THEN RAISE EXCEPTION 'reviewer authorization required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at ASC), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT cr.id, cr.player_id, cr.reward_asset, cr.amount, cr.amount_atomic,
           cr.claim_state, cr.status, cr.created_at,
           rv.review_status, rv.risk_score, rv.operational_hold
    FROM public.claimable_rewards cr
    LEFT JOIN public.claim_reviews rv ON rv.claim_id = cr.id
    WHERE cr.claim_state IN ('awaiting_review', 'eligible')
    ORDER BY cr.created_at ASC
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
  ) c;
  RETURN jsonb_build_object('claims', rows);
END;
$$;
REVOKE ALL ON FUNCTION public.list_pending_claims(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_claims(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_claim(
  p_claim_id uuid,
  p_action text,           -- 'approve' | 'reject' | 'hold' | 'release'
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  claim public.claimable_rewards;
BEGIN
  IF NOT public.rt_is_operator('reviewer') THEN RAISE EXCEPTION 'reviewer authorization required'; END IF;
  SELECT * INTO claim FROM public.claimable_rewards WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;

  INSERT INTO public.claim_reviews (claim_id, review_status, reviewer_id, review_notes, updated_at)
  VALUES (p_claim_id, 'pending', uid, p_notes, now())
  ON CONFLICT (claim_id) DO UPDATE
    SET reviewer_id = uid, review_notes = coalesce(p_notes, public.claim_reviews.review_notes), updated_at = now();

  IF p_action = 'approve' THEN
    UPDATE public.claim_reviews SET review_status = 'approved', approved_at = now(), operational_hold = false WHERE claim_id = p_claim_id;
    PERFORM public.transition_reward_claim_status(p_claim_id, 'approved', 'operator', 'approved by reviewer');
    PERFORM public.rt_notify(claim.player_id, 'reward_claim_approved', 'Claim approved', 'Your reward claim was approved.', 'check', jsonb_build_object('claimId', p_claim_id));
  ELSIF p_action = 'reject' THEN
    UPDATE public.claim_reviews SET review_status = 'rejected', rejected_at = now() WHERE claim_id = p_claim_id;
    PERFORM public.transition_reward_claim_status(p_claim_id, 'ineligible', 'operator', 'rejected by reviewer');
    PERFORM public.rt_notify(claim.player_id, 'reward_claim_rejected', 'Claim rejected', 'Your reward claim was rejected.', 'x', jsonb_build_object('claimId', p_claim_id));
  ELSIF p_action = 'hold' THEN
    UPDATE public.claim_reviews SET review_status = 'on_hold', operational_hold = true WHERE claim_id = p_claim_id;
  ELSIF p_action = 'release' THEN
    UPDATE public.claim_reviews SET operational_hold = false WHERE claim_id = p_claim_id;
  ELSE
    RAISE EXCEPTION 'unknown review action %', p_action;
  END IF;

  RETURN jsonb_build_object('ok', true, 'claimId', p_claim_id, 'action', p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.review_claim(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_claim(uuid,text,text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Campaign operations (operator only) with atomic budget safety
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.upsert_sponsored_campaign(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cid text := coalesce(p_payload->>'id', gen_random_uuid()::text);
  budget bigint := coalesce((p_payload->>'budget_total_atomic')::bigint, 0);
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  IF budget < 0 THEN RAISE EXCEPTION 'invalid budget'; END IF;

  INSERT INTO public.sponsored_campaigns
    (id, sponsor, name, reward_asset, status, budget_total_atomic, funding_status, starts_at, ends_at)
  VALUES (
    cid,
    coalesce(p_payload->>'sponsor', 'Draft Sponsor'),
    coalesce(p_payload->>'name', 'Draft Campaign'),
    coalesce(p_payload->>'reward_asset', 'RUG_POINTS'),
    'draft',
    budget,
    coalesce((p_payload->>'funding_status')::public.funding_state, 'unfunded'),
    coalesce((p_payload->>'starts_at')::timestamptz, now()),
    coalesce((p_payload->>'ends_at')::timestamptz, now() + interval '30 days')
  )
  ON CONFLICT (id) DO UPDATE SET
    sponsor = excluded.sponsor,
    name = excluded.name,
    reward_asset = excluded.reward_asset,
    budget_total_atomic = excluded.budget_total_atomic
  WHERE public.sponsored_campaigns.status = 'draft';

  RETURN jsonb_build_object('ok', true, 'id', cid);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_sponsored_campaign(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_sponsored_campaign(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_campaign_status(p_campaign_id text, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  camp public.sponsored_campaigns;
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  IF p_status NOT IN ('draft', 'active', 'paused', 'ended', 'cancelled') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT * INTO camp FROM public.sponsored_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found'; END IF;

  -- Activation guard: budget valid + funding verified or test-only
  IF p_status = 'active' THEN
    IF camp.budget_total_atomic <= 0 THEN RAISE EXCEPTION 'campaign budget must be positive to activate'; END IF;
    IF camp.funding_status NOT IN ('verified', 'test_only') THEN
      RAISE EXCEPTION 'campaign funding must be verified or test_only to activate';
    END IF;
  END IF;

  UPDATE public.sponsored_campaigns SET status = p_status WHERE id = p_campaign_id;
  RETURN jsonb_build_object('ok', true, 'id', p_campaign_id, 'status', p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.set_campaign_status(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_campaign_status(text,text) TO authenticated;

-- Atomic budget reservation (concurrency-safe via row lock)
CREATE OR REPLACE FUNCTION public.reserve_campaign_budget(p_campaign_id text, p_amount_atomic bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  camp public.sponsored_campaigns;
  available bigint;
BEGIN
  IF NOT public.rt_is_operator('operator') THEN RAISE EXCEPTION 'operator authorization required'; END IF;
  IF p_amount_atomic <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  SELECT * INTO camp FROM public.sponsored_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found'; END IF;
  IF camp.status <> 'active' THEN RAISE EXCEPTION 'campaign not active'; END IF;

  available := camp.budget_total_atomic - camp.budget_reserved_atomic - camp.budget_settled_atomic
               + camp.budget_released_atomic;
  IF p_amount_atomic > available THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_budget', 'available', available);
  END IF;

  UPDATE public.sponsored_campaigns
  SET budget_reserved_atomic = budget_reserved_atomic + p_amount_atomic
  WHERE id = p_campaign_id;
  RETURN jsonb_build_object('ok', true, 'reserved', p_amount_atomic, 'available', available - p_amount_atomic);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_campaign_budget(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_budget(text,bigint) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Lock down legacy owner-writable wallet_verifications (from base schema).
-- Prefer verified_wallets going forward. Owner may still READ; writes require
-- service role / SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF to_regclass('public.wallet_verifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "wallet_verifications: owner all" ON public.wallet_verifications;
    DROP POLICY IF EXISTS "wallet_verifications: owner read" ON public.wallet_verifications;
    CREATE POLICY "wallet_verifications: owner read"
      ON public.wallet_verifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Restrict create_dev_claim to operators (was granted to all authenticated in 10G).
-- Re-wrap: only allow when an active operator row exists OR settlement is disabled
-- and the environment is clearly non-production (operator gate is the hard check).
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
  IF NOT public.rt_is_operator('operator') THEN
    RAISE EXCEPTION 'create_dev_claim requires operator authorization';
  END IF;
  IF p_asset IN ('SOL', 'SPL') THEN
    RAISE EXCEPTION 'dev claims cannot create real-asset entitlements';
  END IF;

  INSERT INTO public.claimable_rewards (
    player_id, reward_asset, amount, source, status, claim_state, eligibility_snapshot, expires_at
  ) VALUES (
    uid, p_asset, p_amount, p_source, 'eligible', 'eligible',
    jsonb_build_object('mode', 'development'),
    now() + interval '7 days'
  )
  RETURNING * INTO row;
  RETURN to_jsonb(row);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEST season — draft, zero-value, clearly labelled. NEVER auto-activated.
-- Phase 10G seeded 'test-season-2026' as draft; ensure lifecycle + is_test here.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.seasons
SET is_test = true, lifecycle = 'draft'::public.season_state
WHERE id = 'test-season-2026';

-- To ACTIVATE the TEST season for dual-account validation, an operator runs:
--   UPDATE public.seasons
--     SET status = 'active', lifecycle = 'active',
--         starts_at = now(), ends_at = now() + interval '7 days'
--   WHERE id = 'test-season-2026';
-- Rewards for a TEST season must remain zero-value / non-transferable.

-- ═══════════════════════════════════════════════════════════════════════════
-- Scheduled operations (pg_cron). Requires: CREATE EXTENSION pg_cron;
-- These are OPTIONAL and commented — enable in production per the checklist.
-- run_reward_maintenance() is idempotent and safe to run repeatedly.
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT cron.schedule('rugtown-reward-maintenance', '*/15 * * * *',
--   $$SELECT public.run_reward_maintenance();$$);
-- Alternatively invoke run_reward_maintenance() from an external cron / scheduled
-- Edge Function using the service-role key (never expose that key to browsers).

COMMENT ON TABLE public.reward_settlements IS 'Phase 10H settlement evidence. Server-only writes via Edge Functions/service role.';
COMMENT ON TABLE public.verified_wallets IS 'Phase 10H wallet ownership. Verified only via signature Edge Function.';
COMMENT ON FUNCTION public.get_reward_system_health IS 'Safe operational health snapshot for Reward Centre.';


-- ===== END database/migrations/20260716_phase10h_reward_operations.sql =====



-- ===== BEGIN database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql =====

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


-- ===== END database/migrations/20260716_phase10i_achievements_season_pass_analytics.sql =====



-- ===== BEGIN database/migrations/20260716_phase10j_social_identity_moderation.sql =====

-- ═══════════════════════════════════════════════════════════════════════════
-- RugTown Phase 10J — Player identity, friends, DMs, presence privacy,
-- moderation & social safety.
-- Additive to 10G/10H/10I. Safety by default.
-- ═══════════════════════════════════════════════════════════════════════════

-- Critical fix: revoke public rt_notify (Phase 10H spoof vector)
REVOKE ALL ON FUNCTION public.rt_notify(uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rt_notify(uuid, text, text, text, text, jsonb) FROM anon, authenticated;

DROP POLICY IF EXISTS "notifications: owner update read state" ON public.player_notifications;
CREATE POLICY "notifications: owner update read state"
  ON public.player_notifications FOR UPDATE
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- Enums
DO $$ BEGIN CREATE TYPE public.profile_visibility AS ENUM ('public','friends_only','private'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.friend_request_policy AS ENUM ('everyone','friends_of_friends','nobody'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_policy AS ENUM ('everyone','friends_only','requests','nobody'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.presence_visibility AS ENUM ('everyone','friends','nobody'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.friend_request_status AS ENUM ('pending','accepted','rejected','cancelled','expired','blocked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.friendship_status AS ENUM ('active','removed','blocked','suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.conversation_type AS ENUM ('direct','group','party','guild','system','support'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_type AS ENUM ('text','system','achievement_share','profile_share','sticker','image'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_moderation_state AS ENUM ('allowed','masked','held','rejected','removed','escalated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_request_status AS ENUM ('pending','accepted','rejected','expired','blocked','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.moderation_case_status AS ENUM ('open','triaged','investigating','actioned','dismissed','resolved','appealed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.moderation_priority AS ENUM ('low','normal','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.social_operator_role AS ENUM ('support','moderator','senior_moderator','reward_operator','administrator'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.presence_status AS ENUM ('online','away','busy','offline','hidden'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Social operators (least privilege; separate from reward_operators)
CREATE TABLE IF NOT EXISTS public.social_operators (
  player_id   uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  role        public.social_operator_role NOT NULL DEFAULT 'moderator',
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES public.profiles (id),
  active      boolean NOT NULL DEFAULT true
);
ALTER TABLE public.social_operators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_operators: self read" ON public.social_operators;
CREATE POLICY "social_operators: self read" ON public.social_operators FOR SELECT USING (auth.uid() = player_id);

CREATE OR REPLACE FUNCTION public.rt_is_social_operator(p_min text DEFAULT 'moderator')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.social_operators o
    WHERE o.player_id = auth.uid() AND o.active
      AND (
        p_min = 'support'
        OR (p_min = 'moderator' AND o.role IN ('moderator','senior_moderator','administrator'))
        OR (p_min = 'senior_moderator' AND o.role IN ('senior_moderator','administrator'))
        OR (p_min = 'administrator' AND o.role = 'administrator')
      )
  );
$$;

-- Profile privacy (conservative defaults)
CREATE TABLE IF NOT EXISTS public.player_profile_settings (
  player_id              uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  profile_visibility     public.profile_visibility NOT NULL DEFAULT 'public',
  friend_request_policy  public.friend_request_policy NOT NULL DEFAULT 'everyone',
  message_policy         public.message_policy NOT NULL DEFAULT 'friends_only',
  presence_visibility    public.presence_visibility NOT NULL DEFAULT 'friends',
  show_level             boolean NOT NULL DEFAULT true,
  show_rank              boolean NOT NULL DEFAULT true,
  show_equipped_title    boolean NOT NULL DEFAULT true,
  show_achievements      boolean NOT NULL DEFAULT true,
  show_join_date         boolean NOT NULL DEFAULT true,
  show_online_status     boolean NOT NULL DEFAULT true,
  show_last_active       boolean NOT NULL DEFAULT false,
  allow_profile_search   boolean NOT NULL DEFAULT true,
  allow_profile_views    boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_profile_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profile_settings: owner all" ON public.player_profile_settings;
CREATE POLICY "profile_settings: owner all" ON public.player_profile_settings FOR ALL
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.username_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  username text NOT NULL,
  normalized text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles (id)
);
CREATE INDEX IF NOT EXISTS idx_username_history_player ON public.username_history (player_id, changed_at DESC);
ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "username_history: owner read own" ON public.username_history;
CREATE POLICY "username_history: owner read own" ON public.username_history FOR SELECT USING (auth.uid() = player_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_normalized ON public.profiles (lower(trim(username)));

CREATE TABLE IF NOT EXISTS public.player_profile_showcases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  slot_index integer NOT NULL CHECK (slot_index >= 0 AND slot_index < 6),
  item_type text NOT NULL CHECK (item_type IN ('achievement','title','badge','season_placement','event','cosmetic','milestone')),
  item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, slot_index)
);
ALTER TABLE public.player_profile_showcases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "showcases: owner all" ON public.player_profile_showcases;
CREATE POLICY "showcases: owner all" ON public.player_profile_showcases FOR ALL
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.player_profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  subject_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_profile_views ENABLE ROW LEVEL SECURITY;

-- Friend requests
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.friend_request_status NOT NULL DEFAULT 'pending',
  message text CHECK (message IS NULL OR char_length(message) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  cancelled_at timestamptz,
  CHECK (sender_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_request_pending ON public.friend_requests (sender_id, recipient_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient ON public.friend_requests (recipient_id, status);
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friend_requests: participants read" ON public.friend_requests;
CREATE POLICY "friend_requests: participants read" ON public.friend_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Friendships (canonical pair ordering)
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_low_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  player_high_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_from_request_id uuid REFERENCES public.friend_requests (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status public.friendship_status NOT NULL DEFAULT 'active',
  ended_at timestamptz,
  ended_by uuid REFERENCES public.profiles (id),
  CHECK (player_low_id < player_high_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friendship_active_pair ON public.friendships (player_low_id, player_high_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_friendships_low ON public.friendships (player_low_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_high ON public.friendships (player_high_id, status);
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friendships: participants read" ON public.friendships;
CREATE POLICY "friendships: participants read" ON public.friendships FOR SELECT
  USING (auth.uid() = player_low_id OR auth.uid() = player_high_id);

-- Blocks
CREATE TABLE IF NOT EXISTS public.player_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reason_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  unblocked_at timestamptz,
  CHECK (blocker_id <> blocked_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_active ON public.player_blocks (blocker_id, blocked_id) WHERE unblocked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.player_blocks (blocker_id) WHERE unblocked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.player_blocks (blocked_id) WHERE unblocked_at IS NULL;
ALTER TABLE public.player_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocks: blocker read" ON public.player_blocks;
CREATE POLICY "blocks: blocker read" ON public.player_blocks FOR SELECT USING (auth.uid() = blocker_id);

-- Conversations
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.conversation_type NOT NULL DEFAULT 'direct',
  created_by uuid REFERENCES public.profiles (id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','archived','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  pair_low_id uuid REFERENCES public.profiles (id),
  pair_high_id uuid REFERENCES public.profiles (id),
  CHECK (
    (type = 'direct' AND pair_low_id IS NOT NULL AND pair_high_id IS NOT NULL AND pair_low_id < pair_high_id)
    OR (type <> 'direct')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_conversation_pair
  ON public.conversation_threads (pair_low_id, pair_high_id)
  WHERE type = 'direct' AND status <> 'closed';
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversation_threads (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  role text NOT NULL DEFAULT 'member',
  is_muted boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  last_read_message_id uuid,
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_player ON public.conversation_members (player_id) WHERE left_at IS NULL;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conv_members: self read" ON public.conversation_members;
CREATE POLICY "conv_members: self read" ON public.conversation_members FOR SELECT USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "conversations: member read" ON public.conversation_threads;
CREATE POLICY "conversations: member read" ON public.conversation_threads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = id AND m.player_id = auth.uid() AND m.left_at IS NULL
  ));

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversation_threads (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  client_message_id text NOT NULL,
  message_type public.message_type NOT NULL DEFAULT 'text',
  body text NOT NULL CHECK (char_length(body) <= 2000),
  safe_body text,
  original_body text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','edited','deleted','held','rejected')),
  reply_to_message_id uuid REFERENCES public.direct_messages (id),
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_state public.message_moderation_state NOT NULL DEFAULT 'allowed',
  moderation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sender_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_conversation_created ON public.direct_messages (conversation_id, created_at DESC);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dm: member read" ON public.direct_messages;
CREATE POLICY "dm: member read" ON public.direct_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = direct_messages.conversation_id
      AND m.player_id = auth.uid() AND m.left_at IS NULL
  ));

CREATE TABLE IF NOT EXISTS public.message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversation_threads (id),
  status public.message_request_status NOT NULL DEFAULT 'pending',
  preview_message_id uuid REFERENCES public.direct_messages (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  CHECK (sender_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_request_pending
  ON public.message_requests (sender_id, recipient_id) WHERE status = 'pending';
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_requests: participants read" ON public.message_requests;
CREATE POLICY "msg_requests: participants read" ON public.message_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE TABLE IF NOT EXISTS public.message_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversation_threads (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_message_id uuid,
  PRIMARY KEY (conversation_id, player_id)
);
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_reads: owner" ON public.message_reads;
CREATE POLICY "message_reads: owner" ON public.message_reads FOR ALL
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.direct_messages (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like','laugh','fire','rug','heart','surprised')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, player_id, reaction)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Presence
CREATE TABLE IF NOT EXISTS public.presence_preferences (
  player_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  visibility public.presence_visibility NOT NULL DEFAULT 'friends',
  show_activity boolean NOT NULL DEFAULT true,
  show_location boolean NOT NULL DEFAULT false,
  allow_friend_join boolean NOT NULL DEFAULT true,
  allow_message_presence boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.presence_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presence_prefs: owner all" ON public.presence_preferences;
CREATE POLICY "presence_prefs: owner all" ON public.presence_preferences FOR ALL
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.player_presence_state (
  player_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.presence_status NOT NULL DEFAULT 'offline',
  activity text,
  district_id text,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_presence_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presence_state: owner read" ON public.player_presence_state;
CREATE POLICY "presence_state: owner read" ON public.player_presence_state FOR SELECT USING (auth.uid() = player_id);

-- Reports & moderation
CREATE TABLE IF NOT EXISTS public.player_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reported_player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category text NOT NULL,
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','resolved','dismissed')),
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (reporter_id <> reported_player_id)
);
CREATE INDEX IF NOT EXISTS idx_player_reports_status ON public.player_reports (status, created_at DESC);
ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_reports: reporter read" ON public.player_reports;
CREATE POLICY "player_reports: reporter read" ON public.player_reports FOR SELECT USING (auth.uid() = reporter_id);

CREATE TABLE IF NOT EXISTS public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.direct_messages (id) ON DELETE CASCADE,
  reported_player_id uuid NOT NULL REFERENCES public.profiles (id),
  category text NOT NULL,
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  status text NOT NULL DEFAULT 'open',
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_reports: reporter read" ON public.message_reports;
CREATE POLICY "message_reports: reporter read" ON public.message_reports FOR SELECT USING (auth.uid() = reporter_id);

CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text,
  category text NOT NULL,
  priority public.moderation_priority NOT NULL DEFAULT 'normal',
  status public.moderation_case_status NOT NULL DEFAULT 'open',
  assigned_operator_id uuid REFERENCES public.profiles (id),
  risk_score integer NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.moderation_cases (id),
  target_player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  action_type text NOT NULL,
  reason_code text NOT NULL,
  reason_safe text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.moderation_actions (target_player_id, ends_at);
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.moderation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_notes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.moderation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases (id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_evidence ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  UNIQUE (player_id, bucket, window_start)
);
ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.social_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_player_id uuid REFERENCES public.profiles (id),
  target_player_id uuid REFERENCES public.profiles (id),
  actor_type text NOT NULL DEFAULT 'player',
  action_type text NOT NULL,
  source_type text,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_audit_created ON public.social_audit_log (created_at DESC);
ALTER TABLE public.social_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.social_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source_type text,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_analytics_type ON public.social_analytics_events (event_type, occurred_at DESC);
ALTER TABLE public.social_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.social_operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info',
  category text NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  message_safe text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_alert_open_code
  ON public.social_operational_alerts (code) WHERE status = 'open';
ALTER TABLE public.social_operational_alerts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS social_restricted_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name_normalized text;

COMMENT ON TABLE public.friendships IS 'Phase 10J canonical friendships. Browser never inserts directly.';
COMMENT ON TABLE public.direct_messages IS 'Phase 10J DMs. Soft-delete. Moderation evidence retained.';
COMMENT ON TABLE public.moderation_cases IS 'Phase 10J operator-only moderation cases.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 10J RPCs — helpers, username, friends, blocks, DMs, presence, moderation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rt_pair_low(a uuid, b uuid) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT LEAST(a,b); $$;
CREATE OR REPLACE FUNCTION public.rt_pair_high(a uuid, b uuid) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT GREATEST(a,b); $$;

CREATE OR REPLACE FUNCTION public.rt_is_blocked(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks
    WHERE unblocked_at IS NULL
      AND ((blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a))
  );
$$;

CREATE OR REPLACE FUNCTION public.rt_are_friends(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'active'
      AND player_low_id = LEAST(a,b) AND player_high_id = GREATEST(a,b)
  );
$$;

CREATE OR REPLACE FUNCTION public.rt_social_restricted(p uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p AND social_restricted_until IS NOT NULL AND social_restricted_until > now()
  ) OR EXISTS (
    SELECT 1 FROM public.moderation_actions
    WHERE target_player_id = p AND reversed_at IS NULL
      AND action_type IN ('direct_message_restriction','social_suspension','chat_mute','permanent_social_ban')
      AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.rt_social_audit(
  p_actor uuid, p_target uuid, p_action text, p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.social_audit_log (actor_player_id, target_player_id, action_type, source_type, source_id, metadata)
  VALUES (p_actor, p_target, p_action, p_source_type, p_source_id, p_meta);
END; $$;

CREATE OR REPLACE FUNCTION public.rt_social_analytics(
  p_player uuid, p_event text, p_source_type text DEFAULT NULL, p_source_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.social_analytics_events (player_id, event_type, source_type, source_id)
  VALUES (p_player, p_event, p_source_type, p_source_id);
END; $$;

-- Rate limit helper: returns true if allowed
CREATE OR REPLACE FUNCTION public.rt_check_rate_limit(
  p_player uuid, p_bucket text, p_limit integer, p_window_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w_start timestamptz := date_trunc('minute', now()) - (
    ((EXTRACT(EPOCH FROM now())::integer / p_window_seconds) % 1) * interval '1 second'
  );
  -- Simpler: floor window by epoch
  win timestamptz;
  cnt integer;
BEGIN
  win := to_timestamp(floor(EXTRACT(EPOCH FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.chat_rate_limits (player_id, bucket, window_start, count)
  VALUES (p_player, p_bucket, win, 1)
  ON CONFLICT (player_id, bucket, window_start) DO UPDATE
    SET count = public.chat_rate_limits.count + 1
  RETURNING count INTO cnt;
  RETURN cnt <= p_limit;
END; $$;

CREATE OR REPLACE FUNCTION public.rt_ensure_profile_settings(p uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.player_profile_settings (player_id) VALUES (p) ON CONFLICT DO NOTHING;
  INSERT INTO public.presence_preferences (player_id) VALUES (p) ON CONFLICT DO NOTHING;
END; $$;

-- ── Username ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rt_normalize_username(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  s := lower(trim(p));
  s := regexp_replace(s, E'[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]', '', 'g');
  RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.check_username_availability(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  n text := public.rt_normalize_username(p_username);
  reserved text[] := ARRAY['admin','administrator','moderator','support','official','rugtown','system','treasury','developer','mod','staff'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.rt_check_rate_limit(uid, 'username_check', 20, 60) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'rate_limited');
  END IF;
  IF n IS NULL OR char_length(n) < 3 OR char_length(n) > 24 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid_length');
  END IF;
  IF n !~ '^[a-z0-9_]+$' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid_chars');
  END IF;
  IF n = ANY(reserved) OR n LIKE 'admin%' OR n LIKE 'mod_%' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'reserved');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(trim(username)) = n AND id <> uid) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'taken');
  END IF;
  RETURN jsonb_build_object('available', true, 'normalized', n);
END; $$;
REVOKE ALL ON FUNCTION public.check_username_availability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_availability(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_player_username(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  n text;
  check_res jsonb;
  old_name text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'social restricted'; END IF;
  check_res := public.check_username_availability(p_username);
  IF NOT coalesce((check_res->>'available')::boolean, false) THEN
    RETURN check_res || jsonb_build_object('ok', false);
  END IF;
  n := check_res->>'normalized';

  SELECT username INTO old_name FROM public.profiles WHERE id = uid FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND username_changed_at IS NOT NULL AND username_changed_at > now() - interval '14 days'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown');
  END IF;

  UPDATE public.profiles SET username = p_username, username_changed_at = now() WHERE id = uid;
  INSERT INTO public.username_history (player_id, username, normalized, changed_by)
  VALUES (uid, p_username, n, uid);
  PERFORM public.rt_social_audit(uid, uid, 'username_changed', 'profile', n, jsonb_build_object('from', old_name, 'to', p_username));
  RETURN jsonb_build_object('ok', true, 'username', p_username);
END; $$;
REVOKE ALL ON FUNCTION public.update_player_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_player_username(text) TO authenticated;

-- ── Public profile ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_player_profile(p_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  viewer uuid := auth.uid();
  p public.profiles;
  s public.player_profile_settings;
  friends boolean := false;
  blocked boolean := false;
  title_name text;
  level_val integer;
  result jsonb;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_player_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  PERFORM public.rt_ensure_profile_settings(p_player_id);
  SELECT * INTO s FROM public.player_profile_settings WHERE player_id = p_player_id;

  IF viewer IS NOT NULL THEN
    blocked := public.rt_is_blocked(viewer, p_player_id);
    friends := public.rt_are_friends(viewer, p_player_id);
  END IF;

  IF blocked AND viewer IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('ok', true, 'restricted', true, 'username', p.username, 'relationship', 'blocked');
  END IF;

  IF s.profile_visibility = 'private' AND viewer IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('ok', true, 'restricted', true, 'username', p.username, 'relationship', CASE WHEN friends THEN 'friend' ELSE 'none' END);
  END IF;
  IF s.profile_visibility = 'friends_only' AND viewer IS DISTINCT FROM p_player_id AND NOT friends THEN
    RETURN jsonb_build_object('ok', true, 'restricted', true, 'username', p.username, 'relationship', 'none');
  END IF;

  SELECT td.name INTO title_name
  FROM public.player_titles pt JOIN public.title_definitions td ON td.id = pt.title_id
  WHERE pt.player_id = p_player_id AND pt.is_equipped AND pt.revoked_at IS NULL LIMIT 1;

  SELECT level INTO level_val FROM public.player_progression WHERE player_id = p_player_id;

  result := jsonb_build_object(
    'ok', true,
    'playerId', p.id,
    'username', p.username,
    'displayName', p.display_name,
    'bio', CASE WHEN viewer = p_player_id OR s.profile_visibility <> 'private' THEN p.bio ELSE NULL END,
    'level', CASE WHEN s.show_level THEN level_val ELSE NULL END,
    'equippedTitle', CASE WHEN s.show_equipped_title THEN title_name ELSE NULL END,
    'joinedMonth', CASE WHEN s.show_join_date THEN to_char(p.created_at, 'YYYY-MM') ELSE NULL END,
    'relationship', CASE
      WHEN viewer IS NULL THEN 'anonymous'
      WHEN viewer = p_player_id THEN 'self'
      WHEN friends THEN 'friend'
      ELSE 'none' END,
    'onlineStatus', CASE WHEN s.show_online_status THEN 'unknown' ELSE NULL END
  );
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_public_player_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_player_profile(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.search_public_players(p_query text, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  q text := public.rt_normalize_username(p_query);
  rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF char_length(coalesce(q,'')) < 2 THEN RETURN jsonb_build_object('players', '[]'::jsonb); END IF;
  IF NOT public.rt_check_rate_limit(uid, 'profile_search', 30, 60) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'playerId', p.id, 'username', p.username, 'displayName', p.display_name
  )), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT p.* FROM public.profiles p
    JOIN public.player_profile_settings s ON s.player_id = p.id
    WHERE s.allow_profile_search
      AND s.profile_visibility <> 'private'
      AND lower(p.username) LIKE q || '%'
      AND p.id <> uid
      AND NOT public.rt_is_blocked(uid, p.id)
    ORDER BY CASE WHEN lower(p.username) = q THEN 0 ELSE 1 END, p.username
    LIMIT least(greatest(coalesce(p_limit,20),1), 50)
  ) p;
  RETURN jsonb_build_object('players', rows);
END; $$;
REVOKE ALL ON FUNCTION public.search_public_players(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_players(text,integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 10J part 3 — friends, blocks, conversations, DMs, message requests
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.send_friend_request(p_recipient_id uuid, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  settings public.player_profile_settings;
  req_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF uid = p_recipient_id THEN RAISE EXCEPTION 'cannot friend yourself'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'social restricted'; END IF;
  IF public.rt_is_blocked(uid, p_recipient_id) THEN RAISE EXCEPTION 'blocked'; END IF;
  IF public.rt_are_friends(uid, p_recipient_id) THEN RAISE EXCEPTION 'already friends'; END IF;
  IF NOT public.rt_check_rate_limit(uid, 'friend_request', 20, 86400) THEN RAISE EXCEPTION 'rate limited'; END IF;

  PERFORM public.rt_ensure_profile_settings(p_recipient_id);
  SELECT * INTO settings FROM public.player_profile_settings WHERE player_id = p_recipient_id;
  IF settings.friend_request_policy = 'nobody' THEN RAISE EXCEPTION 'requests disabled'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE sender_id = uid AND recipient_id = p_recipient_id AND status = 'rejected'
      AND responded_at > now() - interval '7 days'
  ) THEN RAISE EXCEPTION 'recently rejected'; END IF;

  INSERT INTO public.friend_requests (sender_id, recipient_id, message)
  VALUES (uid, p_recipient_id, NULLIF(left(trim(coalesce(p_message,'')), 120), ''))
  ON CONFLICT (sender_id, recipient_id) WHERE status = 'pending' DO NOTHING
  RETURNING id INTO req_id;

  IF req_id IS NULL THEN
    SELECT id INTO req_id FROM public.friend_requests
    WHERE sender_id = uid AND recipient_id = p_recipient_id AND status = 'pending';
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'requestId', req_id);
  END IF;

  PERFORM public.rt_notify(p_recipient_id, 'friend_request', 'Friend request', 'You have a new friend request.', 'friends',
    jsonb_build_object('requestId', req_id, 'from', uid));
  PERFORM public.rt_social_audit(uid, p_recipient_id, 'friend_request_sent', 'friend_request', req_id::text);
  PERFORM public.rt_social_analytics(uid, 'friend_request_sent', 'friend_request', req_id::text);
  RETURN jsonb_build_object('ok', true, 'requestId', req_id);
END; $$;
REVOKE ALL ON FUNCTION public.send_friend_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  req public.friend_requests;
  low uuid; high uuid; fid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO req FROM public.friend_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.recipient_id <> uid THEN RAISE EXCEPTION 'not found'; END IF;
  IF req.status <> 'pending' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', req.status); END IF;
  IF req.expires_at < now() THEN
    UPDATE public.friend_requests SET status = 'expired', responded_at = now() WHERE id = req.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF NOT p_accept THEN
    UPDATE public.friend_requests SET status = 'rejected', responded_at = now() WHERE id = req.id;
    PERFORM public.rt_social_audit(uid, req.sender_id, 'friend_request_rejected', 'friend_request', req.id::text);
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  IF public.rt_is_blocked(uid, req.sender_id) THEN RAISE EXCEPTION 'blocked'; END IF;

  UPDATE public.friend_requests SET status = 'accepted', responded_at = now() WHERE id = req.id;
  low := LEAST(req.sender_id, req.recipient_id);
  high := GREATEST(req.sender_id, req.recipient_id);
  INSERT INTO public.friendships (player_low_id, player_high_id, created_from_request_id, status)
  VALUES (low, high, req.id, 'active')
  ON CONFLICT (player_low_id, player_high_id) WHERE status = 'active' DO NOTHING
  RETURNING id INTO fid;
  IF fid IS NULL THEN
    SELECT id INTO fid FROM public.friendships WHERE player_low_id = low AND player_high_id = high AND status = 'active';
  END IF;

  PERFORM public.rt_notify(req.sender_id, 'friend_accepted', 'Friend request accepted', 'Your friend request was accepted.', 'friends',
    jsonb_build_object('friendId', uid));
  PERFORM public.rt_social_audit(uid, req.sender_id, 'friend_request_accepted', 'friendship', fid::text);
  PERFORM public.rt_social_analytics(uid, 'friend_request_accepted', 'friendship', fid::text);
  RETURN jsonb_build_object('ok', true, 'status', 'accepted', 'friendshipId', fid);
END; $$;
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.friend_requests SET status = 'cancelled', cancelled_at = now()
  WHERE id = p_request_id AND sender_id = uid AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.cancel_friend_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_friend_requests()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); incoming jsonb; outgoing jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'senderId', r.sender_id, 'username', p.username, 'message', r.message, 'createdAt', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO incoming FROM public.friend_requests r JOIN public.profiles p ON p.id = r.sender_id
  WHERE r.recipient_id = uid AND r.status = 'pending' AND r.expires_at > now();

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'recipientId', r.recipient_id, 'username', p.username, 'createdAt', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO outgoing FROM public.friend_requests r JOIN public.profiles p ON p.id = r.recipient_id
  WHERE r.sender_id = uid AND r.status = 'pending';

  RETURN jsonb_build_object('incoming', incoming, 'outgoing', outgoing);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_friend_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_friend_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'friendshipId', f.id, 'playerId', other_id, 'username', p.username, 'displayName', p.display_name, 'since', f.created_at
  ) ORDER BY p.username), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT f.id, f.created_at, CASE WHEN f.player_low_id = uid THEN f.player_high_id ELSE f.player_low_id END AS other_id
    FROM public.friendships f
    WHERE f.status = 'active' AND (f.player_low_id = uid OR f.player_high_id = uid)
  ) f
  JOIN public.profiles p ON p.id = f.other_id;
  RETURN jsonb_build_object('friends', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_friends() TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.friendships SET status = 'removed', ended_at = now(), ended_by = uid
  WHERE status = 'active'
    AND player_low_id = LEAST(uid, p_friend_id) AND player_high_id = GREATEST(uid, p_friend_id);
  PERFORM public.rt_social_audit(uid, p_friend_id, 'friendship_removed', 'friendship', NULL);
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_friendship_state(p_other_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  RETURN jsonb_build_object(
    'friends', public.rt_are_friends(uid, p_other_id),
    'blocked', public.rt_is_blocked(uid, p_other_id),
    'pendingOutgoing', EXISTS (SELECT 1 FROM public.friend_requests WHERE sender_id=uid AND recipient_id=p_other_id AND status='pending'),
    'pendingIncoming', EXISTS (SELECT 1 FROM public.friend_requests WHERE sender_id=p_other_id AND recipient_id=uid AND status='pending')
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_friendship_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friendship_state(uuid) TO authenticated;

-- Blocks
CREATE OR REPLACE FUNCTION public.block_player(p_blocked_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF uid = p_blocked_id THEN RAISE EXCEPTION 'cannot block yourself'; END IF;

  INSERT INTO public.player_blocks (blocker_id, blocked_id, reason_category)
  VALUES (uid, p_blocked_id, p_reason)
  ON CONFLICT (blocker_id, blocked_id) WHERE unblocked_at IS NULL DO NOTHING;

  -- Deactivate friendship; do not auto-restore later
  UPDATE public.friendships SET status = 'blocked', ended_at = now(), ended_by = uid
  WHERE status = 'active'
    AND player_low_id = LEAST(uid, p_blocked_id) AND player_high_id = GREATEST(uid, p_blocked_id);

  UPDATE public.friend_requests SET status = 'blocked', responded_at = now()
  WHERE status = 'pending'
    AND ((sender_id = uid AND recipient_id = p_blocked_id) OR (sender_id = p_blocked_id AND recipient_id = uid));

  UPDATE public.conversation_threads SET status = 'restricted', updated_at = now()
  WHERE type = 'direct' AND pair_low_id = LEAST(uid, p_blocked_id) AND pair_high_id = GREATEST(uid, p_blocked_id);

  PERFORM public.rt_social_audit(uid, p_blocked_id, 'player_blocked', 'block', NULL);
  PERFORM public.rt_social_analytics(uid, 'block_created', 'block', p_blocked_id::text);
  -- Intentionally no notification to blocked player
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.block_player(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_player(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_player(p_blocked_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.player_blocks SET unblocked_at = now()
  WHERE blocker_id = uid AND blocked_id = p_blocked_id AND unblocked_at IS NULL;
  -- Does NOT restore friendship
  PERFORM public.rt_social_audit(uid, p_blocked_id, 'player_unblocked', 'block', NULL);
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.unblock_player(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unblock_player(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_blocks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'playerId', b.blocked_id, 'username', p.username, 'createdAt', b.created_at
  ) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO rows FROM public.player_blocks b JOIN public.profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = uid AND b.unblocked_at IS NULL;
  RETURN jsonb_build_object('blocks', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_blocks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_blocks() TO authenticated;

-- Conversations & DMs
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  low uuid; high uuid;
  settings public.player_profile_settings;
  tid uuid;
  friends boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF uid = p_other_id THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'social restricted'; END IF;
  IF public.rt_is_blocked(uid, p_other_id) THEN RAISE EXCEPTION 'blocked'; END IF;

  PERFORM public.rt_ensure_profile_settings(p_other_id);
  SELECT * INTO settings FROM public.player_profile_settings WHERE player_id = p_other_id;
  friends := public.rt_are_friends(uid, p_other_id);

  IF settings.message_policy = 'nobody' THEN RAISE EXCEPTION 'messaging disabled'; END IF;
  IF settings.message_policy = 'friends_only' AND NOT friends THEN RAISE EXCEPTION 'friends only'; END IF;
  -- 'requests' and 'everyone' allowed to open/create; request flow may gate first message

  low := LEAST(uid, p_other_id); high := GREATEST(uid, p_other_id);
  SELECT id INTO tid FROM public.conversation_threads
  WHERE type = 'direct' AND pair_low_id = low AND pair_high_id = high AND status <> 'closed';

  IF tid IS NULL THEN
    IF NOT public.rt_check_rate_limit(uid, 'new_conversation', 10, 3600) THEN RAISE EXCEPTION 'rate limited'; END IF;
    INSERT INTO public.conversation_threads (type, created_by, pair_low_id, pair_high_id)
    VALUES ('direct', uid, low, high) RETURNING id INTO tid;
    INSERT INTO public.conversation_members (conversation_id, player_id) VALUES (tid, uid), (tid, p_other_id);
    PERFORM public.rt_social_audit(uid, p_other_id, 'conversation_created', 'conversation', tid::text);
    PERFORM public.rt_social_analytics(uid, 'conversation_created', 'conversation', tid::text);
  END IF;

  RETURN jsonb_build_object('ok', true, 'conversationId', tid, 'friends', friends, 'messagePolicy', settings.message_policy);
END; $$;
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

-- Chat safety: reject/mask decision (reject before send for dangerous content)
CREATE OR REPLACE FUNCTION public.rt_safety_check_message(p_body text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  b text := trim(coalesce(p_body,''));
  lower_b text;
  risk integer := 0;
  state public.message_moderation_state := 'allowed';
BEGIN
  IF char_length(b) = 0 OR char_length(b) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'state', 'rejected', 'reason', 'invalid_length', 'risk', 10);
  END IF;
  -- Strip control / invisible chars for safe_body
  b := regexp_replace(b, E'[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]', '', 'g');
  lower_b := lower(b);

  IF lower_b ~ '(seed[[:space:]]*phrase|private[[:space:]]*key|secret[[:space:]]*key|recovery[[:space:]]*phrase|mnemonic)' THEN
    RETURN jsonb_build_object('ok', false, 'state', 'rejected', 'reason', 'seed_phrase_solicitation', 'risk', 100, 'safeBody', b);
  END IF;
  IF lower_b ~ '(verify[[:space:]]*wallet|connect[[:space:]]*wallet.*(airdrop|claim)|send[[:space:]]*me.*(seed|key))' THEN
    RETURN jsonb_build_object('ok', false, 'state', 'rejected', 'reason', 'scam_language', 'risk', 90, 'safeBody', b);
  END IF;
  IF lower_b ~ 'javascript:|data:text/html' THEN
    RETURN jsonb_build_object('ok', false, 'state', 'rejected', 'reason', 'dangerous_url', 'risk', 80, 'safeBody', b);
  END IF;
  IF b ~* '(https?://[^\\s]+)' AND lower_b ~ '(bit\\.ly|tinyurl|t\\.co)/' THEN
    risk := risk + 40; state := 'held';
  END IF;
  IF b ~ '(.)\\1{8,}' THEN risk := risk + 20; END IF;

  RETURN jsonb_build_object('ok', true, 'state', state, 'risk', risk, 'safeBody', b);
END; $$;

CREATE OR REPLACE FUNCTION public.send_direct_message(
  p_conversation_id uuid,
  p_client_message_id text,
  p_body text,
  p_reply_to uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  conv public.conversation_threads;
  other_id uuid;
  safety jsonb;
  msg_id uuid;
  existing uuid;
  settings public.player_profile_settings;
  friends boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'social restricted'; END IF;
  IF NOT public.rt_check_rate_limit(uid, 'dm_send', 30, 60) THEN RAISE EXCEPTION 'rate limited'; END IF;

  SELECT * INTO conv FROM public.conversation_threads WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR conv.status = 'closed' THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conversation_id AND player_id = uid AND left_at IS NULL) THEN
    RAISE EXCEPTION 'not a member';
  END IF;

  -- Idempotency
  SELECT id INTO existing FROM public.direct_messages
  WHERE conversation_id = p_conversation_id AND sender_id = uid AND client_message_id = p_client_message_id;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'messageId', existing);
  END IF;

  other_id := CASE WHEN conv.pair_low_id = uid THEN conv.pair_high_id ELSE conv.pair_low_id END;
  IF public.rt_is_blocked(uid, other_id) THEN RAISE EXCEPTION 'blocked'; END IF;
  IF conv.status = 'restricted' THEN RAISE EXCEPTION 'conversation restricted'; END IF;

  PERFORM public.rt_ensure_profile_settings(other_id);
  SELECT * INTO settings FROM public.player_profile_settings WHERE player_id = other_id;
  friends := public.rt_are_friends(uid, other_id);
  IF settings.message_policy = 'friends_only' AND NOT friends THEN RAISE EXCEPTION 'friends only'; END IF;
  IF settings.message_policy = 'nobody' THEN RAISE EXCEPTION 'messaging disabled'; END IF;
  IF settings.message_policy = 'requests' AND NOT friends THEN
    -- Require accepted message request
    IF NOT EXISTS (
      SELECT 1 FROM public.message_requests
      WHERE status = 'accepted'
        AND ((sender_id = uid AND recipient_id = other_id) OR (sender_id = other_id AND recipient_id = uid))
    ) THEN RAISE EXCEPTION 'message request required'; END IF;
  END IF;

  safety := public.rt_safety_check_message(p_body);
  IF NOT coalesce((safety->>'ok')::boolean, false) THEN
    PERFORM public.rt_social_analytics(uid, 'message_rejected', 'dm', safety->>'reason');
    RETURN jsonb_build_object('ok', false, 'state', safety->>'state', 'reason', safety->>'reason');
  END IF;

  INSERT INTO public.direct_messages (
    conversation_id, sender_id, client_message_id, body, safe_body, original_body,
    moderation_state, risk_score, status, reply_to_message_id, moderation_snapshot
  ) VALUES (
    p_conversation_id, uid, p_client_message_id,
    safety->>'safeBody', safety->>'safeBody', safety->>'safeBody',
    coalesce((safety->>'state')::public.message_moderation_state, 'allowed'),
    coalesce((safety->>'risk')::integer, 0),
    CASE WHEN safety->>'state' = 'held' THEN 'held' ELSE 'sent' END,
    p_reply_to,
    safety
  ) RETURNING id INTO msg_id;

  IF safety->>'state' = 'held' THEN
    RETURN jsonb_build_object('ok', true, 'messageId', msg_id, 'state', 'held',
      'notice', 'Message held for safety review.');
  END IF;

  UPDATE public.conversation_threads SET last_message_at = now(), updated_at = now() WHERE id = p_conversation_id;
  PERFORM public.rt_social_analytics(uid, 'message_sent', 'dm', msg_id::text);

  -- Notify recipient if not muted
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conversation_id AND player_id = other_id AND is_muted
  ) THEN
    PERFORM public.rt_notify(other_id, 'direct_message', 'New message', 'You have a new direct message.', 'dm',
      jsonb_build_object('conversationId', p_conversation_id, 'messageId', msg_id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'messageId', msg_id, 'state', 'sent', 'createdAt', now());
END; $$;
REVOKE ALL ON FUNCTION public.send_direct_message(uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid,text,text,uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 10J part 4 — message CRUD, requests, reports, moderation, presence,
-- maintenance, reconciliation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id uuid, p_limit integer DEFAULT 50, p_before timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id=p_conversation_id AND player_id=uid AND left_at IS NULL) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'senderId', m.sender_id, 'body',
      CASE WHEN m.status = 'deleted' THEN '[message deleted]'
           WHEN m.moderation_state = 'masked' THEN coalesce(m.safe_body, '[masked]')
           ELSE coalesce(m.safe_body, m.body) END,
    'status', m.status, 'moderationState', m.moderation_state,
    'editedAt', m.edited_at, 'createdAt', m.created_at, 'clientMessageId', m.client_message_id,
    'messageType', m.message_type
  ) ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT * FROM public.direct_messages
    WHERE conversation_id = p_conversation_id
      AND status <> 'rejected'
      AND (p_before IS NULL OR created_at < p_before)
    ORDER BY created_at DESC
    LIMIT least(greatest(coalesce(p_limit,50),1), 100)
  ) m;
  RETURN jsonb_build_object('messages', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_conversation_messages(uuid,integer,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid,integer,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.edit_direct_message(p_message_id uuid, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m public.direct_messages; safety jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO m FROM public.direct_messages WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND OR m.sender_id <> uid THEN RAISE EXCEPTION 'not found'; END IF;
  IF m.status = 'deleted' THEN RAISE EXCEPTION 'deleted'; END IF;
  IF m.created_at < now() - interval '5 minutes' THEN RAISE EXCEPTION 'edit window expired'; END IF;
  safety := public.rt_safety_check_message(p_body);
  IF NOT coalesce((safety->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', safety->>'reason');
  END IF;
  -- Keep original for moderation
  UPDATE public.direct_messages SET
    body = safety->>'safeBody', safe_body = safety->>'safeBody',
    original_body = coalesce(original_body, body),
    status = 'edited', edited_at = now(),
    moderation_snapshot = moderation_snapshot || jsonb_build_object('edit', safety)
  WHERE id = p_message_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.edit_direct_message(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_direct_message(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_direct_message(p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m public.direct_messages;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO m FROM public.direct_messages WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND OR m.sender_id <> uid THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE public.direct_messages SET
    status = 'deleted', deleted_at = now(),
    original_body = coalesce(original_body, body),
    safe_body = '[message deleted]'
  WHERE id = p_message_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.delete_direct_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_direct_message(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid, p_message_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id=p_conversation_id AND player_id=uid AND left_at IS NULL) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  INSERT INTO public.message_reads (conversation_id, player_id, last_read_at, last_message_id)
  VALUES (p_conversation_id, uid, now(), p_message_id)
  ON CONFLICT (conversation_id, player_id) DO UPDATE
    SET last_read_at = now(), last_message_id = coalesce(EXCLUDED.last_message_id, public.message_reads.last_message_id);
  UPDATE public.conversation_members SET last_read_at = now(), last_read_message_id = coalesce(p_message_id, last_read_message_id)
  WHERE conversation_id = p_conversation_id AND player_id = uid;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'conversationId', c.id, 'otherPlayerId', other_id, 'username', p.username,
    'lastMessageAt', c.last_message_at, 'isMuted', m.is_muted, 'isArchived', m.is_archived,
    'unread', (
      SELECT count(*) FROM public.direct_messages dm
      WHERE dm.conversation_id = c.id AND dm.sender_id <> uid AND dm.status = 'sent'
        AND dm.created_at > coalesce(m.last_read_at, 'epoch'::timestamptz)
    )
  ) ORDER BY c.last_message_at DESC NULLS LAST), '[]'::jsonb)
  INTO rows
  FROM public.conversation_members m
  JOIN public.conversation_threads c ON c.id = m.conversation_id
  JOIN LATERAL (
    SELECT CASE WHEN c.pair_low_id = uid THEN c.pair_high_id ELSE c.pair_low_id END AS other_id
  ) o ON true
  JOIN public.profiles p ON p.id = o.other_id
  WHERE m.player_id = uid AND m.left_at IS NULL AND c.type = 'direct' AND NOT m.is_archived;
  RETURN jsonb_build_object('conversations', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unread_dm_count()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); n integer;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(sum(u.cnt), 0)::integer INTO n FROM (
    SELECT count(*) AS cnt
    FROM public.conversation_members m
    JOIN public.direct_messages dm ON dm.conversation_id = m.conversation_id
    WHERE m.player_id = uid AND m.left_at IS NULL AND NOT m.is_muted
      AND dm.sender_id <> uid AND dm.status = 'sent'
      AND dm.created_at > coalesce(m.last_read_at, 'epoch'::timestamptz)
    GROUP BY m.conversation_id
  ) u;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.get_unread_dm_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_dm_count() TO authenticated;

-- Message requests
CREATE OR REPLACE FUNCTION public.create_message_request(p_recipient_id uuid, p_body text, p_client_message_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  settings public.player_profile_settings;
  conv jsonb;
  msg jsonb;
  req_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.rt_is_blocked(uid, p_recipient_id) THEN RAISE EXCEPTION 'blocked'; END IF;
  IF NOT public.rt_check_rate_limit(uid, 'message_request', 5, 86400) THEN RAISE EXCEPTION 'rate limited'; END IF;
  PERFORM public.rt_ensure_profile_settings(p_recipient_id);
  SELECT * INTO settings FROM public.player_profile_settings WHERE player_id = p_recipient_id;
  IF settings.message_policy <> 'requests' AND settings.message_policy <> 'everyone' THEN
    RAISE EXCEPTION 'requests not allowed';
  END IF;

  conv := public.get_or_create_direct_conversation(p_recipient_id);
  msg := public.send_direct_message((conv->>'conversationId')::uuid, p_client_message_id, p_body, NULL);
  IF NOT coalesce((msg->>'ok')::boolean, false) THEN RETURN msg; END IF;

  INSERT INTO public.message_requests (sender_id, recipient_id, conversation_id, preview_message_id)
  VALUES (uid, p_recipient_id, (conv->>'conversationId')::uuid, (msg->>'messageId')::uuid)
  ON CONFLICT (sender_id, recipient_id) WHERE status = 'pending' DO NOTHING RETURNING id INTO req_id;

  PERFORM public.rt_notify(p_recipient_id, 'message_request', 'Message request', 'You have a new message request.', 'dm',
    jsonb_build_object('requestId', req_id));
  RETURN jsonb_build_object('ok', true, 'requestId', req_id, 'conversationId', conv->>'conversationId');
END; $$;
REVOKE ALL ON FUNCTION public.create_message_request(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_message_request(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_message_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); req public.message_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO req FROM public.message_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.recipient_id <> uid THEN RAISE EXCEPTION 'not found'; END IF;
  IF req.status <> 'pending' THEN RETURN jsonb_build_object('ok', true, 'idempotent', true); END IF;
  UPDATE public.message_requests SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, responded_at = now()
  WHERE id = req.id;
  IF p_accept THEN
    PERFORM public.rt_notify(req.sender_id, 'message_request_accepted', 'Message request accepted', 'You can now message this player.', 'dm',
      jsonb_build_object('conversationId', req.conversation_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END);
END; $$;
REVOKE ALL ON FUNCTION public.respond_to_message_request(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_message_request(uuid,boolean) TO authenticated;

-- Reports
CREATE OR REPLACE FUNCTION public.report_player(p_player_id uuid, p_category text, p_description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rid uuid; case_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF uid = p_player_id THEN RAISE EXCEPTION 'cannot report yourself'; END IF;
  IF NOT public.rt_check_rate_limit(uid, 'report', 10, 86400) THEN RAISE EXCEPTION 'rate limited'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.player_reports
    WHERE reporter_id = uid AND reported_player_id = p_player_id AND status = 'open'
      AND created_at > now() - interval '1 day'
  ) THEN RETURN jsonb_build_object('ok', true, 'idempotent', true); END IF;

  INSERT INTO public.player_reports (reporter_id, reported_player_id, category, description, evidence_snapshot)
  VALUES (uid, p_player_id, p_category, left(coalesce(p_description,''), 1000),
    jsonb_build_object('reportedAt', now(), 'reporterIdHash', md5(uid::text)))
  RETURNING id INTO rid;

  INSERT INTO public.moderation_cases (subject_player_id, source_type, source_id, category, priority)
  VALUES (p_player_id, 'player_report', rid::text, p_category, 'normal')
  RETURNING id INTO case_id;

  PERFORM public.rt_social_audit(uid, p_player_id, 'report_submitted', 'player_report', rid::text);
  -- Target is NOT notified of reporter identity
  RETURN jsonb_build_object('ok', true, 'reportId', rid);
END; $$;
REVOKE ALL ON FUNCTION public.report_player(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_player(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_message(p_message_id uuid, p_category text, p_description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m public.direct_messages; rid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO m FROM public.direct_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF m.sender_id = uid THEN RAISE EXCEPTION 'cannot report own message'; END IF;
  IF NOT public.rt_check_rate_limit(uid, 'report', 10, 86400) THEN RAISE EXCEPTION 'rate limited'; END IF;

  INSERT INTO public.message_reports (reporter_id, message_id, reported_player_id, category, description, evidence_snapshot)
  VALUES (uid, p_message_id, m.sender_id, p_category, left(coalesce(p_description,''), 1000),
    jsonb_build_object(
      'body', coalesce(m.original_body, m.body),
      'safeBody', m.safe_body,
      'createdAt', m.created_at,
      'moderationState', m.moderation_state
    ))
  RETURNING id INTO rid;

  INSERT INTO public.moderation_cases (subject_player_id, source_type, source_id, category, priority)
  VALUES (m.sender_id, 'message_report', rid::text, p_category, 'normal');

  RETURN jsonb_build_object('ok', true, 'reportId', rid);
END; $$;
REVOKE ALL ON FUNCTION public.report_message(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_message(uuid,text,text) TO authenticated;

-- Presence
CREATE OR REPLACE FUNCTION public.heartbeat_presence(
  p_status text DEFAULT 'online', p_activity text DEFAULT NULL, p_district_id text DEFAULT NULL, p_session_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.player_presence_state (player_id, status, activity, district_id, session_id, last_heartbeat_at, updated_at)
  VALUES (uid, coalesce(p_status,'online')::public.presence_status, p_activity, p_district_id, p_session_id, now(), now())
  ON CONFLICT (player_id) DO UPDATE SET
    status = EXCLUDED.status, activity = EXCLUDED.activity, district_id = EXCLUDED.district_id,
    session_id = coalesce(EXCLUDED.session_id, public.player_presence_state.session_id),
    last_heartbeat_at = now(), updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.heartbeat_presence(text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_presence(text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_visible_presence(p_player_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'playerId', ps.player_id,
    'status', CASE
      WHEN public.rt_is_blocked(uid, ps.player_id) THEN 'offline'
      WHEN pref.visibility = 'nobody' AND uid IS DISTINCT FROM ps.player_id THEN 'offline'
      WHEN pref.visibility = 'friends' AND uid IS DISTINCT FROM ps.player_id AND NOT public.rt_are_friends(uid, ps.player_id) THEN 'offline'
      WHEN ps.status = 'hidden' AND uid IS DISTINCT FROM ps.player_id THEN 'offline'
      WHEN ps.last_heartbeat_at < now() - interval '2 minutes' THEN 'offline'
      ELSE ps.status::text END,
    'activity', CASE WHEN pref.show_activity THEN ps.activity ELSE NULL END,
    'districtId', CASE WHEN pref.show_location THEN ps.district_id ELSE NULL END
  )), '[]'::jsonb)
  INTO rows
  FROM public.player_presence_state ps
  LEFT JOIN public.presence_preferences pref ON pref.player_id = ps.player_id
  WHERE ps.player_id = ANY(p_player_ids);
  RETURN jsonb_build_object('presence', rows);
END; $$;
REVOKE ALL ON FUNCTION public.get_visible_presence(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_presence(uuid[]) TO authenticated, anon;

-- Moderation actions
CREATE OR REPLACE FUNCTION public.apply_moderation_action(
  p_target uuid, p_action_type text, p_reason_code text, p_reason_safe text,
  p_case_id uuid DEFAULT NULL, p_duration_hours integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); aid uuid;
BEGIN
  IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'moderator authorization required'; END IF;
  IF p_reason_safe IS NULL OR length(trim(p_reason_safe)) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;

  INSERT INTO public.moderation_actions (case_id, target_player_id, action_type, reason_code, reason_safe, created_by, ends_at)
  VALUES (p_case_id, p_target, p_action_type, p_reason_code, p_reason_safe, uid,
    CASE WHEN p_duration_hours IS NOT NULL THEN now() + (p_duration_hours || ' hours')::interval ELSE NULL END)
  RETURNING id INTO aid;

  IF p_action_type IN ('direct_message_restriction','social_suspension','chat_mute') THEN
    UPDATE public.profiles SET social_restricted_until = coalesce(
      now() + (coalesce(p_duration_hours, 24) || ' hours')::interval, social_restricted_until
    ) WHERE id = p_target;
  END IF;

  IF p_action_type = 'message_removal' AND p_case_id IS NOT NULL THEN
    -- Soft-remove linked message if evidence points to one
    NULL;
  END IF;

  PERFORM public.rt_notify(p_target, 'moderation_warning', 'Account notice', p_reason_safe, 'mod',
    jsonb_build_object('action', p_action_type));
  PERFORM public.rt_social_audit(uid, p_target, 'moderation_action', p_action_type, aid::text,
    jsonb_build_object('reasonCode', p_reason_code));
  RETURN jsonb_build_object('ok', true, 'actionId', aid);
END; $$;
REVOKE ALL ON FUNCTION public.apply_moderation_action(uuid,text,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_moderation_action(uuid,text,text,text,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_moderation_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'moderator authorization required'; END IF;
  RETURN jsonb_build_object(
    'openReports', (SELECT count(*) FROM public.player_reports WHERE status='open')
      + (SELECT count(*) FROM public.message_reports WHERE status='open'),
    'openCases', (SELECT count(*) FROM public.moderation_cases WHERE status IN ('open','triaged','investigating')),
    'activeRestrictions', (SELECT count(*) FROM public.moderation_actions WHERE reversed_at IS NULL AND (ends_at IS NULL OR ends_at > now())),
    'messagesToday', (SELECT count(*) FROM public.direct_messages WHERE created_at::date = CURRENT_DATE),
    'rejectedToday', (SELECT count(*) FROM public.social_analytics_events WHERE event_type='message_rejected' AND occurred_at::date = CURRENT_DATE),
    'blocksToday', (SELECT count(*) FROM public.player_blocks WHERE created_at::date = CURRENT_DATE)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_moderation_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_moderation_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_open_moderation_cases(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb;
BEGIN
  IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'moderator authorization required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.priority DESC, c.opened_at ASC), '[]'::jsonb)
  INTO rows FROM (
    SELECT * FROM public.moderation_cases
    WHERE status IN ('open','triaged','investigating')
    ORDER BY priority DESC, opened_at ASC
    LIMIT least(greatest(coalesce(p_limit,50),1), 100)
  ) c;
  RETURN jsonb_build_object('cases', rows);
END; $$;
REVOKE ALL ON FUNCTION public.list_open_moderation_cases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_moderation_cases(integer) TO authenticated;

-- Maintenance
CREATE OR REPLACE FUNCTION public.run_social_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expired_fr integer; expired_mr integer; stale_presence integer; expired_restr integer;
BEGIN
  IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'moderator authorization required'; END IF;
  UPDATE public.friend_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS expired_fr = ROW_COUNT;
  UPDATE public.message_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS expired_mr = ROW_COUNT;
  UPDATE public.player_presence_state SET status = 'offline'
  WHERE status <> 'offline' AND last_heartbeat_at < now() - interval '2 minutes';
  GET DIAGNOSTICS stale_presence = ROW_COUNT;
  UPDATE public.profiles SET social_restricted_until = NULL
  WHERE social_restricted_until IS NOT NULL AND social_restricted_until < now();
  GET DIAGNOSTICS expired_restr = ROW_COUNT;

  IF (SELECT count(*) FROM public.moderation_cases WHERE status IN ('open','triaged') AND opened_at < now() - interval '2 days') > 10 THEN
    INSERT INTO public.social_operational_alerts (severity, category, code, title, message_safe)
    VALUES ('warning','moderation','case_backlog','Moderation case backlog','Open cases older than 2 days exceed threshold')
    ON CONFLICT (code) WHERE status = 'open' DO UPDATE SET
      last_seen_at = now(), occurrence_count = public.social_operational_alerts.occurrence_count + 1;
  END IF;

  RETURN jsonb_build_object(
    'expiredFriendRequests', expired_fr,
    'expiredMessageRequests', expired_mr,
    'stalePresence', stale_presence,
    'expiredRestrictions', expired_restr
  );
END; $$;
REVOKE ALL ON FUNCTION public.run_social_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_social_maintenance() TO authenticated;

-- Reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_friendship_state(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req public.friend_requests; has_friend boolean;
BEGIN
  IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'moderator authorization required'; END IF;
  SELECT * INTO req FROM public.friend_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  has_friend := public.rt_are_friends(req.sender_id, req.recipient_id);
  IF req.status = 'accepted' AND NOT has_friend THEN
    INSERT INTO public.friendships (player_low_id, player_high_id, created_from_request_id, status)
    VALUES (LEAST(req.sender_id, req.recipient_id), GREATEST(req.sender_id, req.recipient_id), req.id, 'active')
    ON CONFLICT (player_low_id, player_high_id) WHERE status = 'active' DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'action', 'friendship_created');
  END IF;
  IF req.status = 'pending' AND has_friend THEN
    UPDATE public.friend_requests SET status = 'accepted', responded_at = now() WHERE id = req.id;
    RETURN jsonb_build_object('ok', true, 'action', 'request_marked_accepted');
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', 'none');
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_friendship_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_friendship_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_privacy_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.rt_ensure_profile_settings(uid);
  UPDATE public.player_profile_settings SET
    profile_visibility = coalesce((p_settings->>'profile_visibility')::public.profile_visibility, profile_visibility),
    friend_request_policy = coalesce((p_settings->>'friend_request_policy')::public.friend_request_policy, friend_request_policy),
    message_policy = coalesce((p_settings->>'message_policy')::public.message_policy, message_policy),
    presence_visibility = coalesce((p_settings->>'presence_visibility')::public.presence_visibility, presence_visibility),
    show_level = coalesce((p_settings->>'show_level')::boolean, show_level),
    show_rank = coalesce((p_settings->>'show_rank')::boolean, show_rank),
    show_equipped_title = coalesce((p_settings->>'show_equipped_title')::boolean, show_equipped_title),
    show_online_status = coalesce((p_settings->>'show_online_status')::boolean, show_online_status),
    allow_profile_search = coalesce((p_settings->>'allow_profile_search')::boolean, allow_profile_search),
    updated_at = now()
  WHERE player_id = uid;
  UPDATE public.presence_preferences SET
    visibility = coalesce((p_settings->>'presence_visibility')::public.presence_visibility, visibility),
    updated_at = now()
  WHERE player_id = uid;
  PERFORM public.rt_social_audit(uid, uid, 'privacy_setting_changed', 'settings', NULL);
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.update_privacy_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_privacy_settings(jsonb) TO authenticated;

COMMENT ON FUNCTION public.send_direct_message IS 'Phase 10J DM send. Rejects seed-phrase/scam content. Soft-holds suspicious short links.';
COMMENT ON FUNCTION public.rt_notify IS 'INTERNAL ONLY. Public execute revoked in Phase 10J.';


-- ===== END database/migrations/20260716_phase10j_social_identity_moderation.sql =====



-- ===== BEGIN database/migrations/20260716_phase10k_parties_shared_missions_matchmaking.sql =====

-- Phase 10K — Parties, Shared Missions, Matchmaking Foundation & Anti-Boosting
-- Additive on Phases 10G–10J. Server-authoritative. No client membership inserts.
-- TEST shared mission and TEST queue default OFF / paused / draft.

BEGIN;

-- ── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.party_status AS ENUM ('active','queued','in_activity','restricted','disbanded','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_visibility AS ENUM ('private','friends_only','discoverable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_join_policy AS ENUM ('invite_only','request_to_join','friends','open');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_member_role AS ENUM ('leader','officer','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_member_status AS ENUM ('active','invited','disconnected','left','removed','restricted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_ready_state AS ENUM ('not_ready','ready','disconnected','locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_invite_status AS ENUM ('pending','accepted','rejected','cancelled','expired','blocked','party_full','invalidated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_mission_status AS ENUM ('pending','active','completed','failed','cancelled','expired','under_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_eligibility AS ENUM ('eligible','pending','ineligible','disconnected','removed','blocked','under_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_reward_status AS ENUM ('pending','finalized','claimable','claimed','held','forfeited','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_queue_entry_status AS ENUM ('queued','matching','matched','cancelled','expired','invalidated','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_lobby_status AS ENUM ('forming','ready_check','ready','active','completed','cancelled','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.party_risk_outcome AS ENUM ('clear','review','restricted','reward_held');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Parties ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 32),
  normalized_name text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  leader_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.party_status NOT NULL DEFAULT 'active',
  visibility public.party_visibility NOT NULL DEFAULT 'private',
  join_policy public.party_join_policy NOT NULL DEFAULT 'invite_only',
  max_members integer NOT NULL DEFAULT 4 CHECK (max_members BETWEEN 2 AND 4),
  current_activity_type text,
  current_activity_id text,
  region text,
  language text,
  description text CHECK (description IS NULL OR char_length(description) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disbanded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_parties_leader ON public.parties (leader_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_parties_status ON public.parties (status);
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.party_member_role NOT NULL DEFAULT 'member',
  status public.party_member_status NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  removed_at timestamptz,
  removed_by uuid REFERENCES public.profiles(id),
  ready_state public.party_ready_state NOT NULL DEFAULT 'not_ready',
  last_active_at timestamptz NOT NULL DEFAULT now(),
  contribution_state text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, player_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_one_active_membership
  ON public.party_members (player_id) WHERE status = 'active' AND left_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_one_leader
  ON public.party_members (party_id) WHERE role = 'leader' AND status = 'active' AND left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_party_members_party ON public.party_members (party_id, status);
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_members: self or peer read" ON public.party_members;
CREATE POLICY "party_members: self or peer read" ON public.party_members FOR SELECT USING (
  player_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.party_members me
    WHERE me.party_id = party_members.party_id AND me.player_id = auth.uid()
      AND me.status = 'active' AND me.left_at IS NULL
  )
);

CREATE TABLE IF NOT EXISTS public.party_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.party_invite_status NOT NULL DEFAULT 'pending',
  message text CHECK (message IS NULL OR char_length(message) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  responded_at timestamptz,
  cancelled_at timestamptz,
  CHECK (sender_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_invite_pending
  ON public.party_invitations (party_id, recipient_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_party_invites_recipient ON public.party_invitations (recipient_id, status);
ALTER TABLE public.party_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_invites: participants read" ON public.party_invitations;
CREATE POLICY "party_invites: participants read" ON public.party_invitations FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE TABLE IF NOT EXISTS public.party_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.party_invite_status NOT NULL DEFAULT 'pending',
  message text CHECK (message IS NULL OR char_length(message) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  responded_at timestamptz,
  responded_by uuid REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_join_pending
  ON public.party_join_requests (party_id, requester_id) WHERE status = 'pending';
ALTER TABLE public.party_join_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_join: participants read" ON public.party_join_requests;
CREATE POLICY "party_join: participants read" ON public.party_join_requests FOR SELECT USING (
  auth.uid() = requester_id
  OR EXISTS (
    SELECT 1 FROM public.party_members m
    WHERE m.party_id = party_join_requests.party_id AND m.player_id = auth.uid()
      AND m.status = 'active' AND m.role IN ('leader','officer') AND m.left_at IS NULL
  )
);

CREATE TABLE IF NOT EXISTS public.party_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  client_message_id text NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','system','activity','structured_share')),
  body text NOT NULL,
  safe_body text,
  original_body text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','held','rejected','edited','deleted')),
  reply_to_message_id uuid REFERENCES public.party_chat_messages(id),
  moderation_state public.message_moderation_state NOT NULL DEFAULT 'allowed',
  risk_score integer NOT NULL DEFAULT 0,
  moderation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, sender_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS idx_party_chat_party_time ON public.party_chat_messages (party_id, created_at DESC);
ALTER TABLE public.party_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_chat: active member read" ON public.party_chat_messages;
CREATE POLICY "party_chat: active member read" ON public.party_chat_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.party_members m
    WHERE m.party_id = party_chat_messages.party_id AND m.player_id = auth.uid()
      AND m.status = 'active' AND m.left_at IS NULL
  )
);

CREATE TABLE IF NOT EXISTS public.party_message_reads (
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_message_id uuid,
  PRIMARY KEY (party_id, player_id)
);
ALTER TABLE public.party_message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_reads: owner" ON public.party_message_reads;
CREATE POLICY "party_reads: owner" ON public.party_message_reads FOR ALL
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.party_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_player_id uuid REFERENCES public.profiles(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_activity_party ON public.party_activity_events (party_id, created_at DESC);
ALTER TABLE public.party_activity_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_presence_state (
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online',
  activity_type text,
  activity_id text,
  district_id text,
  ready_state public.party_ready_state NOT NULL DEFAULT 'not_ready',
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, player_id)
);
ALTER TABLE public.party_presence_state ENABLE ROW LEVEL SECURITY;

-- Shared mission catalog (separate from solo mission_definitions)
CREATE TABLE IF NOT EXISTS public.party_mission_definitions (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  mission_scope text NOT NULL DEFAULT 'party_required'
    CHECK (mission_scope IN ('solo','party_optional','party_required')),
  contribution_method text NOT NULL DEFAULT 'unique_member_actions'
    CHECK (contribution_method IN (
      'individual_completion','cumulative_party_count','unique_member_actions',
      'sequence','synchronized_presence','event_participation','objective_roles'
    )),
  min_party_size integer NOT NULL DEFAULT 2,
  max_party_size integer NOT NULL DEFAULT 4,
  progress_target integer NOT NULL DEFAULT 4 CHECK (progress_target > 0),
  min_contribution_per_member integer NOT NULL DEFAULT 1,
  allocation_method text NOT NULL DEFAULT 'equal_eligible'
    CHECK (allocation_method IN ('equal_eligible','individual_fixed','contribution_weighted','threshold_bands','leader_independent')),
  reward_xp integer NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  reward_rep integer NOT NULL DEFAULT 0 CHECK (reward_rep >= 0),
  reward_rug integer NOT NULL DEFAULT 0 CHECK (reward_rug >= 0),
  duration_minutes integer NOT NULL DEFAULT 60,
  join_cutoff_minutes integer NOT NULL DEFAULT 10,
  cooldown_hours integer NOT NULL DEFAULT 20,
  is_test boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  rules_version text NOT NULL DEFAULT '1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.party_mission_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_mission_defs: public read" ON public.party_mission_definitions;
CREATE POLICY "party_mission_defs: public read" ON public.party_mission_definitions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.party_shared_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  mission_definition_id text NOT NULL REFERENCES public.party_mission_definitions(id),
  rules_version text NOT NULL,
  status public.party_mission_status NOT NULL DEFAULT 'active',
  started_by uuid NOT NULL REFERENCES public.profiles(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  join_cutoff_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz NOT NULL,
  progress_value integer NOT NULL DEFAULT 0,
  progress_target integer NOT NULL,
  risk_outcome public.party_risk_outcome NOT NULL DEFAULT 'clear',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_mission_active
  ON public.party_shared_missions (party_id, mission_definition_id)
  WHERE status = 'active';
ALTER TABLE public.party_shared_missions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_mission_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_shared_mission_id uuid NOT NULL REFERENCES public.party_shared_missions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id),
  party_member_id uuid REFERENCES public.party_members(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  eligibility_status public.party_eligibility NOT NULL DEFAULT 'eligible',
  contribution_status text NOT NULL DEFAULT 'none',
  contribution_value integer NOT NULL DEFAULT 0,
  minimum_contribution_met boolean NOT NULL DEFAULT false,
  reward_status public.party_reward_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_shared_mission_id, player_id)
);
ALTER TABLE public.party_mission_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_mission_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_shared_mission_id uuid NOT NULL REFERENCES public.party_shared_missions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id),
  action_receipt_id uuid REFERENCES public.gameplay_action_receipts(id),
  contribution_type text NOT NULL,
  contribution_value integer NOT NULL DEFAULT 1 CHECK (contribution_value > 0),
  evidence_hash text NOT NULL,
  sequence_number integer,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','rejected','duplicate','flagged')),
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_shared_mission_id, evidence_hash),
  UNIQUE (party_shared_mission_id, action_receipt_id)
);
CREATE INDEX IF NOT EXISTS idx_party_contrib_mission ON public.party_mission_contributions (party_shared_mission_id, player_id);
ALTER TABLE public.party_mission_contributions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_reward_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_shared_mission_id uuid NOT NULL REFERENCES public.party_shared_missions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id),
  reward_definition_id text,
  asset_type text NOT NULL CHECK (asset_type IN ('XP','REP','RUG_POINTS','SEASON_POINTS')),
  amount integer NOT NULL CHECK (amount >= 0),
  allocation_method text NOT NULL,
  contribution_score integer NOT NULL DEFAULT 0,
  eligibility_status public.party_eligibility NOT NULL DEFAULT 'eligible',
  status public.party_reward_status NOT NULL DEFAULT 'claimable',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (party_shared_mission_id, player_id, asset_type),
  UNIQUE (idempotency_key)
);
ALTER TABLE public.party_reward_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_alloc: owner read" ON public.party_reward_allocations;
CREATE POLICY "party_alloc: owner read" ON public.party_reward_allocations FOR SELECT
  USING (auth.uid() = player_id);

CREATE TABLE IF NOT EXISTS public.party_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.party_reward_allocations(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','failed','held')),
  reward_ledger_id uuid,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (allocation_id)
);
ALTER TABLE public.party_reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_claims: owner read" ON public.party_reward_claims;
CREATE POLICY "party_claims: owner read" ON public.party_reward_claims FOR SELECT
  USING (auth.uid() = player_id);

-- Matchmaking
CREATE TABLE IF NOT EXISTS public.party_matchmaking_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  activity_type text NOT NULL,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('draft','active','paused','archived')),
  minimum_party_size integer NOT NULL DEFAULT 2,
  maximum_party_size integer NOT NULL DEFAULT 4,
  target_lobby_size integer NOT NULL DEFAULT 2,
  region_policy text NOT NULL DEFAULT 'any',
  skill_policy text NOT NULL DEFAULT 'none',
  rules_version text NOT NULL DEFAULT '1',
  is_test boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.party_matchmaking_queues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_queues: public read" ON public.party_matchmaking_queues;
CREATE POLICY "party_queues: public read" ON public.party_matchmaking_queues FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.party_matchmaking_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.party_matchmaking_queues(id),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  status public.party_queue_entry_status NOT NULL DEFAULT 'queued',
  queued_by uuid NOT NULL REFERENCES public.profiles(id),
  queued_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  matched_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  region text,
  party_size integer NOT NULL,
  rules_version text NOT NULL,
  idempotency_key text NOT NULL,
  UNIQUE (idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_queue_active
  ON public.party_matchmaking_entries (party_id) WHERE status IN ('queued','matching');
ALTER TABLE public.party_matchmaking_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.matchmaking_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.party_matchmaking_queues(id),
  status public.party_lobby_status NOT NULL DEFAULT 'forming',
  rules_version text NOT NULL,
  is_test boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.matchmaking_lobbies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.matchmaking_lobby_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.matchmaking_lobbies(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.parties(id),
  entry_id uuid NOT NULL REFERENCES public.party_matchmaking_entries(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lobby_id, party_id),
  UNIQUE (entry_id)
);
ALTER TABLE public.matchmaking_lobby_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.matchmaking_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.matchmaking_lobbies(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.parties(id),
  assignment_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lobby_id, party_id),
  UNIQUE (assignment_key)
);
ALTER TABLE public.matchmaking_assignments ENABLE ROW LEVEL SECURITY;

-- Moderation / audit / analytics / ops
CREATE TABLE IF NOT EXISTS public.party_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  party_id uuid REFERENCES public.parties(id),
  reported_player_id uuid REFERENCES public.profiles(id),
  message_id uuid REFERENCES public.party_chat_messages(id),
  category text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.party_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "party_reports: reporter read own" ON public.party_reports;
CREATE POLICY "party_reports: reporter read own" ON public.party_reports FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE TABLE IF NOT EXISTS public.party_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_player_id uuid,
  target_player_id uuid,
  party_id uuid,
  action_type text NOT NULL,
  source_type text,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_audit_party ON public.party_audit_log (party_id, created_at DESC);
ALTER TABLE public.party_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  party_id uuid,
  player_id uuid,
  ref_type text,
  ref_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_analytics_type ON public.party_analytics_events (event_type, occurred_at DESC);
ALTER TABLE public.party_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info',
  category text NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  message_safe text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_alert_open_code
  ON public.party_operational_alerts (code) WHERE status = 'open';
ALTER TABLE public.party_operational_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.party_maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  rows_processed integer NOT NULL DEFAULT 0,
  error_code text,
  error_message_safe text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.party_maintenance_runs ENABLE ROW LEVEL SECURITY;

-- Extend solo mission_definitions with optional party metadata (additive, nullable-safe via jsonb)
ALTER TABLE public.mission_definitions
  ADD COLUMN IF NOT EXISTS party_scope text,
  ADD COLUMN IF NOT EXISTS party_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Seed TEST mission (inactive) and TEST queue (paused)
INSERT INTO public.party_mission_definitions (
  id, title, description, mission_scope, contribution_method,
  min_party_size, max_party_size, progress_target, min_contribution_per_member,
  allocation_method, reward_xp, reward_rep, reward_rug, duration_minutes,
  is_test, active, rules_version, metadata
) VALUES (
  'test-town-tour-2026',
  'TEST Town Tour',
  'Party members interact with several landmarks. Each member must contribute at least once. TEST only — no SOL/SPL.',
  'party_required', 'unique_member_actions',
  2, 4, 4, 1,
  'equal_eligible', 25, 5, 0, 45,
  true, false, '1',
  jsonb_build_object('landmarks', jsonb_build_array('fountain','market','bridge','fame'), 'noIdleReward', true)
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.party_matchmaking_queues (
  slug, name, activity_type, status, minimum_party_size, maximum_party_size,
  target_lobby_size, is_test, rules_version
) VALUES (
  'test-party-activity-queue',
  'TEST Party Activity Queue',
  'test_shared_activity',
  'paused', 2, 4, 2, true, '1'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.reward_definitions (id, source_type, reward_type, amount, active, rules_version)
VALUES
  ('party_test_xp', 'party_shared_mission', 'XP', 25, true, '1'),
  ('party_test_rep', 'party_shared_mission', 'REP', 5, true, '1')
ON CONFLICT (id) DO NOTHING;

-- Parties read policy (after party_members exists)
DROP POLICY IF EXISTS "parties: member read" ON public.parties;
CREATE POLICY "parties: member read" ON public.parties FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.party_members m
    WHERE m.party_id = parties.id AND m.player_id = auth.uid() AND m.status = 'active' AND m.left_at IS NULL
  )
  OR (visibility = 'discoverable' AND status = 'active')
);
-- Phase 10K, part 2: party helpers and lifecycle RPCs. Transaction continues from part 1.

CREATE OR REPLACE FUNCTION public.rt_party_audit(p_actor uuid, p_target uuid, p_party uuid, p_action text, p_source text DEFAULT NULL, p_source_id text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.party_audit_log(actor_player_id,target_player_id,party_id,action_type,source_type,source_id,metadata)
  VALUES (p_actor,p_target,p_party,p_action,p_source,p_source_id,coalesce(p_metadata,'{}'::jsonb));
$$;
CREATE OR REPLACE FUNCTION public.rt_party_analytics(p_event text, p_party uuid DEFAULT NULL, p_player uuid DEFAULT NULL, p_ref_type text DEFAULT NULL, p_ref_id text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.party_analytics_events(event_type,party_id,player_id,ref_type,ref_id) VALUES (p_event,p_party,p_player,p_ref_type,p_ref_id);
$$;
CREATE OR REPLACE FUNCTION public.rt_party_activity(p_party uuid, p_event text, p_actor uuid DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.party_activity_events(party_id,event_type,actor_player_id,metadata) VALUES (p_party,p_event,p_actor,coalesce(p_metadata,'{}'::jsonb));
$$;
CREATE OR REPLACE FUNCTION public.rt_normalize_party_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g'));
$$;
CREATE OR REPLACE FUNCTION public.rt_validate_party_name(p_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n text := public.rt_normalize_party_name(p_name);
BEGIN
  IF char_length(n) < 3 OR char_length(n) > 32 OR n !~ '^[[:alnum:]][[:alnum:] ''_-]*[[:alnum:]]$' THEN
    RAISE EXCEPTION 'invalid party name';
  END IF;
  RETURN n;
END; $$;
CREATE OR REPLACE FUNCTION public.rt_active_party_id(p_player uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT party_id FROM public.party_members WHERE player_id=p_player AND status='active' AND left_at IS NULL LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.rt_party_member_count(p_party uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.party_members WHERE party_id=p_party AND status='active' AND left_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.rt_party_has_block_conflict(p_party uuid, p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.party_members m WHERE m.party_id=p_party AND m.status='active' AND m.left_at IS NULL AND public.rt_is_blocked(m.player_id,p_player));
$$;
CREATE OR REPLACE FUNCTION public.rt_party_has_permission(p_party uuid, p_player uuid DEFAULT auth.uid(), p_permission text DEFAULT 'manage')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_members
    WHERE party_id=p_party AND player_id=p_player AND status='active' AND left_at IS NULL
      AND (role='leader' OR (role='officer' AND p_permission IN ('manage','invite','requests')))
  );
$$;

CREATE OR REPLACE FUNCTION public.create_party(p_name text, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid; norm text; key text:=coalesce(nullif(p_idempotency_key,''),'create:'||uid::text||':'||public.rt_normalize_party_name(p_name));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'social restricted'; END IF;
  IF public.rt_active_party_id(uid) IS NOT NULL THEN RAISE EXCEPTION 'already in an active party'; END IF;
  IF NOT public.rt_check_rate_limit(uid,'party_create',5,3600) THEN RAISE EXCEPTION 'rate limited'; END IF;
  norm:=public.rt_validate_party_name(p_name);
  SELECT id INTO pid FROM public.parties WHERE created_by=uid AND normalized_name=norm AND status='active' AND created_at>now()-interval '1 day';
  IF pid IS NULL THEN
    INSERT INTO public.parties(name,normalized_name,created_by,leader_id) VALUES(trim(p_name),norm,uid,uid) RETURNING id INTO pid;
    INSERT INTO public.party_members(party_id,player_id,role) VALUES(pid,uid,'leader');
    PERFORM public.rt_party_audit(uid,NULL,pid,'party_created','party',key);
    PERFORM public.rt_party_activity(pid,'party_created',uid);
  END IF;
  RETURN jsonb_build_object('ok',true,'partyId',pid);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_party()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT jsonb_build_object('party',to_jsonb(p),'members',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.joined_at) FROM public.party_members m WHERE m.party_id=p.id AND m.status='active' AND m.left_at IS NULL),'[]'::jsonb))
  FROM public.parties p WHERE p.id=public.rt_active_party_id(auth.uid())),'null'::jsonb);
$$;
CREATE OR REPLACE FUNCTION public.get_my_party_permissions()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('partyId',m.party_id,'role',m.role,'canManage',m.role IN ('leader','officer'),'canDisband',m.role='leader')
  FROM public.party_members m WHERE m.player_id=auth.uid() AND m.status='active' AND m.left_at IS NULL LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.invite_player_to_party(p_recipient_id uuid, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid; iid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  pid:=public.rt_active_party_id(uid);
  IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'invite') THEN RAISE EXCEPTION 'party permission denied'; END IF;
  IF uid=p_recipient_id OR public.rt_social_restricted(uid) OR public.rt_social_restricted(p_recipient_id) OR public.rt_is_blocked(uid,p_recipient_id) OR public.rt_party_has_block_conflict(pid,p_recipient_id) THEN RAISE EXCEPTION 'invite not allowed'; END IF;
  IF public.rt_active_party_id(p_recipient_id) IS NOT NULL OR public.rt_party_member_count(pid)>=(SELECT max_members FROM public.parties WHERE id=pid) THEN RAISE EXCEPTION 'party unavailable'; END IF;
  IF NOT public.rt_check_rate_limit(uid,'party_invite',20,3600) THEN RAISE EXCEPTION 'rate limited'; END IF;
  INSERT INTO public.party_invitations(party_id,sender_id,recipient_id,message) VALUES(pid,uid,p_recipient_id,nullif(trim(p_message),''))
  ON CONFLICT (party_id, recipient_id) WHERE status = 'pending' DO UPDATE SET message=EXCLUDED.message,created_at=now(),expires_at=now()+interval '24 hours'
  RETURNING id INTO iid;
  PERFORM public.rt_party_audit(uid,p_recipient_id,pid,'party_invited','invitation',iid::text);
  RETURN jsonb_build_object('ok',true,'invitationId',iid);
END; $$;

CREATE OR REPLACE FUNCTION public.respond_to_party_invitation(p_invitation_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); i public.party_invitations; mid uuid;
BEGIN
  SELECT * INTO i FROM public.party_invitations WHERE id=p_invitation_id FOR UPDATE;
  IF uid IS NULL OR i.recipient_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'invitation not found'; END IF;
  IF i.status<>'pending' OR i.expires_at<=now() THEN UPDATE public.party_invitations SET status='expired',responded_at=now() WHERE id=i.id AND status='pending'; RAISE EXCEPTION 'invitation expired'; END IF;
  IF NOT p_accept THEN UPDATE public.party_invitations SET status='rejected',responded_at=now() WHERE id=i.id; RETURN jsonb_build_object('ok',true,'accepted',false); END IF;
  IF public.rt_active_party_id(uid) IS NOT NULL OR public.rt_social_restricted(uid) OR public.rt_party_has_block_conflict(i.party_id,uid) OR public.rt_party_member_count(i.party_id)>=(SELECT max_members FROM public.parties WHERE id=i.party_id AND status='active') THEN
    UPDATE public.party_invitations SET status=CASE WHEN public.rt_party_has_block_conflict(i.party_id,uid) THEN 'blocked' ELSE 'party_full' END,responded_at=now() WHERE id=i.id; RAISE EXCEPTION 'unable to join party';
  END IF;
  INSERT INTO public.party_members(party_id,player_id) VALUES(i.party_id,uid) RETURNING id INTO mid;
  UPDATE public.party_invitations SET status='accepted',responded_at=now() WHERE id=i.id;
  UPDATE public.party_join_requests SET status='invalidated',responded_at=now() WHERE party_id=i.party_id AND requester_id=uid AND status='pending';
  PERFORM public.rt_party_audit(uid,i.sender_id,i.party_id,'party_invitation_accepted','invitation',i.id::text);
  PERFORM public.rt_party_activity(i.party_id,'member_joined',uid);
  RETURN jsonb_build_object('ok',true,'partyId',i.party_id,'memberId',mid);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_party_invitation(p_invitation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); i public.party_invitations;
BEGIN SELECT * INTO i FROM public.party_invitations WHERE id=p_invitation_id FOR UPDATE;
  IF i.sender_id IS DISTINCT FROM uid OR NOT public.rt_party_has_permission(i.party_id,uid,'invite') THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.party_invitations SET status='cancelled',cancelled_at=now() WHERE id=i.id AND status='pending';
  RETURN jsonb_build_object('ok',true);
END; $$;
CREATE OR REPLACE FUNCTION public.get_my_party_invitations()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC),'[]'::jsonb) FROM public.party_invitations i WHERE i.recipient_id=auth.uid() AND i.status='pending' AND i.expires_at>now();
$$;

CREATE OR REPLACE FUNCTION public.request_to_join_party(p_party_id uuid, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); rid uuid; policy public.party_join_policy;
BEGIN
 IF uid IS NULL OR public.rt_active_party_id(uid) IS NOT NULL OR public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'cannot request party'; END IF;
 SELECT join_policy INTO policy FROM public.parties WHERE id=p_party_id AND status='active';
 IF policy IS NULL OR policy='invite_only' OR public.rt_party_member_count(p_party_id)>=(SELECT max_members FROM public.parties WHERE id=p_party_id) OR public.rt_party_has_block_conflict(p_party_id,uid) THEN RAISE EXCEPTION 'party unavailable'; END IF;
 IF NOT public.rt_check_rate_limit(uid,'party_join_request',10,3600) THEN RAISE EXCEPTION 'rate limited'; END IF;
 INSERT INTO public.party_join_requests(party_id,requester_id,message) VALUES(p_party_id,uid,nullif(trim(p_message),''))
 ON CONFLICT (party_id,requester_id) WHERE status='pending' DO UPDATE SET message=EXCLUDED.message,created_at=now(),expires_at=now()+interval '24 hours' RETURNING id INTO rid;
 RETURN jsonb_build_object('ok',true,'requestId',rid);
END; $$;

CREATE OR REPLACE FUNCTION public.respond_to_party_join_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); r public.party_join_requests;
BEGIN SELECT * INTO r FROM public.party_join_requests WHERE id=p_request_id FOR UPDATE;
 IF uid IS NULL OR NOT public.rt_party_has_permission(r.party_id,uid,'requests') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF r.status<>'pending' OR r.expires_at<=now() THEN UPDATE public.party_join_requests SET status='expired',responded_at=now(),responded_by=uid WHERE id=r.id AND status='pending'; RAISE EXCEPTION 'request expired'; END IF;
 IF NOT p_accept THEN UPDATE public.party_join_requests SET status='rejected',responded_at=now(),responded_by=uid WHERE id=r.id; RETURN jsonb_build_object('ok',true,'accepted',false); END IF;
 IF public.rt_active_party_id(r.requester_id) IS NOT NULL OR public.rt_social_restricted(r.requester_id) OR public.rt_party_has_block_conflict(r.party_id,r.requester_id) OR public.rt_party_member_count(r.party_id)>=(SELECT max_members FROM public.parties WHERE id=r.party_id) THEN RAISE EXCEPTION 'requester cannot join'; END IF;
 INSERT INTO public.party_members(party_id,player_id) VALUES(r.party_id,r.requester_id);
 UPDATE public.party_join_requests SET status='accepted',responded_at=now(),responded_by=uid WHERE id=r.id;
 PERFORM public.rt_party_activity(r.party_id,'member_joined',r.requester_id);
 RETURN jsonb_build_object('ok',true,'partyId',r.party_id);
END; $$;
CREATE OR REPLACE FUNCTION public.cancel_party_join_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.party_join_requests SET status='cancelled',responded_at=now() WHERE id=p_request_id AND requester_id=auth.uid() AND status='pending'; RETURN jsonb_build_object('ok',true); END; $$;
CREATE OR REPLACE FUNCTION public.get_party_join_requests()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at),'[]'::jsonb) FROM public.party_join_requests r WHERE r.party_id=public.rt_active_party_id(auth.uid()) AND r.status='pending' AND r.expires_at>now() AND public.rt_party_has_permission(r.party_id,auth.uid(),'requests');
$$;

CREATE OR REPLACE FUNCTION public.transfer_party_leadership(p_new_leader_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid);
BEGIN
 IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.party_members WHERE party_id=pid AND player_id=uid AND role='leader' AND status='active' AND left_at IS NULL) THEN RAISE EXCEPTION 'leader required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.party_members WHERE party_id=pid AND player_id=p_new_leader_id AND status='active' AND left_at IS NULL) THEN RAISE EXCEPTION 'new leader must be active member'; END IF;
 UPDATE public.party_members SET role='officer' WHERE party_id=pid AND player_id=uid AND role='leader';
 UPDATE public.party_members SET role='leader' WHERE party_id=pid AND player_id=p_new_leader_id;
 UPDATE public.parties SET leader_id=p_new_leader_id,updated_at=now() WHERE id=pid;
 PERFORM public.rt_party_activity(pid,'leadership_transferred',uid,jsonb_build_object('newLeaderId',p_new_leader_id));
 RETURN jsonb_build_object('ok',true,'partyId',pid,'leaderId',p_new_leader_id);
END; $$;

CREATE OR REPLACE FUNCTION public.leave_party()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid); next_id uuid;
BEGIN
 IF pid IS NULL THEN RAISE EXCEPTION 'not in party'; END IF;
 SELECT player_id INTO next_id FROM public.party_members WHERE party_id=pid AND player_id<>uid AND status='active' AND left_at IS NULL ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END,joined_at LIMIT 1;
 UPDATE public.party_members SET status='left',left_at=now(),ready_state='not_ready' WHERE party_id=pid AND player_id=uid AND status='active';
 UPDATE public.party_mission_members SET left_at=now(),eligibility_status='ineligible' WHERE party_shared_mission_id IN (SELECT id FROM public.party_shared_missions WHERE party_id=pid AND status='active') AND player_id=uid AND left_at IS NULL;
 IF next_id IS NULL THEN UPDATE public.parties SET status='disbanded',disbanded_at=now(),updated_at=now() WHERE id=pid; UPDATE public.party_invitations SET status='invalidated',responded_at=now() WHERE party_id=pid AND status='pending'; UPDATE public.party_join_requests SET status='invalidated',responded_at=now() WHERE party_id=pid AND status='pending'; UPDATE public.party_matchmaking_entries SET status='cancelled',cancelled_at=now() WHERE party_id=pid AND status IN ('queued','matching');
 ELSE UPDATE public.party_members SET role='leader' WHERE party_id=pid AND player_id=next_id; UPDATE public.parties SET leader_id=next_id,updated_at=now() WHERE id=pid; END IF;
 PERFORM public.rt_party_activity(pid,'member_left',uid);
 RETURN jsonb_build_object('ok',true,'partyId',pid,'newLeaderId',next_id,'disbanded',next_id IS NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.remove_party_member(p_member_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid);
BEGIN
 IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'manage') OR p_member_player_id=uid THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF EXISTS(SELECT 1 FROM public.party_members WHERE party_id=pid AND player_id=p_member_player_id AND role='leader' AND status='active') THEN RAISE EXCEPTION 'transfer leadership first'; END IF;
 UPDATE public.party_members SET status='removed',removed_at=now(),removed_by=uid,ready_state='not_ready' WHERE party_id=pid AND player_id=p_member_player_id AND status='active';
 UPDATE public.party_mission_members SET left_at=now(),eligibility_status='removed' WHERE player_id=p_member_player_id AND left_at IS NULL AND party_shared_mission_id IN (SELECT id FROM public.party_shared_missions WHERE party_id=pid AND status='active');
 PERFORM public.rt_party_activity(pid,'member_removed',uid,jsonb_build_object('playerId',p_member_player_id));
 RETURN jsonb_build_object('ok',true);
END; $$;
CREATE OR REPLACE FUNCTION public.disband_party()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid);
BEGIN
 IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.party_members WHERE party_id=pid AND player_id=uid AND role='leader' AND status='active') THEN RAISE EXCEPTION 'leader required'; END IF;
 UPDATE public.parties SET status='disbanded',disbanded_at=now(),updated_at=now() WHERE id=pid;
 UPDATE public.party_members SET status='left',left_at=now(),ready_state='not_ready' WHERE party_id=pid AND status='active';
 UPDATE public.party_invitations SET status='invalidated',responded_at=now() WHERE party_id=pid AND status='pending';
 UPDATE public.party_join_requests SET status='invalidated',responded_at=now() WHERE party_id=pid AND status='pending';
 UPDATE public.party_matchmaking_entries SET status='cancelled',cancelled_at=now() WHERE party_id=pid AND status IN ('queued','matching');
 UPDATE public.party_shared_missions SET status='cancelled',failed_at=now() WHERE party_id=pid AND status='active';
 PERFORM public.rt_party_activity(pid,'party_disbanded',uid); RETURN jsonb_build_object('ok',true);
END; $$;
CREATE OR REPLACE FUNCTION public.set_party_ready_state(p_ready boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid);
BEGIN IF pid IS NULL THEN RAISE EXCEPTION 'not in party'; END IF;
 UPDATE public.party_members SET ready_state=CASE WHEN p_ready THEN 'ready'::public.party_ready_state ELSE 'not_ready'::public.party_ready_state END,last_active_at=now() WHERE party_id=pid AND player_id=uid AND status='active';
 UPDATE public.party_presence_state SET ready_state=CASE WHEN p_ready THEN 'ready'::public.party_ready_state ELSE 'not_ready'::public.party_ready_state END,updated_at=now() WHERE party_id=pid AND player_id=uid;
 RETURN jsonb_build_object('ok',true,'ready',p_ready); END; $$;
CREATE OR REPLACE FUNCTION public.update_party_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid);
BEGIN
 IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'manage') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF p_settings ? 'visibility' AND (p_settings->>'visibility') NOT IN ('private','friends_only','discoverable') THEN RAISE EXCEPTION 'invalid visibility'; END IF;
 IF p_settings ? 'joinPolicy' AND (p_settings->>'joinPolicy') NOT IN ('invite_only','request_to_join','friends','open') THEN RAISE EXCEPTION 'invalid join policy'; END IF;
 UPDATE public.parties SET visibility=coalesce((p_settings->>'visibility')::public.party_visibility,visibility),join_policy=coalesce((p_settings->>'joinPolicy')::public.party_join_policy,join_policy),description=CASE WHEN p_settings ? 'description' THEN nullif(left(trim(p_settings->>'description'),200),'') ELSE description END,region=CASE WHEN p_settings ? 'region' THEN nullif(trim(p_settings->>'region'),'') ELSE region END,language=CASE WHEN p_settings ? 'language' THEN nullif(trim(p_settings->>'language'),'') ELSE language END,updated_at=now() WHERE id=pid;
 RETURN jsonb_build_object('ok',true,'partyId',pid);
END; $$;
CREATE OR REPLACE FUNCTION public.search_discoverable_parties(p_query text DEFAULT '', p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF NOT public.rt_check_rate_limit(uid,'party_search',60,3600) THEN RAISE EXCEPTION 'rate limited'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'region',p.region,'language',p.language,'memberCount',public.rt_party_member_count(p.id),'maxMembers',p.max_members) ORDER BY p.created_at DESC),'[]'::jsonb)
 FROM (SELECT * FROM public.parties WHERE status='active' AND visibility='discoverable' AND public.rt_party_member_count(id)<max_members AND NOT public.rt_social_restricted(created_by) AND (coalesce(trim(p_query),'')='' OR normalized_name ILIKE '%'||public.rt_normalize_party_name(p_query)||'%') ORDER BY created_at DESC LIMIT greatest(1,least(coalesce(p_limit,20),50))) p);
END; $$;

REVOKE ALL ON FUNCTION public.rt_party_audit(uuid,uuid,uuid,text,text,text,jsonb), public.rt_party_analytics(text,uuid,uuid,text,text), public.rt_party_activity(uuid,text,uuid,jsonb), public.rt_normalize_party_name(text), public.rt_validate_party_name(text), public.rt_active_party_id(uuid), public.rt_party_member_count(uuid), public.rt_party_has_block_conflict(uuid,uuid), public.rt_party_has_permission(uuid,uuid,text), public.create_party(text,text), public.get_my_party(), public.get_my_party_permissions(), public.invite_player_to_party(uuid,text), public.respond_to_party_invitation(uuid,boolean), public.cancel_party_invitation(uuid), public.get_my_party_invitations(), public.request_to_join_party(uuid,text), public.respond_to_party_join_request(uuid,boolean), public.cancel_party_join_request(uuid), public.get_party_join_requests(), public.transfer_party_leadership(uuid), public.leave_party(), public.remove_party_member(uuid), public.disband_party(), public.set_party_ready_state(boolean), public.update_party_settings(jsonb), public.search_discoverable_parties(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_party(text,text), public.get_my_party(), public.get_my_party_permissions(), public.invite_player_to_party(uuid,text), public.respond_to_party_invitation(uuid,boolean), public.cancel_party_invitation(uuid), public.get_my_party_invitations(), public.request_to_join_party(uuid,text), public.respond_to_party_join_request(uuid,boolean), public.cancel_party_join_request(uuid), public.get_party_join_requests(), public.transfer_party_leadership(uuid), public.leave_party(), public.remove_party_member(uuid), public.disband_party(), public.set_party_ready_state(boolean), public.update_party_settings(jsonb), public.search_discoverable_parties(text,integer) TO authenticated;
-- Phase 10K, part 3: chat, shared missions, matchmaking and operations.

CREATE OR REPLACE FUNCTION public.send_party_chat_message(p_party_id uuid, p_client_message_id text, p_body text, p_reply_to uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); check_result jsonb; mid uuid;
BEGIN
 IF uid IS NULL OR public.rt_active_party_id(uid) IS DISTINCT FROM p_party_id OR public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'party chat unavailable'; END IF;
 IF nullif(trim(p_client_message_id),'') IS NULL OR char_length(p_client_message_id)>128 OR NOT public.rt_check_rate_limit(uid,'party_chat',60,60) THEN RAISE EXCEPTION 'invalid or rate limited message'; END IF;
 IF p_reply_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.party_chat_messages WHERE id=p_reply_to AND party_id=p_party_id) THEN RAISE EXCEPTION 'invalid reply'; END IF;
 check_result:=public.rt_safety_check_message(p_body);
 IF NOT coalesce((check_result->>'ok')::boolean,false) THEN RAISE EXCEPTION 'message rejected'; END IF;
 INSERT INTO public.party_chat_messages(party_id,sender_id,client_message_id,body,safe_body,original_body,status,reply_to_message_id,moderation_state,risk_score,moderation_snapshot)
 VALUES(p_party_id,uid,p_client_message_id,p_body,check_result->>'safeBody',p_body,CASE WHEN check_result->>'state'='held' THEN 'held' ELSE 'sent' END,p_reply_to,coalesce((check_result->>'state')::public.message_moderation_state,'allowed'),coalesce((check_result->>'risk')::integer,0),check_result)
 ON CONFLICT(party_id,sender_id,client_message_id) DO UPDATE SET client_message_id=EXCLUDED.client_message_id
 RETURNING id INTO mid;
 RETURN jsonb_build_object('ok',true,'messageId',mid);
END; $$;
CREATE OR REPLACE FUNCTION public.get_party_chat_messages(p_party_id uuid, p_limit integer DEFAULT 50, p_before timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF public.rt_active_party_id(auth.uid()) IS DISTINCT FROM p_party_id THEN RAISE EXCEPTION 'not a party member'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at),'[]'::jsonb) FROM (SELECT * FROM public.party_chat_messages WHERE party_id=p_party_id AND (p_before IS NULL OR created_at<p_before) AND status<>'deleted' ORDER BY created_at DESC LIMIT greatest(1,least(coalesce(p_limit,50),100))) x);
END; $$;
CREATE OR REPLACE FUNCTION public.mark_party_chat_read(p_party_id uuid, p_message_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid();
BEGIN IF public.rt_active_party_id(uid) IS DISTINCT FROM p_party_id THEN RAISE EXCEPTION 'not a party member'; END IF;
 IF p_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.party_chat_messages WHERE id=p_message_id AND party_id=p_party_id) THEN RAISE EXCEPTION 'invalid message'; END IF;
 INSERT INTO public.party_message_reads(party_id,player_id,last_read_at,last_message_id) VALUES(p_party_id,uid,now(),p_message_id) ON CONFLICT(party_id,player_id) DO UPDATE SET last_read_at=EXCLUDED.last_read_at,last_message_id=coalesce(EXCLUDED.last_message_id,party_message_reads.last_message_id);
 RETURN jsonb_build_object('ok',true); END; $$;
CREATE OR REPLACE FUNCTION public.get_party_unread_count()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('count',count(*)) FROM public.party_chat_messages c WHERE c.party_id=public.rt_active_party_id(auth.uid()) AND c.sender_id<>auth.uid() AND c.status='sent' AND c.created_at>coalesce((SELECT last_read_at FROM public.party_message_reads WHERE party_id=c.party_id AND player_id=auth.uid()),'-infinity'::timestamptz);
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_party_presence(p_district_id text DEFAULT NULL, p_activity_type text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid); ready public.party_ready_state;
BEGIN IF pid IS NULL THEN RAISE EXCEPTION 'not in party'; END IF;
 SELECT ready_state INTO ready FROM public.party_members WHERE party_id=pid AND player_id=uid;
 INSERT INTO public.party_presence_state(party_id,player_id,status,district_id,activity_type,ready_state,last_heartbeat_at,updated_at) VALUES(pid,uid,'online',nullif(left(trim(p_district_id),80),''),nullif(left(trim(p_activity_type),80),''),ready,now(),now())
 ON CONFLICT(party_id,player_id) DO UPDATE SET status='online',district_id=EXCLUDED.district_id,activity_type=EXCLUDED.activity_type,ready_state=EXCLUDED.ready_state,last_heartbeat_at=now(),updated_at=now();
 UPDATE public.party_members SET last_active_at=now() WHERE party_id=pid AND player_id=uid;
 RETURN jsonb_build_object('ok',true); END; $$;
CREATE OR REPLACE FUNCTION public.get_party_presence(p_party_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF public.rt_active_party_id(auth.uid()) IS DISTINCT FROM p_party_id THEN RAISE EXCEPTION 'not a party member'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('playerId',s.player_id,'status',s.status,'districtId',CASE WHEN coalesce(pref.show_location,false) THEN s.district_id END,'activityType',CASE WHEN coalesce(pref.show_activity,true) THEN s.activity_type END,'readyState',s.ready_state,'lastHeartbeatAt',s.last_heartbeat_at)),'[]'::jsonb)
 FROM public.party_presence_state s LEFT JOIN public.presence_preferences pref ON pref.player_id=s.player_id WHERE s.party_id=p_party_id AND s.last_heartbeat_at>now()-interval '5 minutes'); END; $$;

CREATE OR REPLACE FUNCTION public.start_party_shared_mission(p_mission_definition_id text, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid); d public.party_mission_definitions; mid uuid; key text:=coalesce(nullif(p_idempotency_key,''),'start:'||uid::text||':'||p_mission_definition_id);
BEGIN
 IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'manage') THEN RAISE EXCEPTION 'party permission denied'; END IF;
 SELECT * INTO d FROM public.party_mission_definitions WHERE id=p_mission_definition_id AND active;
 IF NOT FOUND OR public.rt_party_member_count(pid)<d.min_party_size THEN RAISE EXCEPTION 'mission unavailable'; END IF;
 INSERT INTO public.party_shared_missions(party_id,mission_definition_id,rules_version,started_by,join_cutoff_at,expires_at,progress_target,idempotency_key) VALUES(pid,d.id,d.rules_version,uid,now()+make_interval(mins=>d.join_cutoff_minutes),now()+make_interval(mins=>d.duration_minutes),d.progress_target,key)
 ON CONFLICT(party_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id INTO mid;
 INSERT INTO public.party_mission_members(party_shared_mission_id,player_id,party_member_id) SELECT mid,m.player_id,m.id FROM public.party_members m WHERE m.party_id=pid AND m.status='active' AND m.left_at IS NULL AND now()<=coalesce((SELECT join_cutoff_at FROM public.party_shared_missions WHERE id=mid),now()) ON CONFLICT DO NOTHING;
 PERFORM public.rt_party_activity(pid,'shared_mission_started',uid,jsonb_build_object('missionId',mid,'definitionId',d.id));
 RETURN jsonb_build_object('ok',true,'missionId',mid); END; $$;

CREATE OR REPLACE FUNCTION public.record_party_mission_contribution(p_mission_id uuid, p_contribution_type text, p_evidence_hash text, p_action_receipt_id uuid DEFAULT NULL, p_value integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); m public.party_shared_missions; d public.party_mission_definitions; c uuid; new_progress integer;
BEGIN
 SELECT sm.* INTO m FROM public.party_shared_missions sm WHERE sm.id=p_mission_id FOR UPDATE;
 IF uid IS NULL OR m.status<>'active' OR m.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM public.party_mission_members mm WHERE mm.party_shared_mission_id=m.id AND mm.player_id=uid AND mm.left_at IS NULL AND mm.eligibility_status IN ('eligible','pending')) THEN RAISE EXCEPTION 'contribution unavailable'; END IF;
 SELECT * INTO d FROM public.party_mission_definitions WHERE id=m.mission_definition_id;
 IF nullif(trim(p_evidence_hash),'') IS NULL OR p_value<1 OR p_value>100 THEN RAISE EXCEPTION 'invalid contribution'; END IF;
 IF p_action_receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.gameplay_action_receipts WHERE id=p_action_receipt_id AND player_id=uid AND status='accepted') THEN RAISE EXCEPTION 'invalid action receipt'; END IF;
 IF d.id='test-town-tour-2026' AND d.metadata ? 'landmarks' AND NOT (d.metadata->'landmarks' ? p_contribution_type) THEN RAISE EXCEPTION 'invalid landmark'; END IF;
 INSERT INTO public.party_mission_contributions(party_shared_mission_id,player_id,action_receipt_id,contribution_type,contribution_value,evidence_hash) VALUES(m.id,uid,p_action_receipt_id,trim(p_contribution_type),p_value,trim(p_evidence_hash)) RETURNING id INTO c;
 UPDATE public.party_mission_members SET contribution_value=contribution_value+p_value,contribution_status='contributed',minimum_contribution_met=(contribution_value+p_value)>=d.min_contribution_per_member,updated_at=now() WHERE party_shared_mission_id=m.id AND player_id=uid;
 SELECT least(m.progress_target,CASE WHEN d.contribution_method='unique_member_actions' THEN count(DISTINCT evidence_hash)::integer ELSE least(m.progress_target,coalesce(sum(contribution_value),0)::integer) END) INTO new_progress FROM public.party_mission_contributions WHERE party_shared_mission_id=m.id AND status='accepted';
 UPDATE public.party_shared_missions SET progress_value=new_progress,updated_at=now() WHERE id=m.id;
 RETURN jsonb_build_object('ok',true,'contributionId',c,'progressValue',new_progress,'progressTarget',m.progress_target);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'duplicate contribution'; END; $$;

CREATE OR REPLACE FUNCTION public.evaluate_party_shared_mission(p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.party_shared_missions; d public.party_mission_definitions; contributors integer; members integer; review boolean:=false;
BEGIN
 SELECT * INTO m FROM public.party_shared_missions WHERE id=p_mission_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'mission not found'; END IF;
 IF auth.uid() IS NOT NULL AND public.rt_active_party_id(auth.uid()) IS DISTINCT FROM m.party_id THEN RAISE EXCEPTION 'not a party member'; END IF;
 SELECT * INTO d FROM public.party_mission_definitions WHERE id=m.mission_definition_id;
 SELECT count(*),count(*) FILTER (WHERE contribution_value>0) INTO members,contributors FROM public.party_mission_members WHERE party_shared_mission_id=m.id AND left_at IS NULL AND eligibility_status='eligible';
 review := (members>=2 AND contributors<=1 AND d.min_contribution_per_member>0) OR (m.progress_target>=4 AND now()-m.started_at<interval '30 seconds' AND m.progress_value>=m.progress_target);
 IF review THEN UPDATE public.party_shared_missions SET status='under_review',risk_outcome='review',updated_at=now() WHERE id=m.id AND status='active'; END IF;
 RETURN jsonb_build_object('ok',true,'complete',m.progress_value>=m.progress_target,'underReview',review,'eligibleContributors',contributors);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_party_shared_mission(p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); m public.party_shared_missions; d public.party_mission_definitions; eligible integer; each_xp integer; each_rep integer; each_rug integer; evaluation jsonb;
BEGIN
 SELECT sm.* INTO m FROM public.party_shared_missions sm WHERE sm.id=p_mission_id FOR UPDATE;
 IF uid IS NULL OR NOT public.rt_party_has_permission(m.party_id,uid,'manage') THEN RAISE EXCEPTION 'party permission denied'; END IF;
 evaluation:=public.evaluate_party_shared_mission(m.id); SELECT * INTO m FROM public.party_shared_missions WHERE id=m.id;
 IF m.status='under_review' OR (evaluation->>'underReview')::boolean THEN UPDATE public.party_shared_missions SET risk_outcome='reward_held',status='under_review' WHERE id=m.id; RETURN jsonb_build_object('ok',true,'status','under_review','rewardsHeld',true); END IF;
 IF m.status<>'active' OR m.progress_value<m.progress_target THEN RAISE EXCEPTION 'mission not complete'; END IF;
 SELECT * INTO d FROM public.party_mission_definitions WHERE id=m.mission_definition_id;
 UPDATE public.party_mission_members SET eligibility_status=CASE WHEN contribution_value>=d.min_contribution_per_member AND left_at IS NULL THEN 'eligible' ELSE 'ineligible' END,reward_status=CASE WHEN contribution_value>=d.min_contribution_per_member AND left_at IS NULL THEN 'claimable' ELSE 'forfeited' END,updated_at=now() WHERE party_shared_mission_id=m.id;
 SELECT count(*) INTO eligible FROM public.party_mission_members WHERE party_shared_mission_id=m.id AND eligibility_status='eligible';
 IF eligible=0 THEN UPDATE public.party_shared_missions SET status='under_review',risk_outcome='reward_held',updated_at=now() WHERE id=m.id; RETURN jsonb_build_object('ok',true,'status','under_review','rewardsHeld',true); END IF;
 each_xp:=d.reward_xp/eligible; each_rep:=d.reward_rep/eligible; each_rug:=d.reward_rug/eligible;
 INSERT INTO public.party_reward_allocations(party_shared_mission_id,player_id,asset_type,amount,allocation_method,contribution_score,eligibility_status,status,idempotency_key)
 SELECT m.id,mm.player_id,'XP',each_xp,'equal_eligible',mm.contribution_value,'eligible','claimable','party:'||m.id::text||':'||mm.player_id::text||':XP' FROM public.party_mission_members mm WHERE mm.party_shared_mission_id=m.id AND mm.eligibility_status='eligible' AND each_xp>0
 ON CONFLICT(party_shared_mission_id,player_id,asset_type) DO NOTHING;
 INSERT INTO public.party_reward_allocations(party_shared_mission_id,player_id,asset_type,amount,allocation_method,contribution_score,eligibility_status,status,idempotency_key)
 SELECT m.id,mm.player_id,'REP',each_rep,'equal_eligible',mm.contribution_value,'eligible','claimable','party:'||m.id::text||':'||mm.player_id::text||':REP' FROM public.party_mission_members mm WHERE mm.party_shared_mission_id=m.id AND mm.eligibility_status='eligible' AND each_rep>0 ON CONFLICT DO NOTHING;
 INSERT INTO public.party_reward_allocations(party_shared_mission_id,player_id,asset_type,amount,allocation_method,contribution_score,eligibility_status,status,idempotency_key)
 SELECT m.id,mm.player_id,'RUG_POINTS',each_rug,'equal_eligible',mm.contribution_value,'eligible','claimable','party:'||m.id::text||':'||mm.player_id::text||':RUG' FROM public.party_mission_members mm WHERE mm.party_shared_mission_id=m.id AND mm.eligibility_status='eligible' AND each_rug>0 ON CONFLICT DO NOTHING;
 UPDATE public.party_shared_missions SET status='completed',completed_at=now(),updated_at=now() WHERE id=m.id;
 RETURN jsonb_build_object('ok',true,'status','completed','eligibleMembers',eligible); END; $$;

CREATE OR REPLACE FUNCTION public.get_party_shared_mission_state(p_mission_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid:=public.rt_active_party_id(auth.uid()); mid uuid:=p_mission_id;
BEGIN IF pid IS NULL THEN RAISE EXCEPTION 'not in party'; END IF; IF mid IS NULL THEN SELECT id INTO mid FROM public.party_shared_missions WHERE party_id=pid AND status='active' ORDER BY started_at DESC LIMIT 1; END IF;
 RETURN coalesce((SELECT jsonb_build_object('mission',to_jsonb(m),'members',(SELECT coalesce(jsonb_agg(to_jsonb(mm)),'[]'::jsonb) FROM public.party_mission_members mm WHERE mm.party_shared_mission_id=m.id),'contributions',(SELECT count(*) FROM public.party_mission_contributions c WHERE c.party_shared_mission_id=m.id)) FROM public.party_shared_missions m WHERE m.id=mid AND m.party_id=pid),'null'::jsonb); END; $$;
CREATE OR REPLACE FUNCTION public.claim_party_reward(p_allocation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); a public.party_reward_allocations; ledger uuid;
BEGIN SELECT * INTO a FROM public.party_reward_allocations WHERE id=p_allocation_id FOR UPDATE;
 IF uid IS NULL OR a.player_id IS DISTINCT FROM uid OR a.status<>'claimable' OR a.amount<=0 THEN RAISE EXCEPTION 'reward unavailable'; END IF;
 PERFORM public.rt_set_mutation_flag();
 INSERT INTO public.player_progression(player_id) VALUES(uid) ON CONFLICT(player_id) DO NOTHING;
 INSERT INTO public.reward_ledger(player_id,reward_type,amount,reason,source_type,source_id,idempotency_key,metadata) VALUES(uid,a.asset_type,a.amount,'party_shared_mission','party_shared_mission',a.party_shared_mission_id::text,'claim:'||a.id::text,jsonb_build_object('allocationId',a.id)) ON CONFLICT(player_id,idempotency_key) DO NOTHING RETURNING id INTO ledger;
 UPDATE public.player_progression SET lifetime_xp=lifetime_xp+CASE WHEN a.asset_type='XP' THEN a.amount ELSE 0 END,rep=rep+CASE WHEN a.asset_type='REP' THEN a.amount ELSE 0 END,rug_points=rug_points+CASE WHEN a.asset_type='RUG_POINTS' THEN a.amount ELSE 0 END,updated_at=now() WHERE player_id=uid;
 UPDATE public.party_reward_allocations SET status='claimed',finalized_at=now() WHERE id=a.id;
 INSERT INTO public.party_reward_claims(allocation_id,player_id,reward_ledger_id) VALUES(a.id,uid,ledger) ON CONFLICT(allocation_id) DO NOTHING;
 RETURN jsonb_build_object('ok',true,'allocationId',a.id); END; $$;

CREATE OR REPLACE FUNCTION public.queue_party(p_queue_slug text DEFAULT 'test-party-activity-queue')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid); q public.party_matchmaking_queues; eid uuid; size integer;
BEGIN IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'manage') THEN RAISE EXCEPTION 'party permission denied'; END IF;
 SELECT * INTO q FROM public.party_matchmaking_queues WHERE slug=p_queue_slug AND status='active' AND is_test; IF NOT FOUND THEN RAISE EXCEPTION 'queue unavailable'; END IF;
 size:=public.rt_party_member_count(pid); IF size<q.minimum_party_size OR size>q.maximum_party_size THEN RAISE EXCEPTION 'invalid party size'; END IF;
 INSERT INTO public.party_matchmaking_entries(queue_id,party_id,queued_by,party_size,rules_version,idempotency_key,region) VALUES(q.id,pid,uid,size,q.rules_version,'queue:'||q.id::text||':'||pid::text,(SELECT region FROM public.parties WHERE id=pid)) ON CONFLICT(party_id) WHERE status IN ('queued','matching') DO UPDATE SET last_heartbeat_at=now() RETURNING id INTO eid;
 UPDATE public.parties SET status='queued',updated_at=now() WHERE id=pid; RETURN jsonb_build_object('ok',true,'entryId',eid); END; $$;
CREATE OR REPLACE FUNCTION public.cancel_party_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid); BEGIN IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'manage') THEN RAISE EXCEPTION 'party permission denied'; END IF; UPDATE public.party_matchmaking_entries SET status='cancelled',cancelled_at=now() WHERE party_id=pid AND status IN ('queued','matching'); UPDATE public.parties SET status='active',updated_at=now() WHERE id=pid AND status='queued'; RETURN jsonb_build_object('ok',true); END; $$;
CREATE OR REPLACE FUNCTION public.heartbeat_party_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid:=public.rt_active_party_id(uid); BEGIN IF pid IS NULL OR NOT public.rt_party_has_permission(pid,uid,'manage') THEN RAISE EXCEPTION 'party permission denied'; END IF; UPDATE public.party_matchmaking_entries SET last_heartbeat_at=now() WHERE party_id=pid AND status='queued'; RETURN jsonb_build_object('ok',true); END; $$;
CREATE OR REPLACE FUNCTION public.process_party_matchmaking(p_queue_slug text DEFAULT 'test-party-activity-queue', p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.party_matchmaking_queues; l uuid; ids uuid[];
BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; SELECT * INTO q FROM public.party_matchmaking_queues WHERE slug=p_queue_slug AND status='active' AND is_test; IF NOT FOUND THEN RAISE EXCEPTION 'queue unavailable'; END IF;
 WITH chosen AS (SELECT id FROM public.party_matchmaking_entries WHERE queue_id=q.id AND status='queued' AND last_heartbeat_at>now()-interval '2 minutes' ORDER BY priority DESC,queued_at LIMIT least(q.target_lobby_size,greatest(2,least(p_limit,50))) FOR UPDATE SKIP LOCKED) SELECT array_agg(id) INTO ids FROM chosen;
 IF coalesce(array_length(ids,1),0)<2 THEN RETURN jsonb_build_object('ok',true,'matched',0); END IF;
 INSERT INTO public.matchmaking_lobbies(queue_id,rules_version,is_test) VALUES(q.id,q.rules_version,true) RETURNING id INTO l;
 INSERT INTO public.matchmaking_lobby_members(lobby_id,party_id,entry_id) SELECT l,e.party_id,e.id FROM public.party_matchmaking_entries e WHERE e.id=ANY(ids);
 UPDATE public.party_matchmaking_entries SET status='matched',matched_at=now() WHERE id=ANY(ids);
 UPDATE public.parties SET status='in_activity',updated_at=now() WHERE id IN (SELECT party_id FROM public.party_matchmaking_entries WHERE id=ANY(ids));
 RETURN jsonb_build_object('ok',true,'matched',array_length(ids,1),'lobbyId',l); END; $$;

CREATE OR REPLACE FUNCTION public.report_party(p_party_id uuid, p_category text, p_description text DEFAULT NULL, p_reported_player_id uuid DEFAULT NULL, p_message_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); rid uuid;
BEGIN IF uid IS NULL OR nullif(trim(p_category),'') IS NULL OR char_length(coalesce(p_description,''))>1000 THEN RAISE EXCEPTION 'invalid report'; END IF;
 IF p_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.party_chat_messages WHERE id=p_message_id AND party_id=p_party_id) THEN RAISE EXCEPTION 'invalid message'; END IF;
 INSERT INTO public.party_reports(reporter_id,party_id,reported_player_id,message_id,category,description,evidence_snapshot) VALUES(uid,p_party_id,p_reported_player_id,p_message_id,trim(p_category),nullif(trim(p_description),''),jsonb_build_object('reportedAt',now())) RETURNING id INTO rid;
 RETURN jsonb_build_object('ok',true,'reportId',rid); END; $$;
CREATE OR REPLACE FUNCTION public.get_party_ops_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF;
 RETURN jsonb_build_object('activeParties',(SELECT count(*) FROM public.parties WHERE status='active'),'queuedParties',(SELECT count(*) FROM public.party_matchmaking_entries WHERE status='queued'),'openReports',(SELECT count(*) FROM public.party_reports WHERE status='open'),'openAlerts',(SELECT count(*) FROM public.party_operational_alerts WHERE status='open'),'underReviewMissions',(SELECT count(*) FROM public.party_shared_missions WHERE status='under_review')); END; $$;

CREATE OR REPLACE FUNCTION public.reconcile_party_leadership(p_party_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_id uuid;
BEGIN IF NOT public.rt_is_social_operator('moderator') AND public.rt_active_party_id(auth.uid()) IS DISTINCT FROM p_party_id THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF EXISTS(SELECT 1 FROM public.party_members WHERE party_id=p_party_id AND role='leader' AND status='active' AND left_at IS NULL) THEN RETURN jsonb_build_object('ok',true,'changed',false); END IF;
 SELECT player_id INTO next_id FROM public.party_members WHERE party_id=p_party_id AND status='active' AND left_at IS NULL ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END,joined_at LIMIT 1;
 IF next_id IS NULL THEN UPDATE public.parties SET status='disbanded',disbanded_at=coalesce(disbanded_at,now()),updated_at=now() WHERE id=p_party_id AND status<>'disbanded'; ELSE UPDATE public.party_members SET role='leader' WHERE party_id=p_party_id AND player_id=next_id; UPDATE public.parties SET leader_id=next_id,updated_at=now() WHERE id=p_party_id; END IF;
 RETURN jsonb_build_object('ok',true,'changed',true,'leaderId',next_id); END; $$;
CREATE OR REPLACE FUNCTION public.reconcile_party_membership(p_party_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN IF NOT public.rt_is_social_operator('moderator') AND public.rt_active_party_id(auth.uid()) IS DISTINCT FROM p_party_id THEN RAISE EXCEPTION 'permission denied'; END IF;
 UPDATE public.party_mission_members mm SET left_at=now(),eligibility_status='ineligible',updated_at=now() WHERE mm.party_shared_mission_id IN (SELECT id FROM public.party_shared_missions WHERE party_id=p_party_id AND status='active') AND mm.left_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.party_members pm WHERE pm.party_id=p_party_id AND pm.player_id=mm.player_id AND pm.status='active' AND pm.left_at IS NULL); GET DIAGNOSTICS changed=ROW_COUNT;
 PERFORM public.reconcile_party_leadership(p_party_id); RETURN jsonb_build_object('ok',true,'updated',changed); END; $$;
CREATE OR REPLACE FUNCTION public.reconcile_party_block_state(p_party_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); pid uuid; removed integer:=0; pair record; victim uuid;
BEGIN
 FOR pid IN SELECT id FROM public.parties WHERE status IN ('active','queued','in_activity') AND (p_party_id IS NULL OR id=p_party_id) AND (public.rt_is_social_operator('moderator') OR EXISTS(SELECT 1 FROM public.party_members x WHERE x.party_id=parties.id AND x.player_id=uid AND x.status='active' AND x.left_at IS NULL)) LOOP
   FOR pair IN SELECT a.player_id a_id,b.player_id b_id FROM public.party_members a JOIN public.party_members b ON a.party_id=b.party_id AND a.player_id<b.player_id WHERE a.party_id=pid AND a.status='active' AND b.status='active' AND a.left_at IS NULL AND b.left_at IS NULL AND public.rt_is_blocked(a.player_id,b.player_id) LOOP
     SELECT CASE WHEN EXISTS(SELECT 1 FROM public.player_blocks WHERE blocker_id=pair.a_id AND blocked_id=pair.b_id AND unblocked_at IS NULL) THEN pair.b_id ELSE pair.a_id END INTO victim;
     UPDATE public.party_members SET status='removed',removed_at=now(),removed_by=uid,ready_state='not_ready' WHERE party_id=pid AND player_id=victim AND status='active'; removed:=removed+1;
   END LOOP;
   PERFORM public.reconcile_party_leadership(pid);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'removed',removed); END; $$;
CREATE OR REPLACE FUNCTION public.run_party_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer:=0; pid uuid;
BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF;
 INSERT INTO public.party_maintenance_runs(job_name) VALUES('run_party_maintenance');
 UPDATE public.party_invitations SET status='expired',responded_at=now() WHERE status='pending' AND expires_at<=now(); GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.party_join_requests SET status='expired',responded_at=now() WHERE status='pending' AND expires_at<=now();
 UPDATE public.party_presence_state SET status='offline',updated_at=now() WHERE status='online' AND last_heartbeat_at<now()-interval '5 minutes';
 UPDATE public.party_members SET ready_state='not_ready' WHERE ready_state='ready' AND last_active_at<now()-interval '10 minutes';
 UPDATE public.party_matchmaking_entries SET status='expired',cancelled_at=now() WHERE status IN ('queued','matching') AND last_heartbeat_at<now()-interval '2 minutes';
 UPDATE public.party_shared_missions SET status='expired',failed_at=now(),updated_at=now() WHERE status='active' AND expires_at<=now();
 UPDATE public.party_operational_alerts SET status='closed',last_seen_at=now() WHERE status='open' AND last_seen_at<now()-interval '7 days';
 FOR pid IN SELECT id FROM public.parties WHERE status IN ('active','queued','in_activity') LOOP PERFORM public.reconcile_party_leadership(pid); PERFORM public.reconcile_party_membership(pid); END LOOP;
 UPDATE public.party_maintenance_runs SET status='completed',completed_at=now(),rows_processed=n WHERE id=(SELECT id FROM public.party_maintenance_runs WHERE job_name='run_party_maintenance' ORDER BY started_at DESC LIMIT 1);
 RETURN jsonb_build_object('ok',true,'expiredInvitations',n); END; $$;

REVOKE ALL ON FUNCTION public.send_party_chat_message(uuid,text,text,uuid), public.get_party_chat_messages(uuid,integer,timestamptz), public.mark_party_chat_read(uuid,uuid), public.get_party_unread_count(), public.heartbeat_party_presence(text,text), public.get_party_presence(uuid), public.start_party_shared_mission(text,text), public.record_party_mission_contribution(uuid,text,text,uuid,integer), public.evaluate_party_shared_mission(uuid), public.complete_party_shared_mission(uuid), public.get_party_shared_mission_state(uuid), public.claim_party_reward(uuid), public.queue_party(text), public.cancel_party_queue(), public.heartbeat_party_queue(), public.process_party_matchmaking(text,integer), public.report_party(uuid,text,text,uuid,uuid), public.get_party_ops_dashboard(), public.run_party_maintenance(), public.reconcile_party_block_state(uuid), public.reconcile_party_leadership(uuid), public.reconcile_party_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_party_chat_message(uuid,text,text,uuid), public.get_party_chat_messages(uuid,integer,timestamptz), public.mark_party_chat_read(uuid,uuid), public.get_party_unread_count(), public.heartbeat_party_presence(text,text), public.get_party_presence(uuid), public.start_party_shared_mission(text,text), public.record_party_mission_contribution(uuid,text,text,uuid,integer), public.evaluate_party_shared_mission(uuid), public.complete_party_shared_mission(uuid), public.get_party_shared_mission_state(uuid), public.claim_party_reward(uuid), public.queue_party(text), public.cancel_party_queue(), public.heartbeat_party_queue(), public.report_party(uuid,text,text,uuid,uuid), public.reconcile_party_block_state(uuid), public.reconcile_party_leadership(uuid), public.reconcile_party_membership(uuid) TO authenticated;

COMMENT ON TABLE public.parties IS 'Phase 10K parties. Browser never inserts membership.';

-- Patch block_player (after 10J) to reconcile party membership on block
CREATE OR REPLACE FUNCTION public.block_player(p_blocked_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF uid = p_blocked_id THEN RAISE EXCEPTION 'cannot block yourself'; END IF;

  INSERT INTO public.player_blocks (blocker_id, blocked_id, reason_category)
  VALUES (uid, p_blocked_id, p_reason)
  ON CONFLICT (blocker_id, blocked_id) WHERE unblocked_at IS NULL DO NOTHING;

  UPDATE public.friendships SET status = 'blocked', ended_at = now(), ended_by = uid
  WHERE status = 'active'
    AND player_low_id = LEAST(uid, p_blocked_id) AND player_high_id = GREATEST(uid, p_blocked_id);

  UPDATE public.friend_requests SET status = 'blocked', responded_at = now()
  WHERE status = 'pending'
    AND ((sender_id = uid AND recipient_id = p_blocked_id) OR (sender_id = p_blocked_id AND recipient_id = uid));

  UPDATE public.conversation_threads SET status = 'restricted', updated_at = now()
  WHERE type = 'direct' AND pair_low_id = LEAST(uid, p_blocked_id) AND pair_high_id = GREATEST(uid, p_blocked_id);

  PERFORM public.rt_social_audit(uid, p_blocked_id, 'player_blocked', 'block', NULL);
  PERFORM public.rt_social_analytics(uid, 'block_created', 'block', p_blocked_id::text);
  PERFORM public.reconcile_party_block_state();
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.block_player(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_player(uuid,text) TO authenticated;

COMMIT;


-- ===== END database/migrations/20260716_phase10k_parties_shared_missions_matchmaking.sql =====



-- ===== BEGIN database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql =====

-- RugTown Phase 10L: characters, world events, tournaments and guilds.
-- Additive on 10G–10K. All rewards are in-game only; no SOL/SPL.
BEGIN;

-- ============================================================================
-- 1 Characters
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.character_cosmetic_definitions (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_:-]{3,80}$'),
  name text NOT NULL, slot text NOT NULL CHECK (slot IN ('base','hair','outfit','hat','glasses','badge')),
  rarity text NOT NULL DEFAULT 'common', status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','retired')), metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.player_character_cosmetics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL REFERENCES public.character_cosmetic_definitions(id), source_type text NOT NULL DEFAULT 'default',
  source_id text, granted_by uuid REFERENCES public.profiles(id), granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, revoke_reason text, UNIQUE(player_id, cosmetic_id)
);
CREATE TABLE IF NOT EXISTS public.player_character_loadouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default' CHECK (char_length(trim(name)) BETWEEN 1 AND 32),
  slots jsonb NOT NULL DEFAULT '{}'::jsonb, is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_character_active_loadout ON public.player_character_loadouts(player_id) WHERE is_active;
CREATE TABLE IF NOT EXISTS public.character_loadout_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loadout_id uuid REFERENCES public.player_character_loadouts(id) ON DELETE SET NULL,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, actor_id uuid REFERENCES public.profiles(id),
  action_type text NOT NULL, before_slots jsonb, after_slots jsonb, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.character_cosmetic_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL REFERENCES public.character_cosmetic_definitions(id), source_type text NOT NULL,
  source_id text, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  granted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, UNIQUE(player_id, cosmetic_id, source_type, source_id)
);
ALTER TABLE public.character_cosmetic_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_character_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_character_loadouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_loadout_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_cosmetic_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "character cosmetics owner read" ON public.player_character_cosmetics;
CREATE POLICY "character cosmetics owner read" ON public.player_character_cosmetics FOR SELECT USING (player_id=auth.uid());
DROP POLICY IF EXISTS "character loadouts owner read" ON public.player_character_loadouts;
CREATE POLICY "character loadouts owner read" ON public.player_character_loadouts FOR SELECT USING (player_id=auth.uid());
DROP POLICY IF EXISTS "character history owner read" ON public.character_loadout_history;
CREATE POLICY "character history owner read" ON public.character_loadout_history FOR SELECT USING (player_id=auth.uid());
DROP POLICY IF EXISTS "cosmetic catalog public read" ON public.character_cosmetic_definitions;
CREATE POLICY "cosmetic catalog public read" ON public.character_cosmetic_definitions FOR SELECT USING (status='active');

CREATE OR REPLACE FUNCTION public.rt_ensure_default_character_cosmetics(p_player uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.player_character_cosmetics(player_id,cosmetic_id,source_type)
  SELECT p_player,id,'default' FROM public.character_cosmetic_definitions
  WHERE id IN ('base_default','hair_short','hair_long','outfit_starter_dark','outfit_market_apron','hat_beanie','glasses_round')
    AND status='active'
  ON CONFLICT(player_id,cosmetic_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.player_character_loadouts WHERE player_id = p_player AND is_active
  ) THEN
    INSERT INTO public.player_character_loadouts(player_id,name,slots)
    VALUES(p_player,'Default','{"base":"base_default","hair":"hair_short","outfit":"outfit_starter_dark"}');
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_my_character_cosmetics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 PERFORM public.rt_ensure_default_character_cosmetics(uid);
 RETURN jsonb_build_object('cosmetics',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'slot',d.slot,'rarity',d.rarity,'grantedAt',c.granted_at) ORDER BY d.slot,d.id) FROM public.player_character_cosmetics c JOIN public.character_cosmetic_definitions d ON d.id=c.cosmetic_id WHERE c.player_id=uid AND c.revoked_at IS NULL),'[]'::jsonb)); END $$;
CREATE OR REPLACE FUNCTION public.get_my_character_loadout()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF; PERFORM public.rt_ensure_default_character_cosmetics(uid);
 RETURN coalesce((SELECT to_jsonb(l) FROM public.player_character_loadouts l WHERE l.player_id=uid AND l.is_active),'null'::jsonb); END $$;
CREATE OR REPLACE FUNCTION public.update_character_loadout(p_slots jsonb, p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); l public.player_character_loadouts; key text; cid text;
BEGIN
 IF uid IS NULL OR public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'character update unavailable'; END IF;
 IF jsonb_typeof(p_slots)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each_text(p_slots) x WHERE x.key NOT IN ('base','hair','outfit','hat','glasses','badge') OR x.value !~ '^[a-z0-9_:-]{3,80}$') THEN RAISE EXCEPTION 'invalid cosmetic ids'; END IF;
 PERFORM public.rt_ensure_default_character_cosmetics(uid);
 FOR key,cid IN SELECT key,value FROM jsonb_each_text(p_slots) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.player_character_cosmetics c JOIN public.character_cosmetic_definitions d ON d.id=c.cosmetic_id WHERE c.player_id=uid AND c.cosmetic_id=cid AND c.revoked_at IS NULL AND d.slot=key AND d.status='active') THEN RAISE EXCEPTION 'cosmetic not owned or invalid slot'; END IF;
 END LOOP;
 SELECT * INTO l FROM public.player_character_loadouts WHERE player_id=uid AND is_active FOR UPDATE;
 UPDATE public.player_character_loadouts SET slots=p_slots,name=coalesce(nullif(left(trim(p_name),32),''),name),updated_at=now() WHERE id=l.id;
 INSERT INTO public.character_loadout_history(loadout_id,player_id,actor_id,action_type,before_slots,after_slots) VALUES(l.id,uid,uid,'updated',l.slots,p_slots);
 RETURN jsonb_build_object('ok',true,'loadoutId',l.id); END $$;
CREATE OR REPLACE FUNCTION public.get_public_character_loadout(p_player_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT jsonb_build_object('playerId',l.player_id,'slots',l.slots,'updatedAt',l.updated_at) FROM public.player_character_loadouts l WHERE l.player_id=p_player_id AND l.is_active),'null'::jsonb); $$;
CREATE OR REPLACE FUNCTION public.grant_character_cosmetic(p_player uuid,p_cosmetic text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.character_cosmetic_definitions WHERE id=p_cosmetic) THEN RAISE EXCEPTION 'unknown cosmetic'; END IF;
 INSERT INTO public.player_character_cosmetics(player_id,cosmetic_id,source_type,source_id,granted_by) VALUES(p_player,p_cosmetic,'operator',left(trim(p_reason),200),auth.uid()) ON CONFLICT(player_id,cosmetic_id) DO UPDATE SET revoked_at=NULL,revoke_reason=NULL,granted_at=now(),granted_by=auth.uid();
 INSERT INTO public.character_loadout_history(player_id,actor_id,action_type,reason) VALUES(p_player,auth.uid(),'cosmetic_granted',left(trim(p_reason),200)); RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.revoke_character_cosmetic(p_player uuid,p_cosmetic text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF;
 UPDATE public.player_character_cosmetics SET revoked_at=now(),revoke_reason=left(trim(p_reason),200) WHERE player_id=p_player AND cosmetic_id=p_cosmetic;
 INSERT INTO public.character_loadout_history(player_id,actor_id,action_type,reason) VALUES(p_player,auth.uid(),'cosmetic_revoked',left(trim(p_reason),200)); RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.reconcile_character_loadout(p_player uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.player_character_loadouts; clean jsonb:='{}'::jsonb; k text; v text; BEGIN
 IF p_player<>auth.uid() AND NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'permission denied'; END IF; PERFORM public.rt_ensure_default_character_cosmetics(p_player);
 SELECT * INTO l FROM public.player_character_loadouts WHERE player_id=p_player AND is_active FOR UPDATE;
 FOR k,v IN SELECT key,value FROM jsonb_each_text(l.slots) LOOP IF EXISTS(SELECT 1 FROM public.player_character_cosmetics WHERE player_id=p_player AND cosmetic_id=v AND revoked_at IS NULL) THEN clean:=clean||jsonb_build_object(k,v); END IF; END LOOP;
 UPDATE public.player_character_loadouts SET slots=clean,updated_at=now() WHERE id=l.id; RETURN jsonb_build_object('ok',true,'slots',clean); END $$;

-- ============================================================================
-- 2 World events
-- ============================================================================
DO $$ BEGIN CREATE TYPE public.world_event_status AS ENUM ('draft','scheduled','registration_open','active','evaluating','completed','cancelled','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.world_event_definitions(id text PRIMARY KEY CHECK(id~'^[a-z0-9-]{3,80}$'),name text NOT NULL,description text NOT NULL DEFAULT '',status public.world_event_status NOT NULL DEFAULT 'draft',is_test boolean NOT NULL DEFAULT true,reward_xp integer NOT NULL DEFAULT 0 CHECK(reward_xp>=0),reward_rep integer NOT NULL DEFAULT 0 CHECK(reward_rep>=0),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.world_event_schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),definition_id text NOT NULL REFERENCES public.world_event_definitions(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,registration_opens_at timestamptz NOT NULL DEFAULT now(),status public.world_event_status NOT NULL DEFAULT 'scheduled',UNIQUE(definition_id,starts_at),CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS public.world_event_instances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),definition_id text NOT NULL REFERENCES public.world_event_definitions(id),schedule_id uuid REFERENCES public.world_event_schedules(id),status public.world_event_status NOT NULL DEFAULT 'scheduled',starts_at timestamptz,ends_at timestamptz,evaluated_at timestamptz,created_by uuid REFERENCES public.profiles(id),metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS public.world_event_objectives(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.world_event_instances(id) ON DELETE CASCADE,objective_key text NOT NULL,goal integer NOT NULL CHECK(goal>0),progress integer NOT NULL DEFAULT 0,UNIQUE(instance_id,objective_key));
CREATE TABLE IF NOT EXISTS public.world_event_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.world_event_instances(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL DEFAULT 'registered' CHECK(status IN('registered','withdrawn','eligible','ineligible')),registered_at timestamptz NOT NULL DEFAULT now(),withdrawn_at timestamptz,UNIQUE(instance_id,player_id));
CREATE TABLE IF NOT EXISTS public.world_event_contributions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.world_event_instances(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),action_receipt_id uuid REFERENCES public.gameplay_action_receipts(id),objective_key text NOT NULL,value integer NOT NULL DEFAULT 1 CHECK(value>0),evidence_hash text NOT NULL,status text NOT NULL DEFAULT 'accepted',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(instance_id,evidence_hash),UNIQUE(instance_id,action_receipt_id));
CREATE TABLE IF NOT EXISTS public.world_event_reward_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.world_event_instances(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),asset_type text NOT NULL CHECK(asset_type IN('XP','REP','RUG_POINTS')),amount integer NOT NULL CHECK(amount>=0),status text NOT NULL DEFAULT 'claimable',idempotency_key text NOT NULL UNIQUE,UNIQUE(instance_id,player_id,asset_type));
CREATE TABLE IF NOT EXISTS public.world_event_reward_claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),allocation_id uuid NOT NULL UNIQUE REFERENCES public.world_event_reward_allocations(id),player_id uuid NOT NULL REFERENCES public.profiles(id),reward_ledger_id uuid,claimed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.world_event_announcements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid REFERENCES public.world_event_instances(id) ON DELETE CASCADE,title text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.world_event_activity_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid REFERENCES public.world_event_instances(id),actor_id uuid,event_type text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.world_event_analytics_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_type text NOT NULL,instance_id uuid,player_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.world_event_operational_alerts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL,status text NOT NULL DEFAULT 'open',message_safe text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.world_event_job_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_name text NOT NULL,status text NOT NULL DEFAULT 'running',started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
ALTER TABLE public.world_event_definitions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_schedules ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_instances ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_objectives ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_participants ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_contributions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_reward_allocations ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_reward_claims ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_announcements ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_activity_log ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_analytics_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_operational_alerts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.world_event_job_runs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.transition_world_event_state(p_instance uuid,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; IF p_state NOT IN ('scheduled','registration_open','active','evaluating','completed','cancelled','archived') THEN RAISE EXCEPTION 'invalid state'; END IF; UPDATE public.world_event_instances SET status=p_state::public.world_event_status,evaluated_at=CASE WHEN p_state='evaluating' THEN now() ELSE evaluated_at END WHERE id=p_instance; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.schedule_world_event(p_definition text,p_starts timestamptz,p_ends timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE sid uuid; iid uuid; BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; IF p_ends<=p_starts THEN RAISE EXCEPTION 'invalid schedule'; END IF; INSERT INTO public.world_event_schedules(definition_id,starts_at,ends_at,registration_opens_at) VALUES(p_definition,p_starts,p_ends,p_starts-interval '1 day') RETURNING id INTO sid; INSERT INTO public.world_event_instances(definition_id,schedule_id,starts_at,ends_at,status,created_by) VALUES(p_definition,sid,p_starts,p_ends,'scheduled',auth.uid()) RETURNING id INTO iid; RETURN jsonb_build_object('ok',true,'instanceId',iid); END $$;
CREATE OR REPLACE FUNCTION public.register_for_world_event(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); BEGIN IF uid IS NULL OR public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'registration unavailable'; END IF; IF NOT EXISTS(SELECT 1 FROM public.world_event_instances WHERE id=p_instance AND status IN('registration_open','active')) THEN RAISE EXCEPTION 'event unavailable'; END IF; INSERT INTO public.world_event_participants(instance_id,player_id) VALUES(p_instance,uid) ON CONFLICT(instance_id,player_id) DO UPDATE SET status='registered',withdrawn_at=NULL; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.withdraw_from_world_event(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE public.world_event_participants SET status='withdrawn',withdrawn_at=now() WHERE instance_id=p_instance AND player_id=auth.uid() AND status='registered'; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.get_my_world_event_registration(p_instance uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT to_jsonb(p) FROM public.world_event_participants p WHERE p.instance_id=p_instance AND p.player_id=auth.uid()),'null'::jsonb); $$;
CREATE OR REPLACE FUNCTION public.record_world_event_contribution(p_instance uuid,p_objective text,p_receipt uuid,p_evidence text,p_value integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); BEGIN IF uid IS NULL OR p_value<1 OR p_value>100 OR nullif(trim(p_evidence),'') IS NULL THEN RAISE EXCEPTION 'invalid contribution'; END IF; IF NOT EXISTS(SELECT 1 FROM public.world_event_participants WHERE instance_id=p_instance AND player_id=uid AND status='registered') OR NOT EXISTS(SELECT 1 FROM public.world_event_instances WHERE id=p_instance AND status='active') THEN RAISE EXCEPTION 'not eligible'; END IF; IF p_receipt IS NULL OR NOT EXISTS(SELECT 1 FROM public.gameplay_action_receipts WHERE id=p_receipt AND player_id=uid AND status='accepted') THEN RAISE EXCEPTION 'trusted receipt required'; END IF; INSERT INTO public.world_event_contributions(instance_id,player_id,action_receipt_id,objective_key,evidence_hash,value) VALUES(p_instance,uid,p_receipt,trim(p_objective),trim(p_evidence),p_value); UPDATE public.world_event_objectives SET progress=least(goal,progress+p_value) WHERE instance_id=p_instance AND objective_key=p_objective; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.evaluate_world_event_instance(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.world_event_instances; d public.world_event_definitions; BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; SELECT * INTO i FROM public.world_event_instances WHERE id=p_instance FOR UPDATE; SELECT * INTO d FROM public.world_event_definitions WHERE id=i.definition_id; INSERT INTO public.world_event_reward_allocations(instance_id,player_id,asset_type,amount,idempotency_key) SELECT i.id,p.player_id,'XP',d.reward_xp,'event:'||i.id||':'||p.player_id||':xp' FROM public.world_event_participants p WHERE p.instance_id=i.id AND p.status='registered' AND d.reward_xp>0 ON CONFLICT DO NOTHING; INSERT INTO public.world_event_reward_allocations(instance_id,player_id,asset_type,amount,idempotency_key) SELECT i.id,p.player_id,'REP',d.reward_rep,'event:'||i.id||':'||p.player_id||':rep' FROM public.world_event_participants p WHERE p.instance_id=i.id AND p.status='registered' AND d.reward_rep>0 ON CONFLICT DO NOTHING; UPDATE public.world_event_instances SET status='completed',evaluated_at=now() WHERE id=i.id; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.get_active_world_events() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.starts_at),'[]'::jsonb) FROM public.world_event_instances i WHERE i.status IN('registration_open','active'); $$;
CREATE OR REPLACE FUNCTION public.claim_world_event_reward(p_allocation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.world_event_reward_allocations; BEGIN SELECT * INTO a FROM public.world_event_reward_allocations WHERE id=p_allocation FOR UPDATE; IF a.player_id IS DISTINCT FROM auth.uid() OR a.status<>'claimable' THEN RAISE EXCEPTION 'reward unavailable'; END IF; PERFORM public.rt_set_mutation_flag(); INSERT INTO public.reward_ledger(player_id,reward_type,amount,reason,source_type,source_id,idempotency_key) VALUES(a.player_id,a.asset_type,a.amount,'World event reward','world_event',a.instance_id::text,'claim:'||a.id::text) ON CONFLICT(player_id,idempotency_key) DO NOTHING; UPDATE public.world_event_reward_allocations SET status='claimed' WHERE id=a.id; INSERT INTO public.world_event_reward_claims(allocation_id,player_id) VALUES(a.id,a.player_id) ON CONFLICT DO NOTHING; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.run_world_event_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; UPDATE public.world_event_instances SET status='registration_open' WHERE status='scheduled' AND starts_at-now()<=interval '1 day'; UPDATE public.world_event_instances SET status='active' WHERE status='registration_open' AND starts_at<=now(); UPDATE public.world_event_instances SET status='evaluating' WHERE status='active' AND ends_at<=now(); RETURN jsonb_build_object('ok',true); END $$;

-- ============================================================================
-- 3 Tournaments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tournament_definitions(id text PRIMARY KEY,name text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','archived')),is_test boolean NOT NULL DEFAULT true,rules jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.tournament_instances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),definition_id text NOT NULL REFERENCES public.tournament_definitions(id),status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','registration_open','active','finalized','cancelled')),starts_at timestamptz,ends_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.tournament_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.tournament_instances(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL DEFAULT 'registered',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(instance_id,player_id));
CREATE TABLE IF NOT EXISTS public.tournament_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.tournament_instances(id) ON DELETE CASCADE,round_number integer NOT NULL,status text NOT NULL DEFAULT 'pending',UNIQUE(instance_id,round_number));
CREATE TABLE IF NOT EXISTS public.tournament_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),action_receipt_id uuid REFERENCES public.gameplay_action_receipts(id),score integer NOT NULL CHECK(score>=0),status text NOT NULL DEFAULT 'accepted',UNIQUE(round_id,player_id),UNIQUE(action_receipt_id));
CREATE TABLE IF NOT EXISTS public.tournament_standings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.tournament_instances(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),score integer NOT NULL DEFAULT 0,rank integer,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(instance_id,player_id));
CREATE TABLE IF NOT EXISTS public.tournament_reward_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.tournament_instances(id),player_id uuid NOT NULL REFERENCES public.profiles(id),asset_type text NOT NULL CHECK(asset_type IN('XP','REP','RUG_POINTS','COSMETIC')),amount integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'claimable',idempotency_key text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS public.tournament_disputes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES public.tournament_instances(id),player_id uuid NOT NULL REFERENCES public.profiles(id),reason text NOT NULL,status text NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.tournament_definitions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_instances ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_scores ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_standings ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_reward_allocations ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tournament_disputes ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.register_for_tournament(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR public.rt_social_restricted(auth.uid()) OR NOT public.rt_check_rate_limit(auth.uid(),'tournament_registration',10,3600) THEN RAISE EXCEPTION 'registration unavailable'; END IF; IF NOT EXISTS(SELECT 1 FROM public.tournament_instances WHERE id=p_instance AND status='registration_open') THEN RAISE EXCEPTION 'tournament unavailable'; END IF; INSERT INTO public.tournament_registrations(instance_id,player_id) VALUES(p_instance,auth.uid()) ON CONFLICT DO NOTHING; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.submit_tournament_score(p_round uuid,p_receipt uuid,p_score integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); iid uuid; BEGIN IF uid IS NULL OR p_score<0 THEN RAISE EXCEPTION 'invalid score'; END IF; SELECT r.instance_id INTO iid FROM public.tournament_rounds r JOIN public.tournament_instances i ON i.id=r.instance_id WHERE r.id=p_round AND r.status='active' AND i.status='active'; IF iid IS NULL OR NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE instance_id=iid AND player_id=uid AND status='registered') OR NOT EXISTS(SELECT 1 FROM public.gameplay_action_receipts WHERE id=p_receipt AND player_id=uid AND status='accepted') THEN RAISE EXCEPTION 'trusted score unavailable'; END IF; INSERT INTO public.tournament_scores(round_id,player_id,action_receipt_id,score) VALUES(p_round,uid,p_receipt,p_score) ON CONFLICT(round_id,player_id) DO UPDATE SET score=EXCLUDED.score,action_receipt_id=EXCLUDED.action_receipt_id; INSERT INTO public.tournament_standings(instance_id,player_id,score) VALUES(iid,uid,p_score) ON CONFLICT(instance_id,player_id) DO UPDATE SET score=(SELECT coalesce(sum(s.score),0) FROM public.tournament_scores s JOIN public.tournament_rounds r ON r.id=s.round_id WHERE r.instance_id=iid AND s.player_id=uid),updated_at=now(); RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.get_tournament_standings(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN jsonb_build_object('standings',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.rank NULLS LAST,s.score DESC) FROM public.tournament_standings s WHERE s.instance_id=p_instance),'[]'::jsonb)); END $$;
CREATE OR REPLACE FUNCTION public.finalize_tournament_results(p_instance uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; WITH ranked AS (SELECT id,rank() OVER(ORDER BY score DESC,updated_at) r FROM public.tournament_standings WHERE instance_id=p_instance) UPDATE public.tournament_standings s SET rank=ranked.r FROM ranked WHERE s.id=ranked.id; UPDATE public.tournament_instances SET status='finalized' WHERE id=p_instance; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.file_tournament_dispute(p_instance uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR char_length(trim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'invalid dispute'; END IF; INSERT INTO public.tournament_disputes(instance_id,player_id,reason) VALUES(p_instance,auth.uid(),left(trim(p_reason),1000)); RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.claim_tournament_reward(p_allocation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.tournament_reward_allocations; BEGIN SELECT * INTO a FROM public.tournament_reward_allocations WHERE id=p_allocation FOR UPDATE; IF a.player_id IS DISTINCT FROM auth.uid() OR a.status<>'claimable' OR a.asset_type='COSMETIC' THEN RAISE EXCEPTION 'reward unavailable'; END IF; PERFORM public.rt_set_mutation_flag(); INSERT INTO public.reward_ledger(player_id,reward_type,amount,reason,source_type,source_id,idempotency_key) VALUES(a.player_id,a.asset_type,a.amount,'Tournament reward','tournament',a.instance_id::text,'claim:'||a.id::text) ON CONFLICT DO NOTHING; UPDATE public.tournament_reward_allocations SET status='claimed' WHERE id=a.id; RETURN jsonb_build_object('ok',true); END $$;

-- ============================================================================
-- 4 Guilds
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guilds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,normalized_name text NOT NULL UNIQUE,tag text NOT NULL UNIQUE,leader_id uuid NOT NULL REFERENCES public.profiles(id),join_policy text NOT NULL DEFAULT 'invite_only' CHECK(join_policy IN('invite_only','request')),max_members integer NOT NULL DEFAULT 20 CHECK(max_members BETWEEN 2 AND 20),discoverable boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disbanded')),description text,created_at timestamptz NOT NULL DEFAULT now(),disbanded_at timestamptz);
CREATE TABLE IF NOT EXISTS public.guild_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),role text NOT NULL DEFAULT 'member' CHECK(role IN('leader','officer','member')),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','left','removed')),joined_at timestamptz NOT NULL DEFAULT now(),left_at timestamptz,UNIQUE(guild_id,player_id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_guild_one_active_membership ON public.guild_members(player_id) WHERE status='active' AND left_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_guild_one_leader ON public.guild_members(guild_id) WHERE role='leader' AND status='active' AND left_at IS NULL;
CREATE TABLE IF NOT EXISTS public.guild_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,sender_id uuid NOT NULL REFERENCES public.profiles(id),recipient_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL DEFAULT 'pending',expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',UNIQUE(guild_id,recipient_id,status));
CREATE TABLE IF NOT EXISTS public.guild_join_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(guild_id,player_id,status));
CREATE TABLE IF NOT EXISTS public.guild_chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,sender_id uuid NOT NULL REFERENCES public.profiles(id),client_message_id text NOT NULL,body text NOT NULL,safe_body text,status text NOT NULL DEFAULT 'sent',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(guild_id,sender_id,client_message_id));
CREATE TABLE IF NOT EXISTS public.guild_message_reads(guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,player_id uuid NOT NULL REFERENCES public.profiles(id),last_read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,player_id));
CREATE TABLE IF NOT EXISTS public.guild_announcements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,author_id uuid NOT NULL REFERENCES public.profiles(id),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.guild_activity_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,event_type text NOT NULL,actor_id uuid,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.guild_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid REFERENCES public.guilds(id),reporter_id uuid NOT NULL REFERENCES public.profiles(id),category text NOT NULL,description text,status text NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.guild_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid,actor_id uuid,target_id uuid,action_type text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.guild_analytics_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid,player_id uuid,event_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_members ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_invitations ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_join_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_chat_messages ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_message_reads ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_announcements ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_activity_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_reports ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE public.guild_analytics_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.rt_active_guild_id(p_player uuid DEFAULT auth.uid()) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT guild_id FROM public.guild_members WHERE player_id=p_player AND status='active' AND left_at IS NULL LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.rt_guild_can_manage(p_guild uuid,p_player uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.guild_members WHERE guild_id=p_guild AND player_id=p_player AND status='active' AND role IN('leader','officer')) $$;
CREATE OR REPLACE FUNCTION public.create_guild(p_name text,p_tag text,p_description text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE uid uuid:=auth.uid(); gid uuid; n text:=lower(regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g')); t text:=upper(trim(coalesce(p_tag,''))); BEGIN IF uid IS NULL OR public.rt_social_restricted(uid) OR public.rt_active_guild_id(uid) IS NOT NULL OR NOT public.rt_check_rate_limit(uid,'guild_create',3,86400) THEN RAISE EXCEPTION 'guild creation unavailable'; END IF; IF n !~ '^[[:alnum:]][[:alnum:] ''_-]{1,30}[[:alnum:]]$' OR t !~ '^[A-Z0-9]{2,6}$' THEN RAISE EXCEPTION 'invalid guild name or tag'; END IF; INSERT INTO public.guilds(name,normalized_name,tag,leader_id,description) VALUES(trim(p_name),n,t,uid,nullif(left(trim(p_description),300),'')) RETURNING id INTO gid; INSERT INTO public.guild_members(guild_id,player_id,role) VALUES(gid,uid,'leader'); RETURN jsonb_build_object('ok',true,'guildId',gid); END $$;
CREATE OR REPLACE FUNCTION public.invite_to_guild(p_player uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid:=public.rt_active_guild_id(); BEGIN IF gid IS NULL OR NOT public.rt_guild_can_manage(gid) OR public.rt_social_restricted(p_player) OR public.rt_is_blocked(auth.uid(),p_player) OR EXISTS(SELECT 1 FROM public.guild_members m WHERE m.guild_id=gid AND m.status='active' AND public.rt_is_blocked(m.player_id,p_player)) OR public.rt_active_guild_id(p_player) IS NOT NULL THEN RAISE EXCEPTION 'invite unavailable'; END IF; INSERT INTO public.guild_invitations(guild_id,sender_id,recipient_id) VALUES(gid,auth.uid(),p_player) ON CONFLICT(guild_id,recipient_id,status) DO UPDATE SET expires_at=now()+interval '24 hours'; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.respond_to_guild_invitation(p_invite uuid,p_accept boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.guild_invitations; BEGIN SELECT * INTO i FROM public.guild_invitations WHERE id=p_invite FOR UPDATE; IF i.recipient_id IS DISTINCT FROM auth.uid() OR i.status<>'pending' OR i.expires_at<=now() THEN RAISE EXCEPTION 'invitation unavailable'; END IF; IF NOT p_accept THEN UPDATE public.guild_invitations SET status='rejected' WHERE id=i.id; RETURN jsonb_build_object('ok',true); END IF; IF public.rt_active_guild_id(auth.uid()) IS NOT NULL OR (SELECT count(*) FROM public.guild_members WHERE guild_id=i.guild_id AND status='active') >= (SELECT max_members FROM public.guilds WHERE id=i.guild_id) OR EXISTS(SELECT 1 FROM public.guild_members m WHERE m.guild_id=i.guild_id AND m.status='active' AND public.rt_is_blocked(m.player_id,auth.uid())) THEN RAISE EXCEPTION 'cannot join guild'; END IF; INSERT INTO public.guild_members(guild_id,player_id) VALUES(i.guild_id,auth.uid()); UPDATE public.guild_invitations SET status='accepted' WHERE id=i.id; RETURN jsonb_build_object('ok',true,'guildId',i.guild_id); END $$;
CREATE OR REPLACE FUNCTION public.get_my_guild() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT jsonb_build_object('guild',to_jsonb(g),'members',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) FROM public.guild_members m WHERE m.guild_id=g.id AND m.status='active')) FROM public.guilds g WHERE g.id=public.rt_active_guild_id()),'null'::jsonb) $$;
CREATE OR REPLACE FUNCTION public.leave_guild() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid:=public.rt_active_guild_id(); next_id uuid; BEGIN IF gid IS NULL THEN RAISE EXCEPTION 'not in guild'; END IF; SELECT player_id INTO next_id FROM public.guild_members WHERE guild_id=gid AND player_id<>auth.uid() AND status='active' ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END,joined_at LIMIT 1; UPDATE public.guild_members SET status='left',left_at=now() WHERE guild_id=gid AND player_id=auth.uid() AND status='active'; IF next_id IS NULL THEN UPDATE public.guilds SET status='disbanded',disbanded_at=now() WHERE id=gid; ELSE UPDATE public.guild_members SET role='leader' WHERE guild_id=gid AND player_id=next_id; UPDATE public.guilds SET leader_id=next_id WHERE id=gid; END IF; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.transfer_guild_ownership(p_player uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid:=public.rt_active_guild_id(); BEGIN IF gid IS NULL OR NOT EXISTS(SELECT 1 FROM public.guild_members WHERE guild_id=gid AND player_id=auth.uid() AND role='leader' AND status='active') OR NOT EXISTS(SELECT 1 FROM public.guild_members WHERE guild_id=gid AND player_id=p_player AND status='active') THEN RAISE EXCEPTION 'transfer denied'; END IF; UPDATE public.guild_members SET role='officer' WHERE guild_id=gid AND player_id=auth.uid(); UPDATE public.guild_members SET role='leader' WHERE guild_id=gid AND player_id=p_player; UPDATE public.guilds SET leader_id=p_player WHERE id=gid; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.send_guild_chat_message(p_client_id text,p_body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid:=public.rt_active_guild_id(); s jsonb; BEGIN IF gid IS NULL OR public.rt_social_restricted(auth.uid()) OR nullif(trim(p_client_id),'') IS NULL OR NOT public.rt_check_rate_limit(auth.uid(),'guild_chat',60,60) THEN RAISE EXCEPTION 'chat unavailable'; END IF; s:=public.rt_safety_check_message(p_body); IF NOT coalesce((s->>'ok')::boolean,false) THEN RAISE EXCEPTION 'message rejected'; END IF; INSERT INTO public.guild_chat_messages(guild_id,sender_id,client_message_id,body,safe_body,status) VALUES(gid,auth.uid(),left(trim(p_client_id),128),s->>'safeBody',s->>'safeBody',CASE WHEN s->>'state'='held' THEN 'held' ELSE 'sent' END) ON CONFLICT(guild_id,sender_id,client_message_id) DO NOTHING; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.get_guild_chat_messages(p_limit integer DEFAULT 50) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid:=public.rt_active_guild_id(); BEGIN IF gid IS NULL THEN RAISE EXCEPTION 'not in guild'; END IF; RETURN jsonb_build_object('messages',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at) FROM (SELECT * FROM public.guild_chat_messages WHERE guild_id=gid AND status<>'deleted' ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit,50),1),100)) x),'[]'::jsonb)); END $$;
CREATE OR REPLACE FUNCTION public.report_guild(p_guild uuid,p_category text,p_description text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR nullif(trim(p_category),'') IS NULL THEN RAISE EXCEPTION 'invalid report'; END IF; INSERT INTO public.guild_reports(guild_id,reporter_id,category,description) VALUES(p_guild,auth.uid(),left(trim(p_category),80),nullif(left(trim(p_description),1000),'')); RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.disband_guild() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid:=public.rt_active_guild_id(); BEGIN IF gid IS NULL OR NOT EXISTS(SELECT 1 FROM public.guild_members WHERE guild_id=gid AND player_id=auth.uid() AND role='leader' AND status='active') THEN RAISE EXCEPTION 'leader required'; END IF; UPDATE public.guilds SET status='disbanded',disbanded_at=now() WHERE id=gid; UPDATE public.guild_members SET status='left',left_at=now() WHERE guild_id=gid AND status='active'; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.search_discoverable_guilds(p_query text DEFAULT '',p_limit integer DEFAULT 20) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('guilds',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM (SELECT id,name,tag,description,max_members FROM public.guilds WHERE status='active' AND discoverable AND (trim(coalesce(p_query,''))='' OR normalized_name ILIKE '%'||lower(trim(p_query))||'%') ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit,20),1),50)) g),'[]'::jsonb)) $$;
CREATE OR REPLACE FUNCTION public.reconcile_guild_ownership(p_guild uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n uuid; BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; IF NOT EXISTS(SELECT 1 FROM public.guild_members WHERE guild_id=p_guild AND role='leader' AND status='active') THEN SELECT player_id INTO n FROM public.guild_members WHERE guild_id=p_guild AND status='active' ORDER BY joined_at LIMIT 1; IF n IS NULL THEN UPDATE public.guilds SET status='disbanded',disbanded_at=now() WHERE id=p_guild; ELSE UPDATE public.guild_members SET role='leader' WHERE guild_id=p_guild AND player_id=n; UPDATE public.guilds SET leader_id=n WHERE id=p_guild; END IF; END IF; RETURN jsonb_build_object('ok',true); END $$;
CREATE OR REPLACE FUNCTION public.run_guild_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE g uuid; BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; UPDATE public.guild_invitations SET status='expired' WHERE status='pending' AND expires_at<=now(); FOR g IN SELECT id FROM public.guilds WHERE status='active' LOOP PERFORM public.reconcile_guild_ownership(g); END LOOP; RETURN jsonb_build_object('ok',true); END $$;

-- ============================================================================
-- 5 Analytics / Ops / Maintenance
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_phase10l_maintenance() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; RETURN jsonb_build_object('worldEvents',public.run_world_event_maintenance(),'guilds',public.run_guild_maintenance()); END $$;
CREATE OR REPLACE FUNCTION public.get_phase10l_ops_dashboard() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.rt_is_social_operator('moderator') THEN RAISE EXCEPTION 'operator required'; END IF; RETURN jsonb_build_object('activeWorldEvents',(SELECT count(*) FROM public.world_event_instances WHERE status='active'),'openWorldEventAlerts',(SELECT count(*) FROM public.world_event_operational_alerts WHERE status='open'),'activeTournaments',(SELECT count(*) FROM public.tournament_instances WHERE status='active'),'openTournamentDisputes',(SELECT count(*) FROM public.tournament_disputes WHERE status='open'),'activeGuilds',(SELECT count(*) FROM public.guilds WHERE status='active'),'openGuildReports',(SELECT count(*) FROM public.guild_reports WHERE status='open')); END $$;

-- ============================================================================
-- 6 Seeds
-- ============================================================================
INSERT INTO public.character_cosmetic_definitions(id,name,slot,status) VALUES
 ('base_default','Default Base','base','active'),('hair_short','Short Hair','hair','active'),('hair_long','Long Hair','hair','active'),('outfit_starter_dark','Starter Dark Outfit','outfit','active'),('outfit_market_apron','Market Apron','outfit','active'),('hat_beanie','Beanie','hat','active'),('glasses_round','Round Glasses','glasses','active'),('cosmetic_test_event_pin','TEST Event Pin','badge','active'),('cosmetic_tournament_champion','Tournament Champion','badge','draft'),('cosmetic_guild_founder','Guild Founder','badge','draft') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.world_event_definitions(id,name,description,status,is_test) VALUES ('test-town-tour-event','TEST Town Tour','Inactive TEST world event.','draft',true),('test-market-rush','TEST Market Rush','Inactive TEST world event.','draft',true),('test-community-milestone','TEST Community Milestone','Inactive TEST world event.','draft',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.tournament_definitions(id,name,status,is_test,rules) VALUES ('test-explorer-score-challenge','TEST Explorer Score Challenge','draft',true,'{"trustedReceiptsOnly":true,"noSolSpl":true}'::jsonb) ON CONFLICT(id) DO NOTHING;

-- ============================================================================
-- 7 RLS notes / RPC grants
-- ============================================================================
COMMENT ON TABLE public.player_character_cosmetics IS 'Phase 10L ownership source of truth; browser cannot insert cosmetic grants.';
COMMENT ON TABLE public.world_event_reward_allocations IS 'Phase 10L server-created, in-game-only reward allocations.';
COMMENT ON TABLE public.guild_members IS 'Phase 10L membership is RPC-only; no client INSERT policy.';
REVOKE ALL ON FUNCTION public.rt_ensure_default_character_cosmetics(uuid),public.get_my_character_cosmetics(),public.get_my_character_loadout(),public.update_character_loadout(jsonb,text),public.get_public_character_loadout(uuid),public.grant_character_cosmetic(uuid,text,text),public.revoke_character_cosmetic(uuid,text,text),public.reconcile_character_loadout(uuid),public.transition_world_event_state(uuid,text),public.schedule_world_event(text,timestamptz,timestamptz),public.register_for_world_event(uuid),public.withdraw_from_world_event(uuid),public.get_my_world_event_registration(uuid),public.record_world_event_contribution(uuid,text,uuid,text,integer),public.evaluate_world_event_instance(uuid),public.get_active_world_events(),public.claim_world_event_reward(uuid),public.run_world_event_maintenance(),public.register_for_tournament(uuid),public.submit_tournament_score(uuid,uuid,integer),public.get_tournament_standings(uuid),public.finalize_tournament_results(uuid),public.file_tournament_dispute(uuid,text),public.claim_tournament_reward(uuid),public.rt_active_guild_id(uuid),public.rt_guild_can_manage(uuid,uuid),public.create_guild(text,text,text),public.invite_to_guild(uuid),public.respond_to_guild_invitation(uuid,boolean),public.get_my_guild(),public.leave_guild(),public.transfer_guild_ownership(uuid),public.send_guild_chat_message(text,text),public.get_guild_chat_messages(integer),public.report_guild(uuid,text,text),public.disband_guild(),public.search_discoverable_guilds(text,integer),public.reconcile_guild_ownership(uuid),public.run_guild_maintenance(),public.run_phase10l_maintenance(),public.get_phase10l_ops_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_character_cosmetics(),public.get_my_character_loadout(),public.update_character_loadout(jsonb,text),public.get_public_character_loadout(uuid),public.reconcile_character_loadout(uuid),public.register_for_world_event(uuid),public.withdraw_from_world_event(uuid),public.get_my_world_event_registration(uuid),public.record_world_event_contribution(uuid,text,uuid,text,integer),public.get_active_world_events(),public.claim_world_event_reward(uuid),public.register_for_tournament(uuid),public.submit_tournament_score(uuid,uuid,integer),public.get_tournament_standings(uuid),public.file_tournament_dispute(uuid,text),public.claim_tournament_reward(uuid),public.create_guild(text,text,text),public.invite_to_guild(uuid),public.respond_to_guild_invitation(uuid,boolean),public.get_my_guild(),public.leave_guild(),public.transfer_guild_ownership(uuid),public.send_guild_chat_message(text,text),public.get_guild_chat_messages(integer),public.report_guild(uuid,text,text),public.disband_guild(),public.search_discoverable_guilds(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_character_cosmetic(uuid,text,text),public.revoke_character_cosmetic(uuid,text,text),public.transition_world_event_state(uuid,text),public.schedule_world_event(text,timestamptz,timestamptz),public.evaluate_world_event_instance(uuid),public.run_world_event_maintenance(),public.finalize_tournament_results(uuid),public.reconcile_guild_ownership(uuid),public.run_guild_maintenance(),public.run_phase10l_maintenance(),public.get_phase10l_ops_dashboard() TO authenticated;
COMMIT;


-- ===== END database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql =====



-- ===== BEGIN database/migrations/20260717_phase10mnpqs_living_world_security.sql =====

-- Phase 10M–10S additive: tournament discovery, onboarding reward, token config stub.
-- Safe to apply after 20260716_phase10l_*.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.get_open_tournaments()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'instanceId', i.id,
    'definitionId', i.definition_id,
    'name', d.name,
    'status', i.status,
    'isTest', d.is_test,
    'startsAt', i.starts_at,
    'endsAt', i.ends_at,
    'rules', d.rules
  ) ORDER BY i.starts_at NULLS LAST), '[]'::jsonb)
  FROM public.tournament_instances i
  JOIN public.tournament_definitions d ON d.id = i.definition_id
  WHERE i.status IN ('registration_open', 'active', 'finalized');
$$;

CREATE OR REPLACE FUNCTION public.get_discoverable_guilds(p_query text DEFAULT '', p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.search_discoverable_guilds(p_query, p_limit);
$$;

-- One-time Welcome Citizen cosmetic grant (server-authoritative).
CREATE OR REPLACE FUNCTION public.claim_welcome_citizen_cosmetic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.character_cosmetic_definitions WHERE id = 'cosmetic_test_event_pin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'welcome cosmetic unavailable');
  END IF;
  INSERT INTO public.player_character_cosmetics(player_id, cosmetic_id, source_type, source_id)
  VALUES (uid, 'cosmetic_test_event_pin', 'onboarding', 'welcome_citizen')
  ON CONFLICT (player_id, cosmetic_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Server-side token feature flag table (disabled until Pump.fun mint configured).
CREATE TABLE IF NOT EXISTS public.token_integration_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  mint_address text,
  cluster text NOT NULL DEFAULT 'mainnet-beta',
  feature_version integer NOT NULL DEFAULT 1,
  activated_at timestamptz,
  activated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.token_integration_config(id, enabled) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.token_integration_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "token config public read when enabled" ON public.token_integration_config;
CREATE POLICY "token config public read when enabled" ON public.token_integration_config
  FOR SELECT USING (enabled = true OR auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.get_public_token_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', coalesce((SELECT enabled FROM public.token_integration_config WHERE id = 1), false),
    'mintAddress', CASE WHEN (SELECT enabled FROM public.token_integration_config WHERE id = 1)
      THEN (SELECT mint_address FROM public.token_integration_config WHERE id = 1) ELSE NULL END,
    'cluster', coalesce((SELECT cluster FROM public.token_integration_config WHERE id = 1), 'mainnet-beta'),
    'featureVersion', coalesce((SELECT feature_version FROM public.token_integration_config WHERE id = 1), 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.activate_token_integration(p_mint text, p_cluster text DEFAULT 'mainnet-beta')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rt_is_social_operator('admin') THEN RAISE EXCEPTION 'admin operator required'; END IF;
  IF p_mint IS NULL OR char_length(trim(p_mint)) < 32 OR char_length(trim(p_mint)) > 64 THEN
    RAISE EXCEPTION 'invalid mint address';
  END IF;
  IF p_cluster NOT IN ('devnet', 'testnet', 'mainnet-beta') THEN RAISE EXCEPTION 'invalid cluster'; END IF;
  UPDATE public.token_integration_config
  SET enabled = true,
      mint_address = trim(p_mint),
      cluster = p_cluster,
      activated_at = now(),
      activated_by = auth.uid(),
      updated_at = now()
  WHERE id = 1;
  RETURN jsonb_build_object('ok', true, 'enabled', true);
END $$;

REVOKE ALL ON FUNCTION public.get_open_tournaments(), public.get_discoverable_guilds(text, integer),
  public.claim_welcome_citizen_cosmetic(), public.get_public_token_status(),
  public.activate_token_integration(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_tournaments(), public.get_discoverable_guilds(text, integer),
  public.claim_welcome_citizen_cosmetic(), public.get_public_token_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_tournaments(), public.get_public_token_status() TO anon;
GRANT EXECUTE ON FUNCTION public.activate_token_integration(text, text) TO authenticated;

COMMIT;


-- ===== END database/migrations/20260717_phase10mnpqs_living_world_security.sql =====



-- ===== BEGIN database/migrations/20260717_phase11_bitmap_character_appearances.sql =====

-- Phase 11: bitmap character appearances (server-authoritative JSONB).
BEGIN;

CREATE TABLE IF NOT EXISTS public.player_bitmap_appearances (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  appearance_version integer NOT NULL DEFAULT 1 CHECK (appearance_version = 1),
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  appearance_revision bigint NOT NULL DEFAULT 1 CHECK (appearance_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_bitmap_appearance_size CHECK (pg_column_size(appearance) < 4096)
);

CREATE TABLE IF NOT EXISTS public.character_bitmap_catalog (
  asset_id text PRIMARY KEY CHECK (asset_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  player_selectable boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.player_bitmap_appearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_bitmap_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bitmap appearance owner read" ON public.player_bitmap_appearances;
CREATE POLICY "bitmap appearance owner read" ON public.player_bitmap_appearances
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bitmap catalog read" ON public.character_bitmap_catalog;
CREATE POLICY "bitmap catalog read" ON public.character_bitmap_catalog
  FOR SELECT USING (enabled = true);

CREATE OR REPLACE FUNCTION public.get_my_character_appearance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.player_bitmap_appearances;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO row FROM public.player_bitmap_appearances WHERE user_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'appearance', jsonb_build_object('version', 1, 'baseId', 'base_skin_light', 'hairId', null, 'facialHairId', null, 'headwearId', null, 'pantsId', null, 'shoesId', null, 'accessoryIds', '[]'::jsonb),
      'revision', 0
    );
  END IF;
  RETURN jsonb_build_object('appearance', row.appearance, 'revision', row.appearance_revision);
END $$;

CREATE OR REPLACE FUNCTION public.save_my_character_appearance(p_appearance jsonb, p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  clean jsonb;
  rev bigint;
  cur public.player_bitmap_appearances;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'appearance update unavailable'; END IF;
  IF jsonb_typeof(p_appearance) <> 'object' THEN RAISE EXCEPTION 'invalid appearance'; END IF;
  IF pg_column_size(p_appearance) > 4096 THEN RAISE EXCEPTION 'appearance too large'; END IF;
  -- Structural validation only; asset IDs validated client-side against registry.
  IF coalesce(p_appearance->>'version', '1') NOT IN ('1') THEN RAISE EXCEPTION 'unsupported appearance version'; END IF;
  IF coalesce(p_appearance->>'baseId', '') !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN RAISE EXCEPTION 'invalid baseId'; END IF;
  IF p_appearance ? 'textureUrl' OR p_appearance::text ~* 'https?://' THEN RAISE EXCEPTION 'urls not allowed'; END IF;

  clean := jsonb_build_object(
    'version', 1,
    'baseId', p_appearance->>'baseId',
    'hairId', NULLIF(p_appearance->>'hairId', ''),
    'facialHairId', NULLIF(p_appearance->>'facialHairId', ''),
    'headwearId', NULLIF(p_appearance->>'headwearId', ''),
    'pantsId', NULLIF(p_appearance->>'pantsId', ''),
    'shoesId', NULLIF(p_appearance->>'shoesId', ''),
    'accessoryIds', coalesce(p_appearance->'accessoryIds', '[]'::jsonb)
  );

  SELECT * INTO cur FROM public.player_bitmap_appearances WHERE user_id = uid FOR UPDATE;
  IF FOUND THEN
    IF p_expected_revision IS NOT NULL AND p_expected_revision > 0 AND cur.appearance_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'revision conflict';
    END IF;
    UPDATE public.player_bitmap_appearances
    SET appearance = clean, appearance_revision = cur.appearance_revision + 1, updated_at = now()
    WHERE user_id = uid
    RETURNING appearance_revision INTO rev;
  ELSE
    INSERT INTO public.player_bitmap_appearances(user_id, appearance, appearance_revision)
    VALUES (uid, clean, 1)
    RETURNING appearance_revision INTO rev;
  END IF;

  RETURN jsonb_build_object('ok', true, 'appearance', clean, 'revision', rev);
END $$;

CREATE OR REPLACE FUNCTION public.get_public_character_appearance(p_player uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('appearance', appearance, 'revision', appearance_revision, 'playerId', user_id)
     FROM public.player_bitmap_appearances WHERE user_id = p_player),
    'null'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_character_appearance(), public.save_my_character_appearance(jsonb, bigint), public.get_public_character_appearance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_character_appearance(), public.save_my_character_appearance(jsonb, bigint), public.get_public_character_appearance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_appearance(uuid) TO anon;

COMMENT ON TABLE public.player_bitmap_appearances IS 'Phase 11 bitmap appearance; IDs only, no texture URLs.';

COMMIT;


-- ===== END database/migrations/20260717_phase11_bitmap_character_appearances.sql =====



-- ===== BEGIN database/migrations/20260720_phase12_outfit_layer.sql =====

-- Phase 12: add outfitId to the bitmap character appearance JSONB.
-- Additive only — appearance is stored as jsonb with no fixed columns
-- for cosmetic slots, so existing rows are untouched; they simply lack
-- the "outfitId" key until the player saves again, which the client
-- already normalizes to null (see CharacterAppearanceCodec.ts).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_character_appearance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.player_bitmap_appearances;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO row FROM public.player_bitmap_appearances WHERE user_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'appearance', jsonb_build_object(
        'version', 1, 'baseId', 'base_skin_light', 'hairId', null, 'facialHairId', null,
        'headwearId', null, 'outfitId', null, 'pantsId', null, 'shoesId', null, 'accessoryIds', '[]'::jsonb
      ),
      'revision', 0
    );
  END IF;
  RETURN jsonb_build_object('appearance', row.appearance, 'revision', row.appearance_revision);
END $$;

CREATE OR REPLACE FUNCTION public.save_my_character_appearance(p_appearance jsonb, p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  clean jsonb;
  rev bigint;
  cur public.player_bitmap_appearances;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.rt_social_restricted(uid) THEN RAISE EXCEPTION 'appearance update unavailable'; END IF;
  IF jsonb_typeof(p_appearance) <> 'object' THEN RAISE EXCEPTION 'invalid appearance'; END IF;
  IF pg_column_size(p_appearance) > 4096 THEN RAISE EXCEPTION 'appearance too large'; END IF;
  -- Structural validation only; asset IDs validated client-side against registry.
  IF coalesce(p_appearance->>'version', '1') NOT IN ('1') THEN RAISE EXCEPTION 'unsupported appearance version'; END IF;
  IF coalesce(p_appearance->>'baseId', '') !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN RAISE EXCEPTION 'invalid baseId'; END IF;
  IF p_appearance ? 'textureUrl' OR p_appearance::text ~* 'https?://' THEN RAISE EXCEPTION 'urls not allowed'; END IF;

  clean := jsonb_build_object(
    'version', 1,
    'baseId', p_appearance->>'baseId',
    'hairId', NULLIF(p_appearance->>'hairId', ''),
    'facialHairId', NULLIF(p_appearance->>'facialHairId', ''),
    'headwearId', NULLIF(p_appearance->>'headwearId', ''),
    'outfitId', NULLIF(p_appearance->>'outfitId', ''),
    'pantsId', NULLIF(p_appearance->>'pantsId', ''),
    'shoesId', NULLIF(p_appearance->>'shoesId', ''),
    'accessoryIds', coalesce(p_appearance->'accessoryIds', '[]'::jsonb)
  );

  SELECT * INTO cur FROM public.player_bitmap_appearances WHERE user_id = uid FOR UPDATE;
  IF FOUND THEN
    IF p_expected_revision IS NOT NULL AND p_expected_revision > 0 AND cur.appearance_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'revision conflict';
    END IF;
    UPDATE public.player_bitmap_appearances
    SET appearance = clean, appearance_revision = cur.appearance_revision + 1, updated_at = now()
    WHERE user_id = uid
    RETURNING appearance_revision INTO rev;
  ELSE
    INSERT INTO public.player_bitmap_appearances(user_id, appearance, appearance_revision)
    VALUES (uid, clean, 1)
    RETURNING appearance_revision INTO rev;
  END IF;

  RETURN jsonb_build_object('ok', true, 'appearance', clean, 'revision', rev);
END $$;

COMMENT ON TABLE public.player_bitmap_appearances IS 'Phase 11 bitmap appearance; Phase 12 added outfitId. IDs only, no texture URLs.';

COMMIT;


-- ===== END database/migrations/20260720_phase12_outfit_layer.sql =====



-- ===== BEGIN database/migrations/20260722_phase13_chapter_one_missions_progression.sql =====

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


-- ===== END database/migrations/20260722_phase13_chapter_one_missions_progression.sql =====



-- ===== BEGIN database/migrations/20260722_phase13b_mission_reward_fix.sql =====

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


-- ===== END database/migrations/20260722_phase13b_mission_reward_fix.sql =====



-- ===== BEGIN database/migrations/20260723_phase13c_post_bootstrap_grants_and_party_rls.sql =====

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


-- ===== END database/migrations/20260723_phase13c_post_bootstrap_grants_and_party_rls.sql =====

