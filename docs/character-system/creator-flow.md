# Creator flow

Character previews and the permanent top-left player-card portrait use the player’s complete current bitmap appearance. Draft edits in the creator are local until Save.

Authenticated Save goes through `characterAppearanceService.saveAuthenticated` → Supabase RPC `save_my_character_appearance`. Only after that RPC accepts the payload does the appearance become permanent for the live character, HUD portrait, creator reopen, and Presence. Guests Save to `rugtown:characterAppearance:v1`. No separate portrait image is uploaded.

`BitmapCharacterCreator` and `OutfitSelectPage` host `CharacterPreviewGame` (same `BitmapCharacter` stack as the world). Preview autofit keeps the figure at ~70–80% of the canvas height with padding for hats/hair.

Facing controls use `flipX` only. Alignment details: [preview-alignment-qa.md](preview-alignment-qa.md).
