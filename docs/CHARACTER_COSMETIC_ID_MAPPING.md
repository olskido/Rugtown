# Cosmetic ID Mapping (Phase 10M)

Module: `src/game/characters/CosmeticIdMapping.ts`

## Rules

- Presence cosmetic IDs are **hints only**
- Public loadouts pass through `sanitizePublicCosmeticId`
- Legacy creator IDs (`shortBlack`, `beanieBlack`, …) map to server slugs (`hair_short`, `hat_beanie`)
- Restricted / npc-only / hidden IDs fall back safely
- No arbitrary texture URLs

## Add a cosmetic

1. Insert `character_cosmetic_definitions` row (SQL)
2. Add manifest entry (`CharacterManifest.ts`)
3. Add mapping entry with `legacyAliases` if needed
4. Grant ownership via operator RPC or entitlement — never the client
