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
