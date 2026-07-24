# Bitmap character system

RugTown renders characters from static bitmap frames: generated base-body PNGs plus atlas-backed cosmetics. The renderer composes only registry IDs; it does not accept cosmetic URLs or generate directional animation frames.

**Character previews and the permanent top-left player-card portrait use the player’s complete current bitmap appearance.** Every committed cosmetic change must be saved through the approved Supabase appearance RPC (`save_my_character_appearance`) before it becomes the authenticated player’s permanent appearance. The saved Supabase `CharacterAppearance` is the source of truth used by the live character, top-left player portrait, Character Creator, and multiplayer Presence. Do not upload or store a separate generated portrait image in Supabase.

Guests persist the same appearance object locally (`rugtown:characterAppearance:v1`) until they authenticate.

Install or refresh assets with `npm run assets:characters`. Validate with `npm run validate:characters`. Codec checks: `npm run test:character-appearance`.

Preview alignment notes: [preview-alignment-qa.md](preview-alignment-qa.md).

Characters use a small vertical walk bob on a content group. Left-facing sprites reuse the frame with `flipX` only (never `flipY`).

See [asset-registry.md](asset-registry.md), [appearance-schema.md](appearance-schema.md), [creator-flow.md](creator-flow.md), [supabase-integration.md](supabase-integration.md), and [manual-cleanup.md](manual-cleanup.md).
