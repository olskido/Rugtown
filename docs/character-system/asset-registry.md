# Asset registry

`npm run assets:characters` copies the nine source atlas PNG/JSON pairs into `public/assets/characters/atlases`, generates six base-body PNGs in `bases`, and writes:

- `manifests/character_runtime_manifest.json` — runtime atlas, base, and accepted asset registry
- `asset-audit.json` — installation audit, including atlas sizes and accepted/rejected source assets
- `src/game/characters/assets/generatedCharacterManifest.ts` — compile-time default appearance mirror

At startup, `CharacterAssetLoader` loads the manifest and static Phaser textures. `CharacterAssetRegistry` exposes accepted assets by ID; the creator lists only accepted, player-usable, creator-visible assets. IDs are validated before rendering, so arbitrary texture paths and URLs are not accepted.

Atlas art is static. The runtime layers base, pants, shoes, hair, facial hair, headwear, and up to three accessories by registry layer order.
