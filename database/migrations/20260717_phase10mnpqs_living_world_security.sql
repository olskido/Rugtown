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
