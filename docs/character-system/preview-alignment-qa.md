# Preview alignment QA report

Date: 2026-07-17  
Scope: Character Creator preview + top-left HUD portrait (`CharacterPreviewScene` / `BitmapCharacter`)  
Out of scope: appearance schema, registry IDs, Supabase RPCs, Presence payloads

## Root-cause audit

| Check | Finding |
|-------|---------|
| Atlas frame orientation | All 9 production atlases report `rotated: false` on sampled frames. Source hair/hat/pants PNGs are upright (chin down, crown up). |
| Atlas metadata / Phaser | Frames load via `scene.add.image(textureKey, frame)`. No custom crop rotation. Phaser respects `rotated:false`. |
| Image `rotation` | Was unset (0). Now explicitly forced to `0` on every rebuild/flip. |
| `flipX` / `flipY` | Only `flipX` for facing `left`. **`flipY` was never set**, but layer `y` was overwritten every frame (see below), which made heads look “wrong / inverted” relative to the body. |
| Frame origin | Atlas cosmetics use pivot `(0.5, 0.5)`; generated bases used `(0.5, 1)`. Mixed origins caused feet vs center disagreement. |
| Hardcoded offsets | `makeSprite` used guessed multipliers (`0.62`, `0.55`, `0.45`, …) for overlay Y/scale. |
| Walk bob bug | `update()` set `spr.y = -bob` on **every layer**, wiping layout Y after the first frame. This was the primary preview corruption. |

## Corrections applied

1. **Content group bob** — Walk/idle bob moves a child `content` container. Per-layer local Y is preserved.
2. **Unified origin** — Every layer uses `(0.5, 0.5)` (`LAYER_ORIGIN_X/Y`). Atlas pivot metadata is ignored for placement.
3. **Removed guessed offsets** — No more `TARGET_DISPLAY_HEIGHT * 0.62` style Y hacks.
4. **Base-art layout table** — Vertical slots come from the generated base SVG landmarks (`BitmapCharacterLayout.ts`: head / torso / pants / feet). Same table for world + preview.
5. **Layer order** — Base → Pants → Shoes → Hair → Facial → Headwear → Accessories (child list + depth sort).
6. **No incorrect mirroring** — `flipY` forced false; `rotation` forced 0; `flipX` only for left.
7. **Preview autofit** — `CharacterPreviewScene.fitPreview()` scales the composed character to ~70–80% of canvas height, centers it, and keeps top/bottom pad so hats/hair are not clipped.
8. **Creator live canvas** — `BitmapCharacterCreator` hosts the same `CharacterPreviewGame` as OutfitSelect / HUD portrait.
9. **HUD portrait** — Top-left card follows `characterAppearanceService` (committed appearance). No separate portrait image upload.

## Residual art limitations (honest)

- Hair / headwear frames are often **full head crops**, not hair-only alpha overlays. Stacking them on the mannequin covers the head region by design; perfect paper-doll registration still needs author-aligned sheets.
- Pants / shoes are independent product crops (not mannequin-registered). Slot fractions improve readability but are not pixel-perfect couture.
- Shoes art is often a single isometric shoe; dual-foot placement is not invented.

## Verification

- `npx tsc --noEmit` / `npm run build` after changes.
- Manual: open Character Creator + OutfitSelect — character upright, centered, ~¾ preview height, hat not clipped, left facing mirrors via `flipX` only.

## Phase 11B notes

- Mission polish remains deferred; this phase focuses on character responsiveness and render cost.
- NPC visuals use the shared `NPC_VISUAL_SCALE` constant (targeted at 120% of the prior calibration where configured).
- Creator inventory only exposes registry-compatible cosmetics, so incompatible items stay hidden.
