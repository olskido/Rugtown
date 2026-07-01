# RugTown — The Degen City

> "Survive or Get Rugged."

RugTown is a browser-based, top-down isometric "degen city" world built with
React + Phaser 3 + TypeScript. Walk around a hand-illustrated Solana-flavored
city, interact with live DexScreener market data, complete starter quests, watch
a dynamic event engine unfold, and discover secrets — all running entirely in
the browser with no backend required.

**Frontend-only demo.** No backend, no real wallet connection. Live market data
comes from DexScreener's public API (read-only). Everything else is local
in-session state. The UI clearly labels mock/devnet content.

---

## Tech stack

| Layer       | Technology |
|-------------|------------|
| UI / HUD    | React 18 + TypeScript |
| Game engine | Phaser 3.90 (WebGL / Canvas) |
| Bundler     | Vite 5 |
| Styling     | Plain CSS (no Tailwind) |
| Sound       | Web Audio API (synthesized, no audio files) |
| Market data | DexScreener public API (no key required) |

---

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:3000
npm run build      # tsc + vite production build → dist/
npm run preview    # serve dist/ locally
```

### City background

Drop your city artwork at `public/assets/backgrounds/rugtown-city.png`.
If it is missing, the game falls back to a procedurally drawn placeholder
world — all systems still work.

---

## Deploying

Static Vite app, no server-side code, no environment variables.

**Vercel** (recommended):
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

---

## Feature overview

### Character Creator
- RPG-style modular appearance system: skin tone, hairstyle, facial hair, hat,
  glasses, accessory, jacket, pants, shoes, backpack, and handheld item
- **Live animated preview** — the Phaser humanoid renderer runs in the creator
  so what you see is exactly what appears in-world
- ~10 million+ unique combinations; every NPC citizen is procedurally generated
  so no two citizens look identical
- Desktop and mobile responsive layout

### World & Movement
- WASD / arrow-key movement with smooth acceleration, camera follow with
  deadzone and momentum, scroll-wheel + button zoom
- Default zoom 60% shows a comfortable city overview
- Dynamic minimum zoom prevents showing empty space outside the map
- Collision system (water canals, building edges) with optional debug overlay
  (`C` key or Settings panel)
- Floating landmark labels above key locations (Spawn Fountain, Meme Market,
  Hall of Fame, Whale Tower, Alpha Lounge, Notice Board, Bridge) that fade at
  low zoom

### First-Minute Onboarding
- Small non-blocking corner panel guides new players to claim REP at the
  Spawn Fountain
- Platform-aware instructions: "Use WASD" on desktop, "Use joystick" on mobile
- Pulsing gold fountain glow guides the player toward the first reward
- 15-second idle hint if the player hasn't acted
- Panel dismisses automatically when fountain REP is claimed, or manually

### Event Engine
- Data-driven lifecycle: Idle → Countdown → Announcement → Live → Completed → Cooldown
- **Event Chains** — events can trigger follow-up events (e.g. Whale Alert can
  chain into Treasure Hunt or Market Pump)
- **Town Crier NPC** appears during every Announcement phase, posts to city chat,
  and nearby citizens briefly face him
- **Crowd reactions** — key events pull groups of citizens toward the action
  with staggered speech bubbles

### Playable Events
| Event | Mechanic |
|-------|----------|
| **Whale Alert** | Walk to Whale Tower and press E to inspect a mock whale wallet, earning REP and the Whale Watcher+ badge |
| **Treasure Hunt** | A glowing chest spawns somewhere in the city; find it and press E to claim REP |
| **Fireworks** | Crowd gathers at the Spawn Fountain; purely ambient |
| **Dance Festival** | Crowd gathers at the Park; ambient / cosmetic |
| **Market Pump / Crash** | Citizens react with matching chat energy |
| **Mayor Speech** | Town Crier leads citizens to the Notice Board |
| **Rain** | Weather overlay across the map |
| **Double REP / Hidden Merchant / More** | Rotates automatically via the event chain system |

### Hall of Fame Statues
- Three visible in-world statues near the Hall of Fame landmark
- Ranked by the live local leaderboard — the player can appear as a statue if
  they're in the top 3
- Pedestals glow gold/silver/bronze; press E to inspect any statue for rank,
  REP, and flavor text
- Honesty note: these reflect local in-session data only, not real rankings

### Live DexScreener Market Data (read-only)
All market panels fetch from DexScreener's public API. No API key needed.
No wallet, no trading, no swaps — display only.

**🛒 Meme Market** (`/assets/landmarks/market`)
- Live top-20 trending Solana tokens from DexScreener
- Full sortable table: trending rank, price, 5m %, 1h %, 24h %, volume,
  liquidity, FDV, market cap
- Click any row to open a side panel with contract address, pair age,
  buy/sell ratio, DexScreener chart embed, and pair labels
- Auto-refreshes every 15 seconds; manual Refresh button
- Loading / error states

**📌 Notice Board** (`/notice`)
- Top 5 by 5-minute gain
- Top 5 by 24-hour gain
- Top 5 by volume
- Thin-liquidity warnings (< $20k)
- Manual Refresh button

**🛋️ Alpha Lounge** (`/alpha`)
- **Market Mood** — Bullish / Mixed / Risky, computed from aggregate stats
- **Top Narratives** — locally guessed from token names (dog/frog/cat/AI/
  political/moon themes) — explicitly labeled as estimated
- Strongest 5-minute movers (by magnitude)
- Strongest 24-hour movers
- Most dangerous thin-liquidity + big-move combinations
- Locally generated written summary (no external AI)

### Citizens & Chat
- 15–20 procedurally generated NPC citizens per session (randomized count)
- Each citizen has a unique modular appearance drawn by the same renderer as
  the player
- Citizens wander, idle, gather at landmarks, and sometimes face each other
- Speech bubbles appear above citizens; forwarded to city chat at a throttled
  rate so chat doesn't spam
- Citizens react to live market data: if a token is pumping or dumping, they
  say so in chat with real symbols and real percentages
- Press E near any citizen for a short dialogue line

### Quests, Badges, Districts
- 4 starter quests that unlock in sequence via exploration
- 7 badges earned through gameplay actions
- 6 city districts that unlock as the player progresses

### Reputation (REP) System
- Earned from quests, fountain claim, NPC inspection, treasure finds, and
  events
- Mock Holder tier (None / Bronze / Silver / Gold) multiplies REP gains —
  a local simulation, no real token required
- Local leaderboard shows rank against NPC citizens

### Sound
- Web Audio API throughout — zero audio files, no network requests
- **3 background beat loops** that shuffle every 45–90 seconds:
  - *Dark City* — slow atmospheric bass
  - *Market Pulse* — medium-tempo rhythmic with melodic hints
  - *Event Tension* — faster, tense minor-chord feel
- City ambience loop
- UI sound effects: click, modal open, reward chime, quest complete, event
  bell, chat send
- Mute toggle + per-channel volume sliders (music / ambience / effects)
- "Test Sound" button in Settings to verify audio is working

### HUD & Settings
- Left sidebar: player card, quick stats (REP, citizen count, holder tier)
- Right sidebar: collapsible minimap (desktop hide/show toggle; mobile tap to
  open); minimap proportions match the world's 16:9 aspect ratio
- Action bar: Chat, Emotes, Inventory, Quests, Leaderboard, Holder, Map,
  Story, Settings
- **Story log** — last 5 notable city moments (events started, treasure found,
  whale inspected)
- Settings panel: mute toggle, per-channel sliders, fullscreen toggle, reset
  camera, collision debug toggle, Test Sound button
- Toast notifications for quests, badges, events, rewards

### Mobile
- Virtual joystick (left thumb area) for movement
- E button for interactions
- Zoom +/- buttons
- Collapsible sidebars (tap 🗪 / 🗺️ to open)
- Onboarding shows mobile-specific instructions ("Use joystick to move")

---

## Known limitations / MVP scope

- **No persistence.** All state (REP, quests, badges, appearance, leaderboard
  standing) lives in React memory and resets on page refresh.
- **No real wallet.** Holder tier is a local simulation; no real tokens or
  on-chain data are involved.
- **No multiplayer.** The "Real Players" HUD stat is intentionally unavailable.
  Every other character is an NPC.
- **No audio files.** All sound is synthesized via WebAudio oscillators —
  placeholder until real audio is produced.
- **Collision is intentionally light** — water canals, map edges, one large
  structure — not every building footprint.
- **Leaderboard tabs** (Daily / Weekly / All Time) show the same in-session
  dataset; time-windowed tracking is not implemented.
- **Market data is read-only.** Nothing in the app can submit a transaction or
  call a wallet. Every market panel is explicitly labeled "READ-ONLY."
- **Event chain probabilities are weighted toward common events** during early
  session play; rarer events (Legendary Hidden Merchant) appear less frequently
  by design.
