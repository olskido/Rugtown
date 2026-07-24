# RugTown — Map Measurement + Design Spec

**Status:** Post-cleanup baseline (map pivot, July 2026)  
**Purpose:** Authoritative measurements and handcrafted layout plan for the next world-art pass.  
**Do not rebuild final art from this doc alone** — use it to design the correct full-map image and district geometry.

---

## Cleanup Summary (this pivot)

### Deleted
| Item | Notes |
|------|-------|
| `src/game/worldEngine/BuildingDrawHelpers.ts` | Procedural filler buildings, stalls, lamps, alley strips |
| Midjourney background usage in `WorldScene` | `rugtown-city.png` no longer loaded or drawn |
| `drawCityFillerBlocks()` / `drawFillerSection()` | Removed from `BuildingGenerator` |
| GamePage `bgMissing` banner | No longer relevant |
| `index.html` preload for `rugtown-city.png` | Game no longer depends on it |

### Changed
| File | Change |
|------|--------|
| `src/game/scenes/WorldScene.ts` | Procedural-only world; no image preload/placement |
| `src/game/worldEngine/BuildingGenerator.ts` | Landmark districts + labels only |
| `src/game/worldEngine/RoadGenerator.ts` | Inlined sidewalk helper |
| `src/components/GamePage.tsx` | Removed missing-art notice |
| `src/game/worldEngine/DistrictGenerator.ts` | Comment update (no bg image districts) |
| `index.html` | Removed map image preload |

### Kept (unchanged systems)
Player movement, NPCs, missions, minimap, interiors, collisions, wallet/holder logic, HUD/sidebar/toolbar, Phaser scene architecture, `RoadNetwork`, `WorldObjects`, `EnterableBuildings`.

### Asset note
`public/assets/backgrounds/rugtown-city.png` may still exist on disk (landing page CSS references it) but is **not used in the live playable world**.

---

## 1. Current Map Size

| Property | Value | Source |
|----------|-------|--------|
| **World width** | **9600 px** | `WorldScene` `DEFAULT_WORLD_W` |
| **World height** | **5400 px** | `WorldScene` `DEFAULT_WORLD_H` |
| **Spawn position** | **(3648, 3132)** | `SPAWN_FX=0.38`, `SPAWN_FY=0.58` × world size |
| **Camera viewport** | **100% of `#phaser-mount` parent** (responsive) | `RugTownGame.ts` — not fixed pixels |
| **Example visible area @ 1920×1080, zoom 0.6** | ~3200 × 1800 world px | `viewport / zoom` |
| **Player collision width** | **22 px** | `HumanoidRenderer` `CHAR_W` |
| **Player collision height** | **34 px** | `HumanoidRenderer` `CHAR_H` |
| **Player visual scale** | **1.1×** | `WorldScene` draw pose |
| **Effective visual footprint** | **~24 × 37 px** | 22×1.1, 34×1.1 |
| **Player speed** | **252 px/s** | `PLAYER_SPEED` |
| **Diagonal speed factor** | **0.7071** | `PLAYER_DIAG` |
| **Zoom default** | **0.6** | `ZOOM_DEFAULT` |
| **Zoom min (absolute floor)** | **0.35** | `ZOOM_MIN` |
| **Zoom min (runtime)** | `max(viewportW/worldW, viewportH/worldH, 0.35)` | `computeZoomMin()` — prevents showing void outside world |
| **Zoom max** | **2.2** | `ZOOM_MAX` |
| **Zoom step** | **0.08** | scroll wheel / UI |
| **Camera follow lerp** | **0.28** | `CAM_LERP` |
| **Camera deadzone** | **4 × 4 px** | `CAM_DEADZONE_X/Y` |

---

## 2. Road System Measurements

Two layers exist today:

1. **Collision / walk network** — `RoadNetwork.ts` (`ROAD_WIDTH = 88 px`)
2. **Visual south paving** — `RoadGenerator.ts` (`ROAD_HALF = 64` → **128 px** lane, **14 px** sidewalks)

### 2.1 Global road constants

| Constant | Collision | Visual (south corridor) | Recommended for redesign |
|----------|-----------|-------------------------|--------------------------|
| Walk lane width | **88 px** | **128 px** | **96 px** lane + **20 px** sidewalks each side |
| Sidewalk | (included in plaza) | **14 px** bands | **20 px** paved, gold lamp posts every 120 px |
| Plaza half-size | per-node (see below) | n/a | keep current radii ±10% |

### 2.2 Road nodes (collision plazas)

All positions at **9600 × 5400**.

| Node ID | Name | Center (x, y) | Plaza radius | Plaza box (x, y, w, h) |
|---------|------|---------------|--------------|------------------------|
| `fountain` | Spawn Fountain | (3648, 3132) | 165 | (3483, 2967, 330, 330) |
| `notice` | Notice Board | (3802, 2743) | 92 | (3710, 2651, 184, 184) |
| `market` | Meme Market | (4570, 2484) | 112 | (4458, 2372, 224, 224) |
| `bridge` | Bridge | (4301, 2873) | 100 | (4201, 2773, 200, 200) |
| `alpha` | Alpha Lounge | (5069, 2916) | 104 | (4965, 2812, 208, 208) |
| `whale` | Whale Tower | (4301, 3391) | 112 | (4189, 3279, 224, 224) |
| `fame` | Hall of Fame | (3034, 3607) | 116 | (2918, 3491, 232, 232) |
| `coffee` | Coffee Shop | (3341, 3348) | 92 | (3249, 3256, 184, 184) |
| `park` | Park Entrance | (5184, 3348) | 104 | (5080, 3244, 208, 208) |
| `cashback` | Cashback Vault | (1805, 4682) | 140 | (1665, 4542, 280, 280) |
| `arena` | Future Arena | (7795, 4682) | 160 | (7635, 4522, 320, 320) |

### 2.3 Collision road corridors (L-shaped edges)

`ROAD_WIDTH = 88`. Each edge is two orthogonal segments.

| Road ID | From → To | Leg | Direction | Segment length | Collision rect (x, y, w, h) |
|---------|-----------|-----|-----------|----------------|----------------------------|
| R01 | fountain → notice | 1 | horizontal E | 154 px | (3604, 3088, 242, 88) |
| R02 | fountain → notice | 2 | vertical N | 389 px | (3758, 2699, 88, 477) |
| R03 | fountain → bridge | 1 | horizontal E | 653 px | (3604, 3088, 741, 88) |
| R04 | fountain → bridge | 2 | vertical N | 259 px | (4257, 2829, 88, 347) |
| R05 | fountain → coffee | 1 | horizontal W | 307 px | (3297, 3088, 395, 88) |
| R06 | fountain → coffee | 2 | vertical S | 216 px | (3297, 3088, 88, 304) |
| R07 | fountain → whale | 1 | horizontal E | 653 px | (3604, 3088, 741, 88) |
| R08 | fountain → whale | 2 | vertical S | 259 px | (4257, 3088, 88, 347) |
| R09 | notice → market | 1 | horizontal E | 768 px | (3758, 2699, 856, 88) |
| R10 | notice → market | 2 | vertical N | 259 px | (4526, 2440, 88, 347) |
| R11 | notice → bridge | 1 | horizontal E | 499 px | (3758, 2699, 587, 88) |
| R12 | notice → bridge | 2 | vertical S | 130 px | (4257, 2699, 88, 218) |
| R13 | bridge → alpha | 1 | horizontal E | 768 px | (4257, 2829, 856, 88) |
| R14 | bridge → alpha | 2 | vertical S | 43 px | (5025, 2829, 88, 131) |
| R15 | bridge → whale | 1 | vertical S | 518 px | (4257, 2829, 88, 606) |
| R16 | whale → park | 1 | horizontal E | 883 px | (4257, 3347, 971, 88) |
| R17 | whale → park | 2 | vertical N | 43 px | (5140, 3304, 88, 131) |
| R18 | coffee → fame | 1 | horizontal W | 307 px | (2990, 3304, 395, 88) |
| R19 | coffee → fame | 2 | vertical S | 259 px | (2990, 3304, 88, 347) |
| R20 | alpha → park | 1 | vertical S | 432 px | (5025, 2872, 88, 520) |
| R21 | alpha → park | 2 | horizontal E | 115 px | (5025, 3304, 203, 88) |
| R22 | market → alpha | 1 | horizontal E | 499 px | (4526, 2440, 587, 88) |
| R23 | market → alpha | 2 | vertical S | 432 px | (5025, 2440, 88, 520) |
| R24 | fame → cashback | 1 | vertical S | 1075 px | (2990, 3563, 88, 1163) |
| R25 | fame → cashback | 2 | horizontal W | 1229 px | (1761, 4638, 1317, 88) |
| R26 | cashback → arena | 1 | horizontal E | 5990 px | (1761, 4638, 6078, 88) |
| R27 | park → arena | 1 | vertical S | 1334 px | (5140, 3304, 88, 1422) |
| R28 | park → arena | 2 | horizontal E | 2611 px | (5140, 4638, 2699, 88) |

**Connected roads graph:** Every `ROAD_EDGES` entry in `RoadNetwork.ts` — fully connected from spawn; southern loop via cashback ↔ arena avenue.

### 2.4 Visual south paving (`RoadGenerator`)

| Road ID | Description | Visual rect (x, y, w, h) | Walk lane | Sidewalk |
|---------|-------------|--------------------------|-----------|----------|
| V01 | Fame vertical arm | (2970, 3543, 128, 1203) | 128 px | 14 px |
| V02 | Cashback west leg | (1741, 3543, 1357, 128) | 128 px | 14 px |
| V03 | Park vertical arm | (5120, 3284, 128, 1462) | 128 px | 14 px |
| V04 | Arena east leg | (5120, 4618, 2739, 128) | 128 px | 14 px |
| V05 | Main avenue (cash ↔ arena) | (1741, 4618, 6118, 128) | 128 px | 14 px (dashed centre) |

### 2.5 Distances from Spawn Fountain (straight-line)

| Landmark | Distance |
|----------|----------|
| Coffee Shop | 376 px |
| Notice Board | 418 px |
| Bridge | 702 px |
| Whale Tower | 702 px |
| Hall of Fame | 777 px |
| Meme Market | 1127 px |
| Alpha Lounge | 1437 px |
| Park Entrance | 1551 px |
| Cashback Vault | 2408 px |
| Future Arena | 4427 px |

### 2.6 Recommended redesign lane spec

| Element | Spec |
|---------|------|
| Asphalt colour | `#0a0e12` base, `#121820` wear patches |
| Lane markings | `#243040` edge lines, `#1c2838` centre dashes every 70 px |
| Sidewalk | `#141c24` stone, 20 px wide, gold lamp every 120 px |
| Intersection | 12 px radius corner fillet, warm pool light at plazas |

---

## 3. Building Layout Plan (handcrafted target)

Positions anchor to **current gameplay coordinates**. Width/height are **proposed art footprints** (not yet drawn in hub). Collision remains **road-network only** until building footprints are added.

### 3.1 Hub landmarks

#### Spawn Fountain
| Field | Value |
|-------|-------|
| District | Spawn Plaza |
| Center | (3648, 3132) |
| Proposed footprint | 280 × 280 px (circular basin + 4 lamp posts) |
| Entrance | plaza edge, any approach on road |
| Interaction radius | 110 px |
| Collision box (future) | Circle r=140 at center (decorative only today) |
| Visual | Tiered stone fountain, gold rim, cyan-gold water shimmer, 4 warm lamps |
| Materials | Basalt `#0c1014`, gold trim `#c8902a`, water `#1a3040` |
| Interior | No |
| Press E | REP coin toss reward modal |

#### Meme Market
| Field | Value |
|-------|-------|
| District | Market District |
| Center | (4570, 2484) |
| Footprint | 320 × 240 px (stall row + awning) |
| Entrance / door | (4570, 2628) — `doorFy=0.487` |
| Door radius | 58 px |
| Interaction radius | 120 px |
| Collision (future) | 320×240 rect, door gap 48 px centered south |
| Visual | Open-air market hall, meme banner flags, gold awning stripes |
| Materials | Dark timber `#121820`, canvas `#1a2430`, gold signage |
| Interior | Yes — `meme_market` |
| Press E | Enter interior OR discovery modal if at landmark zone |

#### Hall of Fame
| Field | Value |
|-------|-------|
| District | Hall of Fame District |
| Center | (3034, 3607) |
| Footprint | 300 × 260 px (classical facade + steps) |
| Entrance / door | (3034, 3753) — `doorFy=0.695` |
| Door radius | 62 px |
| Interaction radius | 120 px |
| Visual | Monument steps, pillar facade, gold inscription plaque |
| Interior | Yes — `hall_of_fame` |
| Press E | Leaderboard modal / enter interior at door |

#### Alpha Lounge
| Field | Value |
|-------|-------|
| District | Alpha Lounge District |
| Center | (5069, 2916) |
| Footprint | 280 × 220 px (velvet lounge front) |
| Entrance / door | (5069, 3024) — `doorFy=0.560` |
| Door radius | 56 px |
| Interaction radius | 110 px |
| Visual | Low neon-gold sign, tinted windows, bouncer lamp |
| Interior | Yes — `alpha_lounge` |
| Press E | Social modal / enter interior |

#### Whale Tower
| Field | Value |
|-------|-------|
| District | Whale Tower District |
| Center | (4301, 3391) |
| Footprint | 200 × 360 px (tall watchtower) |
| Entrance | South base plaza (no interior) |
| Interaction radius | 120 px |
| Visual | Slim tower, whale weather vane, gold radar dish glow |
| Interior | No |
| Press E | Whale alert modal |

#### Coffee Shop
| Field | Value |
|-------|-------|
| District | Hall of Fame District (west spur) |
| Center | (3341, 3348) |
| Footprint | 200 × 180 px |
| Entrance / door | (3341, 3424) — `doorFy=0.634` |
| Door radius | 54 px |
| Interaction radius | 90 px |
| Visual | Cozy corner shop, warm window glow, coffee sign |
| Interior | Yes — `coffee_shop` |
| Press E | Rest flavor modal / enter interior |

#### Park Entrance
| Field | Value |
|-------|-------|
| District | Park / Bridge Area |
| Center | (5184, 3348) |
| Footprint | 240 × 160 px (arch + gate) |
| Entrance | Arch opening north into park zone |
| Interaction radius | 100 px |
| Visual | Iron gate arch, bushes, path into dark-green park |
| Interior | No |
| Press E | Scenic flavor text (future ambient) |

#### Bridge
| Field | Value |
|-------|-------|
| District | Park / Bridge Area |
| Center | (4301, 2873) |
| Footprint | 360 × 120 px (spanning void/water) |
| Entrance | Road deck center |
| Interaction radius | 100 px |
| Visual | Stone arch bridge, gold lanterns, river below `#060a10` |
| Interior | No |
| Press E | Travel modal |

#### Notice Board
| Field | Value |
|-------|-------|
| District | Spawn Plaza (north spur) |
| Center | (3802, 2743) |
| Footprint | 120 × 100 px |
| Interaction radius | 90 px |
| Visual | Wooden board, pinned notices, gold frame |
| Interior | No |
| Press E | Notice / events modal |

### 3.2 Southern districts (procedural placeholders today)

#### Cashback Building (Holder Cashback Vault)
| Field | Value |
|-------|-------|
| District | Cashback Holder District |
| Center | (1805, 4682) |
| Current drawn vault | 210 × 170 px + 6 surround blocks |
| Plate | 760 × 520 px |
| Entrance / door | (1805, 4768) — `doorFy=0.883` |
| Door radius | 70 px |
| Interaction radius | 130 px |
| Visual | Vault facade, barred windows, lock icon, gold pillars |
| Interior | Locked — `cashback_vault` |
| Press E | Locked message (holder perks) |

#### PvP Arena (Future Arena)
| Field | Value |
|-------|-------|
| District | Arena District |
| Center | (7795, 4682) |
| Current drawn arena | 310 × 250 px + 8 surround blocks |
| Plate | 1080 × 660 px |
| Entrance / door | (7795, 4795) — `doorFy=0.888` |
| Door radius | 72 px |
| Interaction radius | 140 px |
| Visual | Octagonal arena shell, gold pillars, coming-soon banners |
| Interior | Coming soon — `future_arena` |
| Press E | Coming soon modal |

### 3.3 Future / locked

#### NFT / Shop District (planned)
| Field | Value |
|-------|-------|
| District | Future Expansion Zone |
| Proposed center | (6200, 2600) — east of hub, not yet in `WorldObjects` |
| Footprint | 400 × 300 px cluster |
| Status | Locked — add `WorldObjects` entry when ready |
| Press E | TBD shop/NFT modal |

#### Future Locked Buildings (generic pads)
| ID | Proposed position | Size | Label |
|----|-------------------|------|-------|
| `locked-east-1` | (6800, 3200) | 180×200 | "Coming Soon" |
| `locked-north-1` | (4200, 1800) | 200×180 | "Expansion" |
| `locked-west-1` | (1400, 3000) | 180×200 | "Restricted" |

---

## 4. District Design

### 4.1 Spawn Plaza
| Attribute | Spec |
|-----------|------|
| Boundaries | x: 3200–4100, y: 2850–3400 (approx) |
| Mood | Warm, welcoming, busy spawn |
| Props | Fountain, 6 lamps, 4 benches, notice spur north |
| Lighting | Gold plaza pools, soft amber `#e8b84b` at 40% |
| Roads | R01–R08 hub |
| Landmark | Spawn Fountain |
| Player path | Spawn → notice/market/bridge/coffee |

### 4.2 Market District
| Boundaries | x: 4300–4900, y: 2200–2700 |
| Mood | Chaotic bazaar, meme energy |
| Props | Stalls, banners, crates (handcrafted, not grid) |
| Lighting | Brighter gold signs, flicker accents |
| Roads | R09–R10, R22–R23 |
| Landmark | Meme Market |
| Path | Notice → market → alpha |

### 4.3 Alpha Lounge District
| Boundaries | x: 4900–5400, y: 2700–3100 |
| Mood | Exclusive, low-lit VIP |
| Props | Rope posts, velvet awning, single bouncer lamp |
| Lighting | Dim warm interior glow through windows |
| Roads | R13–R14, R20–R21, R22–R23 |
| Landmark | Alpha Lounge |
| Path | Bridge → alpha → park |

### 4.4 Whale Tower District
| Boundaries | x: 4100–4600, y: 3200–3600 |
| Mood | Watchful, alert |
| Props | Tower base, antenna, spotlight |
| Lighting | Cool gold top beacon |
| Roads | R07–R08, R15–R17 |
| Landmark | Whale Tower |
| Path | Fountain → whale → park |

### 4.5 Hall of Fame District
| Boundaries | x: 2800–3500, y: 3200–3800 |
| Mood | Monumental, reverent |
| Props | Steps, statues (2), coffee shop annex |
| Lighting | Uplights on facade |
| Roads | R05–R06, R18–R19, R24 |
| Landmark | Hall of Fame + Coffee Shop |
| Path | Coffee → fame → cashback south arm |

### 4.6 Park / Bridge Area
| Boundaries | x: 4000–5600, y: 2700–3500 |
| Mood | Transition, scenic |
| Props | Bridge deck, park gate, trees (dark silhouettes) |
| Lighting | Lanterns on bridge |
| Roads | R03–R04, R11–R17, R20–R21 |
| Landmarks | Bridge, Park Entrance |
| Path | Bridge ↔ alpha ↔ park |

### 4.7 Arena District
| Boundaries | x: 7200–8400, y: 4300–5050 |
| Mood | Gladiatorial, hype |
| Props | Arena shell, banners, rock clusters |
| Lighting | Gold accent bands, spotlights (static) |
| Roads | R26–R28, V03–V05 |
| Landmark | Future Arena |
| Path | Park south arm → arena |

### 4.8 Cashback Holder District
| Boundaries | x: 1200–2400, y: 4300–5050 |
| Mood | Secure, gated wealth |
| Props | Vault, fences, lock icons |
| Lighting | Cold gold security lamps |
| Roads | R24–R26, V01–V02, V05 |
| Landmark | Holder Cashback Vault |
| Path | Fame south → cashback → main avenue |

### 4.9 Future Expansion Zone
| Boundaries | x: 5600–9200, y: 1200–4200 (non-road voids) |
| Mood | Under construction |
| Props | Fences, cones, "Expansion" signs |
| Lighting | Sparse work lamps |
| Roads | Spur stubs only when features ship |
| Landmark | NFT/Shop (planned) |
| Path | Blocked by fences until unlocked |

---

## 5. Empty Space Cleanup

After filler removal, non-road areas are **dark ground** (`#04080c` gradient). Label zones for design:

| Zone | Bounds (approx) | Label | Treatment |
|------|-----------------|-------|-----------|
| North void | y: 0–2100, x: 120–9480 | **fenced boundary** | 120 px world-edge wall + inner fence |
| West void | x: 120–2600, y: 1200–4200 | **future expansion** | Bush/wall blockers |
| East void | x: 6000–9480, y: 1200–4200 | **future expansion** | Fence + construction signs |
| South mid-band | y: 3900–4300 between hub and districts | **park / river** | Proposed water channel under bridge |
| Under bridge | (4100–4500, 2950–3050) | **water/river** | Dark water strip 80 px wide |
| SW wild | x: 120–1600, y: 120–2000 | **mountain/wall** | Cliff silhouette |
| NE wild | x: 8400–9480, y: 120–2000 | **mountain/wall** | Cliff silhouette |
| Hub interiors (non-road) | Between plazas | **blocked area** | Building footprints (future art) |
| Arena/Cashback plates | District plates | **construction zone** | Keep plates until final art |

**Intentional empty:** World edge 120 px barrier (`DecorationGenerator.drawEdgeBarriers`). Do not leave raw black void visible at camera clamp — always show ground texture or fence.

---

## 6. Visual Redesign Rules

| Rule | Detail |
|------|--------|
| Palette | **Dark + gold only** — no purple |
| Roads | Black asphalt `#0a0e12`, subtle wear |
| Buildings | Faces `#0c1418`–`#182028`, gold trim `#c8902a` |
| Windows | Gold-lit `#e8b84b` at 15–25% alpha |
| Lamps | Warm point lights, 120 px spacing |
| Edges | Fenced/walled — never open void |
| Blockers | Bushes `#0a1810`, stone walls `#101820` |
| District identity | Unique silhouette per district — **no repeated rectangle grids** |
| NPCs / player | Existing humanoid renderer (dark coat, gold accents) |

---

## 7. Minimap Update

After hub placeholder implementation, minimap data (`WorldMinimapData`) contains:

| Layer | Source | Contents |
|-------|--------|----------|
| `roads` | `RoadGenerator` | **Full hub network** (all `ROAD_NODES` plazas + `ROAD_EDGES` corridors) + south avenue |
| `districts` | `BuildingGenerator` | `cashback` + `arena` plates |
| `buildings` | `HubLandmarks.ts` | 15 unique footprint rects (hub + expansion pads) |

**Removed:** Filler grid blocks. **Added:** Hub road registration, per-landmark `minimapTint` classes in `game.css`.

---

## 11. Hub Placeholder Implementation (July 2026)

Handcrafted silhouettes live in `src/game/worldEngine/HubLandmarks.ts`.

| Landmark | Centre (x,y) | Footprint | Draw offset (ox, oy) |
|----------|--------------|-----------|----------------------|
| Spawn Fountain | 3648, 3132 | 280×280 | 0, 0 |
| Notice Board | 3802, 2743 | 120×100 | 0, -55 |
| Meme Market | 4570, 2484 | 320×240 | 0, -90 |
| Bridge | 4301, 2873 | 360×120 | 0, -30 |
| Alpha Lounge | 5069, 2916 | 280×220 | 0, 75 |
| Whale Tower | 4301, 3391 | 200×360 | 95, 0 |
| Hall of Fame | 3034, 3607 | 300×260 | 0, 95 |
| Coffee Shop | 3341, 3348 | 200×180 | -75, 20 |
| Park Entrance | 5184, 3348 | 240×160 | 0, 70 |
| Cashback Vault | 1805, 4682 | 210×170 | 0, -30 |
| Future Arena | 7795, 4682 | 310×250 | 0, -25 |
| NFT / Shop | 6200, 2600 | 400×300 | 0, 0 |
| Locked east | 6800, 3200 | 180×200 | 0, 0 |
| Locked north | 4200, 1800 | 200×180 | 0, 0 |
| Locked west | 1400, 3000 | 180×200 | 0, 0 |

**Coordinates unchanged** from §3 — only visual `ox`/`oy` offsets shift art off road centres.  
**Preview:** `docs/hub-placeholder-preview.svg` (top-down layout diagram).

**Labels:** `BuildingSystem` shows names within 120 px, fades by 200 px, hidden beyond. Mission zones stay visible to 300 px.

---

## 8. Deliverables Checklist

- [x] Remove Midjourney image from live world
- [x] Remove procedural filler buildings
- [x] Keep all gameplay systems
- [x] Update minimap (no filler blocks)
- [x] This measurement + design spec document
- [ ] Future: handcrafted hub art pass
- [ ] Future: register hub buildings on minimap
- [ ] Future: optional full-map image layer

---

## 9. Future Full-Map Image Recommendation

When ready to paint one authoritative map image:

| Property | Value |
|----------|-------|
| **Recommended size** | **9600 × 5400 px** (1:1 world coordinates) |
| **Alternative** | **4800 × 2700 px** (@2× export workflow) |
| **Format** | PNG-24 or WebP lossless |
| **Anchor point** | Spawn fountain at **(3648, 3132)** = **38%, 58%** of image |
| **Placement in Phaser** | `scene.add.image(0, 0, 'rugtown-map').setOrigin(0, 0).setDepth(0)` — top-left at world (0,0) |
| **File path** | `public/assets/backgrounds/rugtown-world-map.png` (new name; do not reuse old Midjourney asset blindly) |
| **Layer order** | depth 0 = map image, depth -1 = roads (if drawn separately), depth 1+ = buildings/props |

**Design grid:** 220 px subtle grid matches current `RoadGenerator` ground texture for alignment checks.

**Safe zone:** Keep all walkable roads/plazas clear of opaque building pixels — collision is code-driven, art is cosmetic unless footprint system is added.

---

## 10. Proposed Final Map Layout Table

| # | Feature | District | Center (x,y) | Size (w×h) | Interior | E action |
|---|---------|----------|--------------|------------|----------|----------|
| 1 | Spawn Fountain | Spawn Plaza | 3648, 3132 | 280×280 | No | REP reward |
| 2 | Notice Board | Spawn Plaza | 3802, 2743 | 120×100 | No | Notice modal |
| 3 | Meme Market | Market | 4570, 2484 | 320×240 | Yes | Enter / discovery |
| 4 | Bridge | Park/Bridge | 4301, 2873 | 360×120 | No | Travel modal |
| 5 | Alpha Lounge | Alpha | 5069, 2916 | 280×220 | Yes | Enter / social |
| 6 | Whale Tower | Whale | 4301, 3391 | 200×360 | No | Whale alert |
| 7 | Coffee Shop | Hall of Fame | 3341, 3348 | 200×180 | Yes | Enter / rest |
| 8 | Hall of Fame | Hall of Fame | 3034, 3607 | 300×260 | Yes | Enter / leaderboard |
| 9 | Park Entrance | Park/Bridge | 5184, 3348 | 240×160 | No | Scenic |
| 10 | Cashback Vault | Cashback | 1805, 4682 | 210×170 | Locked | Locked message |
| 11 | PvP Arena | Arena | 7795, 4682 | 310×250 | Soon | Coming soon |
| 12 | NFT/Shop | Expansion | 6200, 2600 | 400×300 | TBD | TBD |
| 13–15 | Locked pads | Expansion | see §3.3 | 180×200 | No | Blocked |

---

*Generated from live code constants in `WorldScene`, `RoadNetwork`, `WorldObjects`, `EnterableBuildings`, `DistrictGenerator`, `RoadGenerator`, `BuildingGenerator`.*
