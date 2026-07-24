# RugTown Character Visual Master Spec

Production requirements for character artists and image-generation tools.

## Art direction (updated Phase 12)

- Polished 2D game characters for the final RugTown world map
- **Believable, semi-realistic proportions** (head:body ~1:2.2–1:2.5) —
  NOT chibi. The world background is painterly/grounded, not flat-cartoon;
  an oversized-head chibi character reads as a mismatch against it.
- Readable silhouette at gameplay zoom; expressive but not childish
- Premium Web3 town aesthetic: warm earth tones, dark + gold accents
- No purple-default UI look; no neon glow stacks
- Front-facing game view for now (true 4-direction art is a future upgrade — see below)
- Transparent backgrounds only — never bake scenery or shadows into body sheets

## Perspective & proportions

| Rule | Value |
|------|--------|
| Camera | Flat orthographic game sprite; identical across all frames |
| Head:body | ~1:2.2 to 1:2.5 (believable, not chibi) |
| Foot anchor | Bottom-center of every frame |
| Facing | Down only for now (see directional note below) |
| Lighting | Soft key from upper-left; consistent across set |

## Directional art — current status

Every asset in the pipeline today is a single front-facing ("down")
frame. `BitmapCharacter.ts` approximates left-facing by mirroring the
down frame ONLY when a measured left/right-symmetry check says it's
visually valid (see `scripts/lib/character-bounds-analysis.mjs`);
right/up currently reuse the down pose as a documented placeholder.
**If you can generate a true 4-direction turnaround, do it as separate
files per direction** (prompt #4 in `CHARACTER_GENERATION_PROMPTS.md`
already exists for this) — wiring real per-direction art in is a future
upgrade that doesn't require regenerating anything already produced
down-only.

## Dimensions (Phase 12)

### Source art (what to generate)

- **Base body:** `512×768` transparent PNG, bare skin (no baked
  clothing — outfit is a separate layer, see below)
- **Outfit:** `512×768` — must exactly match the base body's canvas
  size and pose so it aligns with zero manual offset
- **Hair / headwear / facial hair / accessories:** `512×512` transparent
  PNG, generous padding is fine
- No tight-cropping needed — the renderer measures actual visible
  pixels and scales from that (Phase 11C), not the canvas size

### Gameplay logical frame (manifest, unchanged)

- Runtime display height: `48` logical px (`TARGET_DISPLAY_HEIGHT` in
  `CharacterVisualScale.ts`) — the renderer downscales from source art
  automatically; you do not need to pre-downscale.
- Collision foot box (preserve unless playtest proves change): **20×12**, offset **+12** world Y from body center — do not bind collision to limb motion

## Layers (preferred architecture)

1. Shadow (separate ellipse or soft oval asset — never baked into body)
2. Base body + skin
3. Outfit / clothing
4. Hair
5. Headwear
6. Face accessory (glasses)
7. Back accessory
8. Held item
9. Nameplate / title (UI overlay — not in sprite sheet)

All animation-compatible layers must share: frame size, frame count, directional layout, origin, and animation state keys.

**Renderer modes:** layered | precomposed | procedural fallback (`graphics`).

## Animation states

Minimum:

- `idle` — 2–4 frames per direction
- `walk` — 4–8 frames per direction
- `interact` — optional 2–4 frames (down-facing acceptable initially)
- `emote` / `celebration` — optional shared down-facing set
- AFK/disconnected — optional dim overlay (code), not required in art

Diagonal movement resolves to nearest cardinal visually.

## Directional layout

Recommended sheet order per animation:

`down → left → right → up` (matches existing `SPRITE_SHEET_DIRECTIONS`).

## Naming

```text
char_{base|hair|outfit|…}_{id}_{anim}_{dir}_{frame:02}.png
# or packed:
char_{id}_{anim}.png  # grid: columns=frames, rows=directions
```

Manifest keys must match `character_cosmetic_definitions.id`.

## Forbidden in assets

- Text, logos (unless cosmetic is explicitly branded and approved)
- Background scenery
- Baked drop shadows under feet (use separate shadow layer)
- Cropped feet / merged frames / duplicated limbs
- Inconsistent outfit or scale across a turnaround
- NFT PFP crops pasted as world sprites

## Texture filtering

- Prefer crisp pixels or soft AA consistently within a set — do not mix
- Phaser: typically `nearest` for pixel sets; `linear` only for intentionally soft premium sets
- Compression: lossless PNG for sheets; avoid heavy JPEG

## Visual QA checklist

- [ ] Transparent background
- [ ] Identical proportions across directions
- [ ] Feet not clipped
- [ ] Idle/walk timing feels continuous at scale 0.7–0.9
- [ ] Readable at camera zoom 0.85–1.70 (default ~1.30)
- [ ] Nameplate clearance above head
- [ ] Works on warm RugTown road colors (contrast)
- [ ] Manifest checksum / path validates
- [ ] Fallback procedural still works if asset missing

## Current engine notes (audit)

- Live renderer today: procedural Phaser Graphics (`CHARACTER_RENDER_MODE = 'graphics'`)
- Existing creator slots map into fallback until bitmap cosmetics are granted
- Remote appearance must not trust client payloads once server loadouts are live
