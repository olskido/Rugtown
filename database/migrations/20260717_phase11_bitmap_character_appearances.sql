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
