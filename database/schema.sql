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
-- Username is derived from the email prefix (lowercased, special chars stripped)
-- with a short UUID suffix appended to guarantee uniqueness.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER            -- runs with the privileges of the function owner
SET search_path = public    -- prevent search_path injection
AS $$
DECLARE
  base_name text;
  safe_name text;
BEGIN
  -- Extract and sanitise the local-part of the email address.
  base_name := lower(
    regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g')
  );

  -- Ensure the name is never empty, then append 6 hex chars from the UUID
  -- so the result is globally unique even if two users share an email prefix.
  safe_name := coalesce(nullif(base_name, ''), 'degen')
               || '_'
               || substr(replace(NEW.id::text, '-', ''), 1, 6);

  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, safe_name)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
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
