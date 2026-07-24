# Character Asset Pipeline

## Folder layout

```text
public/assets/characters/
  bases/
  hair/
  outfits/
  accessories/
  held-items/
  shadows/
  npc/
  manifests/
    character_manifest.v1.json
```

## Pipeline steps

1. Generate or draw high-res sheets per `CHARACTER_GENERATION_PROMPTS.md`
2. Trim, pad, and validate feet / transparency
3. Downscale to logical `48×72` (or approved size)
4. Pack or export per-layer sheets
5. Register entries in `character_manifest.v1.json` and DB `character_cosmetic_definitions`
6. Run `scripts/validate-character-manifest.mjs` and `validate-character-assets.mjs`
7. Grant cosmetics via operator RPC (never client insert)
8. Keep `CHARACTER_RENDER_MODE = 'graphics'` until sheets pass validation
9. Flip to layered/precomposed sprite mode behind a feature flag

## Compatibility

- Legacy creator slots (`skinTone`, `hairstyle`, …) map through `legacyAppearanceFromLoadout` / `loadoutFromLegacyAppearance`
- Procedural `drawHumanoid` remains the fallback forever for missing assets
- Collision foot box unchanged: 20×12 @ +12 Y

## Keyboard note

`C` remains **Chat**. Character Customisation opens via HUD **Character** (`U`) to avoid conflict.
