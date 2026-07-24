# Phase 10M–10S Combined Delivery Notes

This document covers the combined visual, living-world, and security readiness work after Phase 10L.

## Applied migrations

1. `20260716_phase10l_characters_events_tournaments_guilds.sql` (prior)
2. `20260717_phase10mnpqs_living_world_security.sql` — tournament discovery, welcome cosmetic claim, token config stub

## Homepage

Matches in-game `main_rugtown.png` via `homepageVisual.ts`.

## Characters

- Procedural fallback **retained**
- Mapping + sanitization active
- NPC district archetypes deterministic
- Customisation panel: draft/preview/save/randomize-owned

## Events

- Server events remain reward authority
- Living City remains ambience-only (`EventPresentation.ts`)

## Social

- Nearby player card: **Invite to party**
- Tournament Centre discovers open instances (no UUID paste required when RPC deployed)
- Guild Centre: members, chat history, invite, discoverable list

## Day/night

Client presentation overlay only; server event times remain authoritative.

## Token / Pump.fun

Disabled by default. Activate later via server secrets + `activate_token_integration` (admin) — see launch steps in the phase report.

## Not completed live

- Final bitmap character art
- Live multi-account / stress tests
- Full Express backend (project remains Vite + Supabase)
- Automatic holder-tier from chain (still mock UI until mint enabled)
