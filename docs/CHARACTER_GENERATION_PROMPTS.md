# RugTown Character Generation Prompts

Use with Gemini, Midjourney, or similar. Every prompt must include the **common suffix**.

## Phase 12 calibration note

The world background is warm, painterly, semi-grounded fantasy — not
flat-chibi. The original "slightly chibi" direction below clashes with
it the same way the old placeholder body did. **Use believable
proportions (head:body ~1:2.2–1:2.5), not oversized-head chibi.** Keep
everything else (palette, silhouette-first readability, soft painterly
shading matching the environment's lighting).

**Architecture note:** clothing is now a SEPARATE layer from the base
body (see `docs/character-system/phase11c-notes.md` and
`rugtown_asset_pipeline/incoming/README.md`). Generate base bodies as
bare skin only — no baked-in jacket — and generate outfits separately
on a canvas that exactly matches the base body's canvas/pose so they
align without manual offsets.

## Common suffix (append to every prompt)

```text
Transparent background, no text, no logos, no watermark, no scenery, no floor shadow baked into the character,
consistent body proportions, consistent lighting from upper-left, identical camera perspective and scale,
clean frame separation, feet fully visible, no cropped feet, no duplicated limbs, no merged frames,
polished 2D game character, believable semi-realistic proportions (head:body ~1:2.2-1:2.5, not oversized-head chibi),
compact readable silhouette, warm earth and gold RugTown aesthetic, soft painterly shading matching a lit fantasy town environment,
no purple neon, no hyper-realistic skin, no random NFT profile picture style, single pose/view per image only.
```

## 1. Base male (CANONICAL — bare skin, no clothing, outfit is a separate layer)

This is the reference prompt for the male base body. It is self-contained
(does not need the common suffix appended — it already specifies
transparent background, canvas, margins, etc. directly) and was refined
to call out anatomy explicitly, since earlier attempts drifted toward
flat/procedural-looking results. **Attach the current RugTown world
background as a reference image when running this** — "must visually
belong inside this environment" only works if the tool can actually see
that environment.

```text
Create a production-quality modular character sprite for a 2D browser RPG called RugTown.

The character must visually belong inside the attached RugTown environment: a prosperous medieval-inspired trading city
with painterly buildings, stone roads, warm lantern lighting, green landscapes and a slightly dark fantasy atmosphere.

This is NOT chibi, cartoon mascot, Roblox, Minecraft, RPG Maker, anime, vector art or flat procedural art.

ART DIRECTION
Create a believable stylized human character with: natural adult proportions, a smaller anatomically believable head,
defined shoulders, visible neck, properly shaped torso, natural arm length, natural leg length, readable hands rather
than circular fists, defined boots and feet, strong silhouette at small game scale, painterly pixel-art appearance,
subtle fabric and leather shading, controlled dark outlines, warm directional lighting matching the RugTown world,
slightly rugged medieval trading-town appearance.

CAMERA AND POSE
Full-body front-facing character, neutral standing pose, arms relaxed slightly away from the torso, legs separated
enough for clean animation and layer readability, character perfectly centered. No dramatic pose, no weapon, no props,
no floor, no shadow, no environment, no text.

TECHNICAL REQUIREMENTS
Transparent PNG, canvas exactly 512x768 pixels, one character only, entire body visible, no cropping, consistent
empty transparent margin around the character, feet aligned to the lower central region of the canvas, character
occupies approximately 70-78% of the canvas height, clean alpha edges, no glow, no background colour, no duplicate
views, no turnaround sheet, no multiple characters, no side-by-side reference images.

MODULAR REQUIREMENT — this file is the BASE BODY layer. Generate the character wearing only simple fitted neutral
underclothes suitable for layering: sleeveless neutral undershirt, short fitted neutral under-trousers, bare lower
legs and feet or minimal neutral foot covering. No coat, robe, tunic, armour, belt, hat, hair, facial hair, jewellery,
or accessories. The anatomy and underclothes must allow separate outfit PNG layers to align exactly over the same body.

CHARACTER IDENTITY — young adult [male / female / androgynous], medium build, confident but neutral posture, grounded
believable proportions, no exaggerated muscles, no exaggerated facial features, understated medieval-fantasy appearance.
```

Save the result as `rugtown_asset_pipeline/incoming/base/{skin_tone}.png`
and run the ingest pipeline (`docs/character-system/phase12-notes.md`).

## 2. Base female / 3. Androgynous base

Use prompt #1 verbatim, only changing the `CHARACTER IDENTITY` line's
`[male / female / androgynous]` selection and, if wanted, `medium build`.
Keep every other line — including the bare-underclothes modular
requirement and the exact 512×768 technical spec — identical so all
base bodies compose correctly under the same outfit layers.

## 3b. Outfit (separate layer — Phase 12)

```text
A single clothing outfit only, drawn on the exact same canvas size, pose, and proportions as the RugTown base body
(front-facing, arms slightly away from sides, feet-flat stance), as if dressing an invisible mannequin in that exact pose.
No skin, no head, no hands showing through — only the garment silhouette positioned where it would sit on that body.
[Style: e.g. "market vendor apron over a linen shirt", "dark gold-trimmed street jacket", "casual hoodie and trousers"].
[COMMON SUFFIX]
```

## 4. Four-direction neutral turnaround

```text
Same identical RugTown character shown in four orthographic facing directions on one sheet:
top-left down, top-right left, bottom-left right, bottom-right up.
Identical outfit, hair, lighting, and scale in every panel. Grid layout with equal spacing. [COMMON SUFFIX]
```

## 5. Four-direction walking sprite sheet

```text
Sprite sheet of the same RugTown character walking. Rows: down, left, right, up.
Columns: 6 evenly spaced walk cycle frames per row. Identical outfit and proportions.
Clear empty padding between frames. [COMMON SUFFIX]
```

## 6. Idle animation frames

```text
Sprite sheet idle animation for the same RugTown character facing down. 4 frames of subtle breathing and weight shift only.
No walking. Identical outfit. Equal frame size. [COMMON SUFFIX]
```

## 7. Expression sheet

```text
Same RugTown character face/head close-ups: neutral, smile, surprised, focused. Four panels, identical hair and lighting.
Transparent background. [COMMON SUFFIX]
```

## 8–13. Variants (swap the subject)

Use turnaround or single idle front + suffix:

- Clothing: “dark gold-trimmed street jacket”, “market vendor apron”, “casual hoodie”
- Hair: “short messy”, “long tied”, “mohawk”, “bald”
- Hat: “beanie”, “cap”, “top hat”
- Glasses: “round glasses”, “dark shades”
- Handheld: “coffee cup”, “phone”, “briefcase”
- Shoes: “sneakers”, “boots”, “sandals”

Always: same base body identity across the set.

## 14. Premium founder set

```text
RugTown founder cosmetic set on the base character: elegant dark coat with subtle gold embroidery,
small founder pin, refined boots. Idle front + four-direction turnaround. Premium but readable at small size. [COMMON SUFFIX]
```

## 15. Holder set

```text
RugTown verified-holder cosmetic: subtle gold trim jacket and discreet holder badge accessory.
Not flashy. Readable silhouette. Idle front. [COMMON SUFFIX]
```

## 16. Tournament set

```text
Tournament competitor scarf and armband on base character, dark athletic jacket, gold accents.
Idle front and walk-down sheet. [COMMON SUFFIX]
```

## 17. Guild set

```text
Guild recruit cloak pin and banner-colored sash (deep charcoal + muted gold) on base character.
No custom guild logo text. Idle front. [COMMON SUFFIX]
```

## 18. Seasonal event set

```text
Limited TEST event festival pin and light cape on base character. Celebratory but not oversized.
Idle front. Marked visually as festive accessory only. [COMMON SUFFIX]
```

## 19. NPC civilian variants

```text
Four distinct RugTown civilian NPCs in a row, same style and lighting (see Phase 12 calibration note above), different outfits and hair,
townsfolk vibe (vendor, walker, cafe guest, park goer). Transparent background. [COMMON SUFFIX]
```

## 20. Operator / official NPC

```text
Official RugTown staff NPC: clean dark uniform with thin gold trim, calm posture, trustworthy silhouette.
Not labeled with text. Idle front and four-direction turnaround. [COMMON SUFFIX]
```

## Negative prompt (where supported)

```text
text, watermark, logo, scenery, background city, cropped feet, extra limbs, merged frames,
purple neon, photorealistic, 3D render, NFT pfp crop, inconsistent scale, floor shadow on sprite
```
