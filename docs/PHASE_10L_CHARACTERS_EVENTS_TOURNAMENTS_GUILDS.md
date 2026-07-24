# Phase 10L — Characters, World Events, Tournaments & Guilds

Additive foundation on Phases 10F–10K. **Character redesign is Gate A** and ships first; events, tournaments, and guilds reuse identity, parties, receipts, rewards, moderation, Realtime patterns, and ops tooling.

## What shipped

### Gate A — Character redesign
- Audit findings documented below and in `CHARACTER_VISUAL_MASTER_SPEC.md`
- Module: `src/game/characters/` (renderer facade, fallback procedural path, manifest, animation controller, validation)
- Server ownership: `character_cosmetic_*` + loadout RPCs in `20260716_phase10l_characters_events_tournaments_guilds.sql`
- UI: Character panel (`U`) — owned cosmetics only, no store
- Multiplayer: presence movement remains for coords; cosmetics overlaid via `get_public_character_loadout`
- **Bitmap art is not shipped** — procedural `HumanoidRenderer` remains production path

### Gate B — Live world events
- Definitions, schedules, instances, objectives, participants, contributions (receipt-gated), rewards → ledger
- TEST seeds: Town Tour, Market Rush, Community Milestone (`draft` / inactive)
- UI: Events (`V`), compact HUD when an active instance exists

### Gate C — Tournaments
- Built on trusted scores + standings; no combat / paid entry / SOL prizes
- TEST: `test-explorer-score-challenge` (draft)
- Tournament Hall (arena landmark) opens Tournament Centre

### Gate D — Guilds
- Persistent groups (not parties); invite-only default; max 20; chat uses social safety pipeline
- Access: Social → Guild Centre (no new Guild Hall building)

## Navigation

| Key | Action |
|-----|--------|
| `C` | Chat (unchanged) |
| `U` | Character customisation |
| `V` | World Events |
| `F` | Social (+ Guild entry) |
| `P` | Party |
| `E` | Emotes bar / interact elsewhere |

## Deploy

1. Apply `database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql`
2. Run static validators under `scripts/validate-phase10l-*.mjs` and `validate-character-*.mjs`
3. Deploy client build
4. Operators activate TEST cosmetics / events / tournaments via gated RPCs
5. Run `run_phase10l_maintenance` from Reward Operations

## Character art import (later)

See `CHARACTER_ASSET_PIPELINE.md` and `CHARACTER_GENERATION_PROMPTS.md`. Flip manifest `renderModeDefault` only after sheet validation.

## Honesty limits

Not completed in this phase unless separately verified:

- Final character bitmap art
- Live Supabase / Realtime / multi-account QA
- Production event or tournament operations
- Guild moderation at scale

## Recommended next phase (10M)

Final art import, NPC visual redesign, event map effects, audio, mobile polish, real multi-account tests, deployment hardening.

---

## Gate A audit snapshot

1. **Local player** — Phaser Graphics + `drawHumanoid` / `resolvedAppearance`
2. **NPCs** — same procedural path, random appearance
3. **Remotes** — Graphics + presence appearance (now overlaid with server loadout when UUID)
4. **Anim states** — idle/walk via `computeWalkPose` / blend; emote bubbles separate
5. **Directions** — down/up/left/right
6. **Logical target** — 48×72 (was 32×48 placeholder)
7. **Foot anchor** — bottom-center
8. **Collision** — foot box 20×12 @ +12 Y (preserved)
9. **Scale** — player/remote ~0.82, NPC ~0.78
10–12. Nameplate / title / shadow — existing WorldScene attachments unchanged
13. Presence appearance fields — client-sent (spoof risk mitigated by public loadout overlay)
14. Customization — creator + server loadout slots
15. Fallback — `CharacterFallbackRenderer` / `HumanoidRenderer` must remain
16. Systems assuming procedural humanoids — WorldScene, portrait, remotes, NPCs
17. Entity type — Graphics (not sprites yet)
18. Zoom — animation independent of camera zoom
19. Skin swap — `setAppearance` redraws without recreating body
20. Spoof — mitigated for authenticated IDs via `get_public_character_loadout`
