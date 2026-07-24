# Phase 11C — character art repair, directional honesty, NPC life pass

## Root cause of "hair across the face" / "hats floating"
Two distinct, independently-confirmed causes — not one:

1. **Scale was computed from the raw atlas frame size, not the visible
   content.** Every hair frame shares one 160×160 canvas, every headwear
   frame a 352×352 canvas — but actual visible art fills anywhere from
   ~10% to ~95% of that canvas per asset. `getPlacementForSlot()` scaled
   from the frame height, so on-screen cosmetic size was arbitrary:
   measured before/after (`scripts/analyze-character-asset-bounds.mjs`,
   `TARGET_DISPLAY_HEIGHT=48`):
   - hair: 7.1–15.8px visible on screen (2.24x spread) → now a
     consistent 16.9px for every hairstyle.
   - headwear: 1.8–5.2px (2.91x spread, i.e. most hats were nearly
     invisible) → now a consistent 18.3px.
   - facial-hair: 2.0–6.4px (3.23x spread) → now a consistent 10.3px.
   X/Y centering itself was already fine for hair/headwear/facial-hair
   (measured offset ≤0.003 of frame size across all 89 sampled assets) —
   this was a scale bug, not primarily a position bug.
2. **8 currently-enabled assets contain two packed reference views in
   one frame** (e.g. `headwear_dad_cap_01` is a front view AND a 3/4 side
   view side by side in the same 352×352 canvas). Rendered as one asset
   this composes as two heads. Found via a new connected-component scan
   (`countVisibleRegions` in `character-bounds-analysis.mjs`), confirmed
   visually by extracting the raw frame. This is a source-art defect, not
   fixable by placement math — excluded from the creator instead
   (`alignmentStatus: 'incompatible'`, `requiresReview: true`).

## What changed
- `scripts/lib/character-bounds-analysis.mjs` (new) — measures real
  visible bbox, mirror-symmetry, and connected-component count per
  frame/base body. Used by both the install pipeline and the QA script
  (one measurement implementation, not two).
- `scripts/install-character-assets.mjs` — writes real
  `visibleWidth/visibleHeight/offsetXFrac/offsetYFrac/mirrorSafe` per
  asset; excludes the 8 multi-region-defective assets; renamed
  `compatibilityGroup` from `mannequin_v1` to `bitmap_citizen_v1`
  (manifest metadata only, never stored in a saved appearance — no save
  migration needed); default appearance is now `hair_crew_cut_01` +
  `pants_dark_jeans_01` instead of every slot null.
- `src/game/characters/render/BitmapCharacterLayout.ts` — scale now
  derives from measured visible bounds with a width safety cap; X/Y
  correction uses the measured offset instead of assuming frame-center
  == visible-center.
- `src/game/characters/render/BitmapCharacter.ts` — `applyFlip()` now
  makes the facing approximation explicit and per-layer: 'left' mirrors
  only when `asset.mirrorSafe`, hiding non-mirror-safe layers instead of
  showing them flipped-and-wrong; 'right'/'up' consistently reuse the
  down pose (documented, not silent).
- `src/game/characters/render/CharacterVisualScale.ts` —
  `NPC_VISUAL_SCALE` = the Phase 11B runtime value (0.936) × 1.30 =
  1.2168, applied at exactly one call site.
- `src/game/scenes/WorldScene.ts` — NPC speed range 145–195 → 62–108
  (old max exceeded PLAYER_SPEED 176; new max stays under it at every
  district multiplier); real per-NPC `districtId` via
  `WorldDistricts.getDistrictAtWorld()` (was hardcoded `'spawn'`);
  district speed/pause multipliers; new `'look'` state (brief
  anticipation beat before walking); facing-change hysteresis (220ms
  minimum between snaps); lightweight O(n) personal-space separation.
- `src/components/character/BitmapCharacterCreator.tsx` /
  `OutfitSelectPage.tsx` — removed a redundant double preview-update per
  selection click.
- `scripts/compose-character-preview-qa.mjs` — was silently drifted from
  the real placement formula (still used the pre-fix, frame-based
  scale); rewritten to match, plus new composites (default player,
  hair+hat, hair+facial+hat, an explicitly-labeled mirrored-left
  composite, a representative NPC) and two new JSON reports.
- `scripts/test-character-placement-and-npc-tuning.mjs` (new) — 8
  standalone `node:assert` tests.

## Known, deliberate limitations (not fixed, not hidden)
- No true left/right/up directional art exists anywhere in the pipeline
  — every asset is a single "down" frame. 'left' is a verified mirror
  where safe; 'right'/'up' reuse the down pose. Real directional art
  requires new source generation (see `CHARACTER_GENERATION_PROMPTS.md`)
  — out of scope for this pass per its own instructions (no image-gen
  tool available in this environment).
- Only the 8 assets caught by connected-component analysis were
  excluded for the multi-region defect; the scan only ran on
  currently-enabled categories' full set plus NPCs/shoes/accessories —
  all 30 affected frames across all categories are listed in
  `qa/transparent-bounds-report.md`, but only the 8 that were previously
  *enabled* needed action this pass.
- District-specific NPC behavior (Task 16) maps the prompt's named
  districts (Market/Government/Park/Coffee/Bridge) onto the 5 real
  `WorldDistricts.ts` ids (west/spring_core/east/financial/
  arena_grounds) — there is no 1:1 geometry for "Coffee Shop" or
  "Bridge" as districts today, only landmarks within a district.
