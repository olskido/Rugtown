# RugTown — The Degen City

> "Survive or Get Rugged."

RugTown is a browser-based, top-down isometric "degen city" world built with
React + Phaser. You enter as a guest, walk around a hand-illustrated city
(fountain plaza, meme market, a couple of bridges and canals, a whale tower,
a hall of fame), talk to ambient NPC citizens, complete a few starter quests,
chat, emote, and watch simulated "live city events" scroll by — all running
entirely in the browser.

**This is a local, frontend-only MVP.** There is no backend, no wallet
connection, and no real Solana/on-chain data — see
[Known MVP limitations](#known-mvp-limitations) below. The app itself labels
this clearly in the UI ("DEVNET · MOCK MODE").

## Tech stack

- [React 18](https://react.dev/) for the HUD/UI layer
- [Phaser 3](https://phaser.io/) for the game world (rendering, input, camera)
- [Vite](https://vitejs.dev/) for dev server + production bundling
- TypeScript throughout

## Getting started

```bash
npm install
```

### Development server

```bash
npm run dev
```

Starts Vite's dev server (defaults to `http://localhost:3000`).

### Production build

```bash
npm run build
```

Type-checks with `tsc`, then builds an optimized production bundle into
`dist/`.

### Preview the production build locally

```bash
npm run preview
```

Serves the contents of `dist/` locally so you can sanity-check the actual
production build before deploying.

## Deploying

This is a static Vite app — no server-side code, no environment variables,
no API routes. On Vercel, the framework preset "Vite" (or a generic static
build) works out of the box:

- **Build command:** `npm run build`
- **Output directory:** `dist`

The city background and any other files in `public/` are served from the
site root (e.g. `/assets/backgrounds/rugtown-city.png`), which matches how
they're referenced in code — no extra configuration needed as long as the
app is deployed at a domain root (the default for a Vercel project).

## Current features

- Landing page with a local guest-name entry (no auth, no backend)
- Fullscreen isometric city world — WASD/arrow-key movement, smooth camera
  follow, zoom via buttons / scroll wheel / keyboard (`+` / `-` / `0`)
- Lightweight collision (water canals, map edges, one large structure) with
  a debug overlay toggle (`C` key, or from Settings)
- Ambient NPC citizens that wander, idle, and occasionally speak; press `E`
  near one to start a short local dialogue
- Named interaction zones (Spawn Fountain, Meme Market, Hall of Fame,
  Bridge, Whale Tower) — press `E` near one for a black/gold modal with
  zone-specific content, including a claimable daily REP reward at the
  fountain
- REP, a mock Holder tier system (None/Bronze/Silver/Gold REP multiplier),
  a starter quest list, an inventory/badge system, and a local leaderboard,
  all shown consistently across the HUD
- Local-only city chat, simulated "live city events", and player emotes
- A small WebAudio-based sound system (synthesized placeholder tones —
  no audio files) with mute and per-channel volume controls
- A Settings panel: sound controls, fullscreen toggle, reset camera, and
  the collision debug toggle

## Known MVP limitations

- **No backend.** REP, quests, badges, chat, leaderboard standing, and the
  Holder tier are all in-memory React state — refreshing the page resets
  everything.
- **No real wallet or on-chain data.** The Holder system, the leaderboard,
  and any token/market references in chat or interaction modals are mock
  flavor content, clearly labeled as such in the UI.
- **No multiplayer.** The HUD's "Real Players" stat is intentionally shown
  as unavailable; every other character on screen is an NPC.
- **Sound is synthesized, not produced audio.** Music/ambience/effects are
  simple WebAudio oscillator tones standing in for real audio files.
- **Collision is intentionally light** for this MVP pass — it covers the
  obvious water canals, the map edges, and one large structure, not every
  building footprint.
- **Leaderboard tabs** (Daily/Weekly/All Time) currently render the same
  local dataset; there's no time-windowed tracking yet.
