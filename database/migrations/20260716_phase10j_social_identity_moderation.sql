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
