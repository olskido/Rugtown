# RugTown — The Degen City

> "Survive or Get Rugged."

RugTown is a browser-based, top-down isometric "degen city" world built with
React + Phaser 3 + TypeScript. Walk around a hand-illustrated Solana-flavored
city, interact with live DexScreener market data, complete starter quests, watch
a dynamic event engine unfold, and discover secrets — all running entirely in
the browser.

**Works out of the box with no configuration.** Optional Supabase integration
enables accounts, saved progress, and real-time multiplayer presence. No real
wallet connection. Live market data comes from DexScreener's public API
(read-only). Mock/devnet content is clearly labeled in the UI.

---

## Tech stack

| Layer         | Technology |
|---------------|------------|
| UI / HUD      | React 18 + TypeScript |
| Game engine   | Phaser 3.90 (WebGL / Canvas) |
| Bundler       | Vite 5 |
| Styling       | Plain CSS (no Tailwind) |
| Sound         | Streamed music (`public/audio/`) + Web Audio SFX |
| Market data   | DexScreener public API (no key required) |
| Auth + DB     | Supabase (optional — see setup below) |

---

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:3000
npm run build      # tsc + vite production build → dist/
npm run preview    # serve dist/ locally
```

**RugTown works without any configuration.**  Without a Supabase project, it
runs in guest-only mode — all gameplay, live market data, and events work
normally; progress just isn't saved between sessions.

### City background

Drop your city artwork at `public/assets/backgrounds/rugtown-city.png`.
If it is missing, the game falls back to a procedurally drawn placeholder
world — all systems still work.

---

## Supabase setup (optional — enables accounts & saved progress)

### 1. Create a project

Sign in at [supabase.com](https://supabase.com) and create a new project.
Wait for it to finish provisioning.

### 2. Run the database schema

Open **SQL Editor → New query** in the Supabase dashboard, paste the full
contents of [`database/schema.sql`](database/schema.sql) and click **Run**.

This creates all tables, RLS policies, indexes, and the signup trigger in one
pass.  The file is idempotent — safe to re-run.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and paste the two values from  
**Supabase dashboard → Settings → API**:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

> **Never commit `.env.local`** — it is already listed in `.gitignore`.  
> The anon key is safe to expose in the browser because every table has
> Row-Level Security enabled; users can only read and write their own rows.

### 4. Verify Realtime is enabled

Supabase Realtime handles live player presence and city chat between users.
It is **enabled by default** on all Supabase projects — no extra configuration
is required.

To confirm: **Supabase dashboard → Realtime** — the service should show as
active.  If broadcast messages between players stop working, check that
the project is not paused (free tier projects pause after 7 days of
inactivity; wake them up by visiting the dashboard).

### 5. (Optional) Enable Google OAuth

In the Supabase dashboard: **Authentication → Providers → Google** → toggle on.
Follow the guide to create Google OAuth credentials and paste the Client ID /
Secret back into Supabase.  No code changes needed on the frontend — the auth
client in `src/lib/supabase.ts` already handles it.

Ensure **Site URL** and **Redirect URLs** in  
**Authentication → URL Configuration** include your deployed domain
(e.g. `https://rugtown.vercel.app`).

### 6. Vercel deployment

Add the same two env vars in  
**Vercel → Project → Settings → Environment Variables**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Redeploy after adding the variables.  The framework preset is **Vite**,
build command `npm run build`, output directory `dist`.

---

## Private beta checklist

Run through this before inviting testers.

### Supabase dashboard
- [ ] Project is **not** paused (free tier wakes on first request, but
      first-visitor latency can be 10-30 s — consider keeping it active)
- [ ] **SQL Editor**: `database/schema.sql` has been run at least once
- [ ] **Authentication → Providers**: Email is enabled; Google is enabled
      (if you want OAuth)
- [ ] **Authentication → URL Configuration**: Site URL matches your
      deployed domain; `/*` or the exact origin is in Redirect URLs
- [ ] **Realtime** panel shows the service running (no errors)

### Local / staging smoke test
- [ ] `npm run build` exits with 0 errors
- [ ] Guest flow: skip auth → outfit → game — movement, events, chat
      all work with no console errors
- [ ] Sign-up flow: email + password → check inbox → confirm link →
      redirects back → outfit screen shows character creator
- [ ] Google OAuth flow: click "Continue with Google" → Google consent →
      redirects back → outfit screen shows character creator
- [ ] In-game: appearance saves and reloads on next login
- [ ] In-game: REP increments and persists after page refresh
- [ ] Multiplayer: open two browser tabs (or two browsers) both logged in
      → both show the other player moving in-world and in the online count
- [ ] Chat: send a message in tab A → tab B receives it in city chat
- [ ] Emotes: trigger an emote in tab A → tab B sees the emote bubble
      above the sender's avatar

---

## Deploying (without accounts)

Static Vite app — no server-side code, no env vars required for basic gameplay.

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
- WASD / arrow-key movement with immediate full-speed, instant-stop response —
  fully deterministic, no acceleration curves; camera follow with tight deadzone
  and smooth lerp, scroll-wheel + button zoom
- Default zoom 60% shows a comfortable city overview
- Dynamic minimum zoom prevents showing empty space outside the map
- Collision system (water canals, building edges) with optional debug overlay
  (Settings panel)
- Floating landmark labels above key locations (Spawn Fountain, Meme Market,
  Hall of Fame, Whale Tower, Alpha Lounge, Notice Board, Bridge) that fade at
  low zoom; the label for the current mission's target zone pulses gold

### 30-Level Progression System
- Always-visible **Mission HUD** (top-center on mobile, bottom-center on desktop)
  shows the current level, group, objective, target building, and REP reward
- 30 data-driven levels across 6 groups: New Degen Tutorial → City Explorer →
  Meme Market Scout → Whale Watcher → Alpha Hunter → RugTown Citizen
- Objective types: visit zone, claim fountain, chat, emote, talk NPC, inspect
  statue, inspect whale, claim treasure, open inventory/leaderboard/holder,
  reach REP milestone
- REP reward on completion; animated level-up transition on the Mission HUD
- Progress persisted in `localStorage` so guests don't lose progress on refresh
- **Chat FAB** — dedicated 💬 button always visible at bottom-left (desktop) or
  bottom-center (mobile), independent of the action bar

### First-Minute Onboarding
- Level 1 mission ("Claim your first REP at the Spawn Fountain") appears
  immediately in the Mission HUD; building label pulses gold to guide new players
- Pulsing gold fountain glow reinforces the direction
- Platform-aware instructions: "Use WASD" on desktop, "Use joystick" on mobile

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
- **30-level progression** (see above) — the primary moment-to-moment guidance
- 4 starter quests that run alongside levels and unlock in sequence
- 7 badges earned through gameplay actions (fountain, market, NPCs, whale, treasure)
- 6 city districts that unlock as the player progresses

### Reputation (REP) System
- Earned from level completion, fountain claim, NPC inspection, treasure finds,
  events, and quests
- Mock Holder tier (None / Bronze / Silver / Gold) multiplies REP gains —
  a local simulation, no real token required
- Local leaderboard labeled **City Rankings** shows rank against NPC citizens
  (clearly tagged NPC, never presented as real players)

### Sound
- Audio unlocks only after the first user click, tap, or key press (no autoplay)
- **Streamed background music** from `public/audio/` with two crossfading decks:
  - *city.mp3* / *market.mp3* — shuffle naturally, never repeat the same track
    twice in a row, and crossfade between one another
  - *event.mp3* — overrides the ambient music while a live event is running,
    then crossfades back when the event ends
  - The Meme Market building can optionally pin the market track
  - Music auto-resumes when a backgrounded tab is returned to
- UI sound effects (synthesized via Web Audio): click, modal open, reward
  chime, quest complete, event bell, chat send
- Mute toggle + Music / Effects volume sliders in Settings
- "Test Sound" button in Settings to verify audio is working

### Accounts & Multiplayer (Supabase optional)
- Email/password and Google OAuth sign-in; Continue as Guest always available
- Saved across sessions: username, character appearance, REP, badges,
  inventory, district unlocks
- Real-time presence: live Real Players count, remote avatars in-world, city
  chat broadcast, emote broadcast, click-to-view profile cards
- NPC citizens are always separate from real players and never counted in the
  online total

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

- **Persistence requires Supabase.** With env vars configured, accounts save
  username, appearance, REP, badges, inventory, and district unlocks across
  sessions. Without a configured Supabase project, all state lives in React
  memory and resets on page refresh (guest mode).
- **No real wallet.** Holder tier is a local simulation; no real tokens or
  on-chain data are involved.
- **Multiplayer is presence-based.** Real Players count, remote avatars, city
  chat, emotes, and click-to-view profile cards work via Supabase Realtime
  when configured. NPC citizens are always labelled separately and never
  counted as real players.
- **Background music streams** from `public/audio/` (city / market / event);
  UI sound effects are synthesized via Web Audio oscillators.
- **Collision is intentionally light** — water canals, map edges, one large
  structure — not every building footprint.
- **Leaderboard tabs** (Daily / Weekly / All Time) show the same in-session
  dataset; time-windowed tracking is not implemented.
- **Market data is read-only.** Nothing in the app can submit a transaction or
  call a wallet. Every market panel is explicitly labeled "READ-ONLY."
- **Event chain probabilities are weighted toward common events** during early
  session play; rarer events (Legendary Hidden Merchant) appear less frequently
  by design.
