# Phase 11B — visual fixes, performance, QA

## Mission polish (deferred)
Mission depth and presentation polish deferred to a later dedicated phase.
Future work may include stronger storytelling, clearer objectives, improved feedback, reward presentation, shared-mission polish, and district mission chains.

## NPC scale
`NPC_VISUAL_SCALE = 0.78 * 1.2` (exactly +20%). Collision and AI unchanged.

## Incompatible cosmetics
Shoes and most accessories are `alignmentStatus: incompatible` / `creatorEnabled: false` (isometric / non-mannequin crops). Creator hides empty categories. Default appearance is mannequin base only.

## Preview
Foot-planted framing at ~65–80% preview height; body-height fit (not transparent atlas bounds).

## Follow-up (same day)
- Removed manifest `offsetY` override in `BitmapCharacter.relayoutLayers` — install still writes provisional foot offsets that fought head-center placement (this was a remaining cause of bad head/hat stacking after Phase 11B).
- OutfitSelectPage now matches creator UX (pagination, facing, hide empty/incompatible categories, no shoes).
- Offline compose QA: `npm run qa:character-compose` → `docs/character-system/qa/`.
