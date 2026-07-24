# Phase 12 — outfit layer + art ingest pipeline

Triggered by: current character reads as a primitive placeholder against
the painterly world background (base body is a procedurally-generated
SVG mannequin, clothing is baked into it). User will supply new art;
this phase built the spec + pipeline so dropped-in art integrates
without back-and-forth.

## What changed

- **New `outfitId` slot**, additive end-to-end: `CharacterAppearanceV1`,
  `CharacterAppearanceCodec.ts` (normalize/encode/decode, compact key
  `o`), `BitmapCharacterLayout.ts` (new `outfit` stack slot — same
  anchor/scale as `base` since its canvas is specified to match exactly),
  `BitmapCharacter.ts`, both creator UIs (`BitmapCharacterCreator.tsx`,
  `OutfitSelectPage.tsx`), `install-character-assets.mjs`. Base bodies
  are intended to become bare-skin once real art lands; clothing moves
  to this new layer instead of being painted onto the body.
- **Supabase migration** `database/migrations/20260720_phase12_outfit_layer.sql`
  — adds `outfitId` to the `get_my_character_appearance` /
  `save_my_character_appearance` RPCs. JSONB column, no schema/table
  change, fully backward compatible. **Not yet applied to any live
  database** — run it via your normal Supabase migration process.
- **`scripts/ingest-character-art.mjs`** (new) — drop transparent PNGs
  into `rugtown_asset_pipeline/incoming/{base,hair,facial-hair,
  headwear,outfit,pants,shoes,accessories}/`, run
  `npm run ingest:character-art`, then the existing
  `npm run assets:characters`. Packs cosmetics into a dedicated
  `atlas_{category}_ingest` file and real base art replaces the SVG
  placeholder automatically (detected by dimension mismatch vs the
  96×144 SVG fallback).
- **`generateBaseBodies()`** in `install-character-assets.mjs` now
  checks for real art at the destination path before generating the SVG
  placeholder, so dropped-in bodies survive repeated installs.
- Updated `docs/CHARACTER_GENERATION_PROMPTS.md` and
  `CHARACTER_VISUAL_MASTER_SPEC.md`: dialed back "chibi" to believable
  proportions (head:body ~1:2.2–1:2.5) to match the world's painterly
  style; added bare-skin base + separate-outfit prompts; documented the
  512×768 (body/outfit) / 512×512 (hair/hat/facial/accessories) canvas
  spec.

## An incident worth recording

While testing the ingest script, its first version pointed the packer
at the CANONICAL `atlas_hair.json`/`.png` — the same file the existing
52 real hairstyles live in — and overwrote it down to 1 frame.
Recovered from a `dist/` build backup made earlier in the session
(byte-identical to the pre-corruption original, confirmed by frame
count and file size). Fixed by: (1) ingest now always writes to a
distinctly-named `atlas_{category}_ingest` file, never a canonical
name, and (2) a hard runtime guard that refuses to pack into any atlas
name not ending in `_ingest`, so this class of bug can't recur even if
the category→atlas mapping is edited carelessly later. Verified
additive behavior afterward with a synthetic test asset, then removed
all test artifacts and confirmed the manifest matches the exact
pre-incident baseline (340 accepted assets, 52 hair frames).

## Status

- Code/pipeline: **COMPLETE AND VALIDATED** (tsc, build, all test
  scripts, ingest pipeline tested end-to-end with a synthetic asset,
  then cleaned up)
- Supabase migration: **WRITTEN, NOT APPLIED** — needs to be run against
  your database
- New character art: **NOT STARTED** — waiting on user-supplied art per
  the spec in `rugtown_asset_pipeline/incoming/README.md`
- Base-body visual quality, in-world readability against the
  background: **UNCHANGED** — no new art has been generated yet; this
  phase only built the runway
