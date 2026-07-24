# Supabase integration

Guest appearances use the browser key `rugtown:characterAppearance:v1`. They are migrated and normalized when loaded.

When Supabase is configured and a user is authenticated, `CharacterAppearanceService` uses these RPCs:

- `get_my_character_appearance`
- `save_my_character_appearance`, with `p_appearance` and `p_expected_revision`
- `get_public_character_appearance` for remote player appearance lookup

The accompanying Phase 11 migration defines `player_bitmap_appearances`, revision-aware saving, ID-only structural validation, and RPC permissions. The client remains usable in guest mode when Supabase configuration is unavailable.

The migration file is present in this repository; applying it and live multiplayer verification are deployment tasks, not implied by the client implementation.
