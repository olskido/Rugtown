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
