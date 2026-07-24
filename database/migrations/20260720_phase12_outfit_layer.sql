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
