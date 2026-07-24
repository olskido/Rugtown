# RugTown — World Asset Placement Plan (Phase 3)

**Status:** Planning only — **no assets placed in game yet**  
**Date:** July 2026  
**World:** 9600 × 5400 px · Spawn **(3648, 3132)**

This document defines how to replace Phaser-drawn placeholder buildings and props with image assets from:

| Source                           | Path                                                |
| -------------------------------- | --------------------------------------------------- |
| Master concept (style reference) | `docs/RugTown_Master_Concept_V1.png`                |
| Building sheet                   | `docs/rugtown-building-asset-sheet-v1.png`          |
| Sliced buildings                 | `docs/building-assets-v1/`                          |
| Environment kit                  | `docs/environment-kit-v1/`                          |
| Environment metadata             | `docs/environment-kit-v1/environment-manifest.json` |
| Coordinate blueprint             | `docs/rugtown-art-blueprint-9600x5400.svg`          |
| Measurements                     | `docs/MAP_MEASUREMENT_DESIGN_SPEC.md`               |

**Machine-readable placements:** `docs/rugtown-world-placement-manifest.json` (147 entries: 20 buildings + 127 props)

Regenerate manifest: `node scripts/generate-world-placement-manifest.mjs`

---

## 1. Art Review Summary

### Building Asset Pack V1

- **20 buildings** on a 5×4 grid (307×256 px cells, ~12 px trim before placement).
- **Perspective:** 3/4 isometric top-down hybrid — matches environment kit.
- **Palette:** Black obsidian, dark stone, bronze roofs, gold trim, warm window glow.
- **Landmark mapping:** 12 buildings map directly to live `WorldObjects` / blueprint nodes; 8 are district support or expansion fillers.
- **Note:** Government Quarter and Trading Academy cells may carry purple banner accents from V1 sheet — recolor to gold/bronze before final in-game load if still visible at scale.

### Environment Kit V1

- **164 transparent PNG props** across 17 categories.
- Procedural SVG-derived art — suitable for decoration; landmarks remain building-pack sprites.
- Consistent `recommendedScale`, `recommendedDepth`, and `collisionRecommendation` per asset in `environment-manifest.json`.

### Blueprint Alignment

All landmark centres in this plan match `rugtown-art-blueprint-9600x5400.svg` and `HubLandmarks.ts` / `WorldObjects.ts`:

| Node           | Centre (x, y) | Plaza radius |
| -------------- | ------------- | ------------ |
| Spawn Fountain | 3648, 3132    | 165          |
| Notice Board   | 3802, 2743    | 92           |
| Meme Market    | 4570, 2484    | 112          |
| Bridge         | 4301, 2873    | 100          |
| Alpha Lounge   | 5069, 2916    | 104          |
| Whale Tower    | 4301, 3391    | 112          |
| Hall of Fame   | 3034, 3607    | 116          |
| Coffee Shop    | 3341, 3348    | 92           |
| Park Entrance  | 5184, 3348    | 104          |
| Cashback Vault | 1805, 4682    | 140          |
| Future Arena   | 7795, 4682    | 160          |
| NFT / Shop     | 6200, 2600    | — (planned)  |

---

## 2. Implementation Strategy

### Phase 3A — Asset loader (future code pass)

1. Add `WorldAssetLoader` that reads `rugtown-world-placement-manifest.json`.
2. Preload building + environment PNGs from `docs/` (or copy to `public/assets/world/`).
3. Spawn `Phaser.GameObjects.Image` per entry with manifest `scale`, `depth`, and origin at footprint centre (buildings) or ground contact (props).
4. Register minimap footprints from manifest instead of `HubLandmarks` rects.
5. **Do not** change `WorldObjects` centres, interaction radii, or door positions.

### Phase 3B — Remove placeholders

After sprites render correctly, delete procedural drawing listed in §8.

### Anchor convention

| Kind     | Anchor           | Position                                               |
| -------- | ---------------- | ------------------------------------------------------ |
| Building | Footprint centre | `(cx + ox, cy + oy)` from `HUB_LANDMARK_SPECS`         |
| Prop     | Ground contact   | Exact coordinates from district prop tables / manifest |
| Bridge   | Footprint centre | Align deck with road corridor R03/R04/R11/R15          |

### Scale formula

```
scale = min(footprintW / 283, footprintH / 232)
```

Where 283×232 = cell size minus 12 px trim per side (`rugtown-building-asset-sheet-v1.json`).

### Depth layers (Phaser depth values)

| Layer            | Depth          | Contents                                  |
| ---------------- | -------------- | ----------------------------------------- |
| District ground  | −1.88 to −1.72 | Terrain plates (keep until baked into bg) |
| Roads            | −0.94          | `RoadGenerator` — **untouched**           |
| Bridge deck      | 1.10–1.12      | Main bridge sprite                        |
| Props            | 1.24–1.32      | Benches, barrels, bushes                  |
| Buildings        | 1.40–1.50      | Landmarks + support structures            |
| Banners / detail | 1.50–1.54      | Flags, urns, hanging lanterns             |

Use `depth + y * 0.0001` for prop Y-sorting within a band.

---

## 3. Building Asset → Landmark Mapping

### 3.1 Primary landmarks

| Asset file                     | Building name         | gameId   | District | Position (x, y) | Offset (ox, oy) | Footprint | Scale | Depth | Collision  |
| ------------------------------ | --------------------- | -------- | -------- | --------------- | --------------- | --------- | ----- | ----- | ---------- |
| `01-spawn-fountain.png`        | Spawn Fountain        | fountain | spawn    | 3648, 3132      | 0, 0            | 280×280   | 0.99  | 1.45  | none       |
| `18-notice-board.png`          | Notice Board          | notice   | spawn    | 3802, 2743      | 0, −55          | 120×100   | 0.43  | 1.42  | none       |
| `04-meme-market-main-hall.png` | Meme Market Main Hall | market   | market   | 4570, 2484      | 0, −90          | 320×240   | 1.03  | 1.44  | door-gap   |
| `20-main-bridge.png`           | Main Bridge           | bridge   | bridge   | 4301, 2873      | 0, −30          | 360×120   | 0.52  | 1.12  | none       |
| `07-alpha-lounge.png`          | Alpha Lounge          | alpha    | alpha    | 5069, 2916      | 0, 75           | 280×220   | 1.03  | 1.43  | door-gap   |
| `10-whale-tower.png`           | Whale Tower           | whale    | whale    | 4301, 3391      | 95, 0           | 200×360   | 0.71  | 1.48  | soft-block |
| `02-hall-of-fame.png`          | Hall of Fame          | fame     | fame     | 3034, 3607      | 0, 95           | 300×260   | 1.06  | 1.50  | door-gap   |
| `17-coffee-shop.png`           | Coffee Shop           | coffee   | fame     | 3341, 3348      | −75, 20         | 200×180   | 0.78  | 1.41  | door-gap   |
| `19-park-entrance-gate.png`    | Park Entrance Gate    | park     | park     | 5184, 3348      | 0, 70           | 240×160   | 0.85  | 1.40  | none       |
| `13-cashback-vault.png`        | Cashback Vault        | cashback | cashback | 1805, 4682      | 0, −30          | 210×170   | 0.74  | 1.46  | door-gap   |
| `15-arena.png`                 | Arena                 | arena    | arena    | 7795, 4682      | 0, −25          | 310×250   | 1.08  | 1.47  | door-gap   |
| `08-nft-gallery.png`           | NFT Gallery           | nft-shop | nft      | 6200, 2600      | 0, 0            | 400×300   | 1.06  | 1.44  | soft-block |

**Door positions (unchanged — for interaction system):**

| Landmark       | Door (x, y) |
| -------------- | ----------- |
| Meme Market    | 4570, 2628  |
| Alpha Lounge   | 5069, 3024  |
| Hall of Fame   | 3034, 3753  |
| Coffee Shop    | 3341, 3424  |
| Cashback Vault | 1805, 4768  |
| Future Arena   | 7795, 4795  |

### 3.2 Secondary / support buildings

| Asset file                    | District  | Position (x, y) | Scale | Depth | Collision  | Role                           |
| ----------------------------- | --------- | --------------- | ----- | ----- | ---------- | ------------------------------ |
| `05-market-shop.png`          | market    | 4720, 2380      | 0.78  | 1.38  | soft-block | East flank shop                |
| `06-trading-academy.png`      | market    | 4420, 2320      | 0.86  | 1.37  | soft-block | NW annex                       |
| `09-nft-creator-studio.png`   | nft       | 6480, 2680      | 0.78  | 1.36  | soft-block | Creator studio east of gallery |
| `03-government-quarter.png`   | spawn     | 3320, 2980      | 0.85  | 1.35  | soft-block | West civic wing off R05        |
| `11-financial-office.png`     | cashback  | 2100, 4580      | 0.78  | 1.34  | soft-block | East support building          |
| `14-holder-bank.png`          | cashback  | 1580, 4720      | 0.78  | 1.34  | soft-block | West annex                     |
| `16-tournament-hall.png`      | arena     | 7520, 4580      | 0.95  | 1.36  | soft-block | Tournament wing                |
| `12-research-observatory.png` | expansion | 6800, 3200      | 0.78  | 1.33  | soft-block | Replaces `locked-east-1` pad   |

---

## 4. Roads That Must Remain Clear

Collision roads (`RoadNetwork.ts`, `ROAD_WIDTH = 88`) are **sacred**. No building footprint may intersect these rects. Props should stay outside **108 px** from road centreline (88 + 20 margin).

### 4.1 Hub corridors (do not block)

| Road    | Segment rect (x, y, w, h)                 | Notes                     |
| ------- | ----------------------------------------- | ------------------------- |
| R01     | 3604, 3088, 242, 88                       | Fountain → Notice (E)     |
| R02     | 3758, 2699, 88, 477                       | Fountain → Notice (N)     |
| R03–R04 | 3604, 3088, 741, 88 + 4257, 2829, 88, 347 | Fountain → Bridge         |
| R05–R06 | 3297, 3088, 395, 88 + 3297, 3088, 88, 304 | Fountain → Coffee         |
| R07–R08 | 3604, 3088, 741, 88 + 4257, 3088, 88, 347 | Fountain → Whale          |
| R09–R10 | 3758, 2699, 856, 88 + 4526, 2440, 88, 347 | Notice → Market           |
| R11–R12 | 3758, 2699, 587, 88 + 4257, 2699, 88, 218 | Notice → Bridge           |
| R13–R14 | 4257, 2829, 856, 88 + 5025, 2829, 88, 131 | Bridge → Alpha            |
| R15     | 4257, 2829, 88, 606                       | Bridge → Whale (vertical) |
| R16–R17 | 4257, 3347, 971, 88 + 5140, 3304, 88, 131 | Whale → Park              |
| R18–R19 | 2990, 3304, 395, 88 + 2990, 3304, 88, 347 | Coffee → Fame             |
| R20–R21 | 5025, 2872, 88, 520 + 5025, 3304, 203, 88 | Alpha → Park              |
| R22–R23 | 4526, 2440, 587, 88 + 5025, 2440, 88, 520 | Market → Alpha            |

### 4.2 Southern avenue (do not block)

| Road    | Segment rect (x, y, w, h)                   |
| ------- | ------------------------------------------- |
| R24     | 2990, 3563, 88, 1163                        |
| R25     | 1761, 4638, 1317, 88                        |
| R26     | 1761, 4638, 6078, 88                        |
| R27–R28 | 5140, 3304, 88, 1422 + 5140, 4638, 2699, 88 |

### 4.3 Plaza discs (walkable)

Keep building art **outside** plaza radii listed in §1, or use `collisionType: none` for decorative overflow that does not affect walk mesh.

### 4.4 Water strips (visual only)

| Zone             | Bounds               | Asset note                                 |
| ---------------- | -------------------- | ------------------------------------------ |
| Under bridge     | 4100–4500, 2950–3050 | Bridge deck spans; no props in water       |
| South river band | 2800–6800, 3900–4300 | Park/river — trees and rocks on banks only |

---

## 5. District Environment Decoration

### 5.1 Spawn Plaza (bounds 3200–4100, 2850–3400)

**Mood:** Warm welcoming hub · **27 manifest entries**

| Prop type              | Asset examples                                      | Positions (x, y)                                                      | Scale | Depth |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------- | ----- | ----- |
| Perimeter lamps        | `plaza-lantern-short`, `plaza-lantern-tall`         | 3380,2920 · 3915,2925 · 3285,3180 · 4005,3175 · 3520,3360 · 3775,3355 | 1.0   | 1.45  |
| Notice spur lamp       | `wall-lantern-small`                                | 3845, 2685                                                            | 0.9   | 1.45  |
| Fountain braziers      | `bronze-brazier` ×4                                 | 3548,3052 · 3748,3052 · 3548,3212 · 3748,3212                         | 0.85  | 1.46  |
| Benches                | `stone-bench-straight`, `wood-bench-straight`, etc. | 3410,3040 · 3885,3045 · 3465,3275 · 3825,3270                         | 0.95  | 1.28  |
| Planters / bushes      | `planter-01/02`, `bush-cluster-01/02/03`            | 3260,3080 · 4035,3070 · 3580,2895 · 3710,2890 · 3340,3320             | 0.95  | 1.26  |
| Memorial stones        | `street-coin-statue-01/02`                          | 3320,3165 · 3970,3160                                                 | 0.95  | 1.30  |
| Market approach crates | `crate-01/02`                                       | 4010,2975 · 4065,3010                                                 | 0.9   | 1.24  |

**Remove:** `SpawnPlazaDistrict.ts` procedural lamps, benches, planters, fountain, notice, paving (keep road accents until road art pass).

### 5.2 Hall of Fame (bounds 2800–3500, 3200–3800)

**Mood:** Monumental elite · **32 manifest entries**

| Prop type         | Count | Key positions                                                         |
| ----------------- | ----- | --------------------------------------------------------------------- |
| Courtyard trees   | 6     | 2840,3260 · 3460,3265 · 2825,3480 · 3475,3475 · 2910,3785 · 3160,3788 |
| Flower beds       | 4     | 2885,3340 · 3185,3345 · 2860,3680 · 3210,3675                         |
| Approach lanterns | 8     | See `HOF_PROP_POSITIONS.lanterns` in `HallOfFameDistrict.ts`          |
| Stone benches     | 4     | 2905,3565 · 3165,3565 · 2880,3740 · 3188,3740                         |
| Guild banners     | 3     | 2945,3660 · 3123,3660 · 3034,3625                                     |
| Arches            | 2     | 2914,3567 · 3154,3567                                                 |
| Grand stairs      | 1     | 3034, 3720 (`stone-stairs-01`)                                        |
| Trophy urns       | 2     | 2928,3788 · 3140,3788                                                 |

**Keep:** `WorldScene` leaderboard bust offsets at fame centre — separate from environment kit.

**Remove:** Entire `HallOfFameDistrict.ts` graphics pass once sprites load.

### 5.3 Meme Market (bounds 4300–4900, 2200–2700)

**Mood:** Chaotic bazaar · **23 manifest entries**

| Prop type         | Assets                                            | Placement strategy                                                   |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Market stalls ×12 | `food/trader/token/potion/auction/cart-stall-a/b` | Semicircle south of main hall 4380–4700, 2520–2650 — **off R09/R10** |
| Banners ×3        | `decorative-banner-01/02`, `district-banner-01`   | North façade 4420–4530, y≈2410                                       |
| Barrels / crates  | `barrel-01/02`, `crate-03`                        | West approach 4350–4375                                              |
| Hanging lantern   | `hanging-lantern-triple`                          | 4570, 2440 (market node north)                                       |
| Street sign       | `street-sign-01`                                  | 4420, 2460                                                           |

### 5.4 Whale Tower (bounds 4100–4600, 3200–3600)

**Mood:** Watchful alert · **9 manifest entries**

| Prop                  | Position              | Notes            |
| --------------------- | --------------------- | ---------------- |
| `plaza-lantern-grand` | 4220, 3320            | Base beacon      |
| `wall-lantern-ornate` | 4390, 3280            | East wall        |
| Fence sections ×2     | 4180,3380 · 4420,3380 | Tower perimeter  |
| `street-rock-01`      | 4160, 3420            | South watch rock |
| `district-banner-02`  | 4250, 3260            | District flag    |
| `street-sign-02`      | 4280, 3240            | Decorative sign  |
| `bush-cluster-04`     | 4210, 3450            | South shrub      |

Tower sprite shifted **ox=95** east — props cluster west/south of node to clear R07 east arm.

### 5.5 Arena District (bounds 7200–8400, 4300–5050)

**Mood:** Gladiatorial hype · **16 manifest entries**

| Prop                       | Position                          |
| -------------------------- | --------------------------------- |
| Guild / decorative banners | 7680,4520 · 7910,4520 · 7795,4480 |
| Grand plaza lanterns ×2    | 7620,4620 · 7970,4620             |
| Fence sections ×2          | 7550,4750 · 8040,4750             |
| Barrels ×2                 | 7720,4780 · 7868,4780             |
| Crates ×2                  | 7640,4785 · 7945,4785             |
| Rock clusters ×2           | 7580,4700 · 8010,4700             |
| Ceremonial arch            | 7795, 4560                        |

**Remove:** `HubLandmarks.drawArena`, `DistrictGenerator` arena plate grid.

### 5.6 Cashback Vault (bounds 1200–2400, 4300–5050)

**Mood:** Secure gated wealth · **15 manifest entries**

| Prop                | Position              |
| ------------------- | --------------------- |
| Perimeter fences ×2 | 1680,4620 · 1930,4620 |
| Stone walls ×2      | 1650,4550 · 1960,4550 |
| Wall lanterns ×2    | 1720,4500 · 1890,4500 |
| Barrels ×2          | 1740,4780 · 1870,4780 |
| Obelisk + urn       | 1700,4720 · 1910,4720 |
| Coin statue         | 1780, 4560            |
| Ceremonial arch     | 1805, 4520            |

**Remove:** `HubLandmarks.drawCashbackVault`, cashback plate grid, surround blocks.

### 5.7 NFT District (centre 6200, 2600)

**Mood:** Gallery / creator hub · **14 manifest entries**

| Prop                             | Position              |
| -------------------------------- | --------------------- |
| Trader + token stalls            | 6080,2650 · 6320,2680 |
| Banners                          | 6150,2520 · 6250,2510 |
| Gilded + single hanging lanterns | 6200,2540 · 6120,2560 |
| Planters                         | 6050,2720 · 6350,2710 |
| Decorative trees                 | 6020,2620 · 6380,2630 |
| Small fountain                   | 6280, 2580            |
| Fence (expansion edge)           | 5980, 2750            |

### 5.8 Bridge / Park / Alpha (corridor props)

| Asset                       | District | Position              |
| --------------------------- | -------- | --------------------- |
| `hanging-lantern-triple` ×2 | bridge   | 4220,2840 · 4380,2840 |
| `pine-tree-a/b`             | park     | 5120,3280 · 5248,3285 |
| `bush-cluster-05`           | park     | 5088, 3380            |
| `street-rope-coil-01`       | alpha    | 4980, 2980            |
| `wall-lantern-ornate`       | alpha    | 5040, 2860            |

---

## 6. Collision Recommendations

| collisionType | When to use                                          | Implementation note                                          |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `none`        | Lanterns, banners, bridge deck, fountains            | Visual only — road mesh unchanged                            |
| `soft-block`  | Benches, stalls, barrels, trees, fences, whale tower | Optional future `CollisionSystem` rects — **not in Phase 3** |
| `door-gap`    | Enterable landmarks                                  | Future building rect with 48 px south door gap               |
| `block`       | Stone walls (cashback perimeter)                     | Future hard block — defer until building collision pass      |

**Current rule:** Walk collision stays **road-network only** until an explicit building-collision phase is approved.

---

## 7. Systems That Must Remain Untouched

| System                  | File(s)                                 | Reason                               |
| ----------------------- | --------------------------------------- | ------------------------------------ |
| Road collision mesh     | `RoadNetwork.ts`                        | Gameplay walkability                 |
| Road visuals            | `RoadGenerator.ts`                      | Corridor layout locked               |
| World object positions  | `WorldObjects.ts`                       | Interaction zones, doors, radii      |
| Player movement         | `WorldScene.ts`, `HumanoidRenderer.ts`  | Speed, scale, spawn                  |
| Interaction / E prompts | `InteractionSystem.ts`, `WorldScene.ts` | Modal triggers                       |
| Interiors               | `EnterableBuildings.ts`                 | Door teleport targets                |
| NPCs / missions         | `NpcSystem.ts`, mission modules         | Quest flow                           |
| HUD / sidebar / toolbar | `GamePage.tsx`, UI components           | Layout                               |
| Minimap logic           | `WorldMinimapData.ts`, `game.css`       | Registration may update sources only |
| Wallet / holder perks   | Holder logic                            | Cashback lock rules                  |
| World size / spawn      | `DEFAULT_WORLD_W/H`, spawn constants    | 9600×5400, (3648,3132)               |
| Blueprint SVG           | `rugtown-art-blueprint-9600x5400.svg`   | Reference only                       |
| Edge barriers           | `DecorationGenerator.drawEdgeBarriers`  | World boundary fences                |

---

## 8. Phaser Placeholder Drawings to Remove (implementation phase)

Remove **only after** manifest sprites are verified in-game.

### 8.1 `HubLandmarks.ts`

| Drawer              | Landmark id | Replacement asset                                                |
| ------------------- | ----------- | ---------------------------------------------------------------- |
| `drawFountain`      | fountain    | `01-spawn-fountain.png` (already skipped via `DISTRICT_ART_IDS`) |
| `drawNoticeBoard`   | notice      | `18-notice-board.png` (skipped)                                  |
| `drawHallOfFame`    | fame        | `02-hall-of-fame.png` (skipped)                                  |
| `drawMemeMarket`    | market      | `04-meme-market-main-hall.png`                                   |
| `drawBridge`        | bridge      | `20-main-bridge.png`                                             |
| `drawAlphaLounge`   | alpha       | `07-alpha-lounge.png`                                            |
| `drawWhaleTower`    | whale       | `10-whale-tower.png`                                             |
| `drawCoffeeShop`    | coffee      | `17-coffee-shop.png`                                             |
| `drawParkEntrance`  | park        | `19-park-entrance-gate.png`                                      |
| `drawCashbackVault` | cashback    | `13-cashback-vault.png`                                          |
| `drawArena`         | arena       | `15-arena.png`                                                   |
| `drawNftShop`       | nft-shop    | `08-nft-gallery.png`                                             |
| `drawLockedPad`     | locked-\*   | Support buildings or remove pads                                 |

### 8.2 District modules (full file retirement after sprite pass)

| File                    | Replace with                                       |
| ----------------------- | -------------------------------------------------- |
| `SpawnPlazaDistrict.ts` | Manifest spawn entries + fountain/notice buildings |
| `HallOfFameDistrict.ts` | Manifest fame entries + `02-hall-of-fame.png`      |

### 8.3 `DistrictGenerator.ts`

| Drawing                    | Replace with                              |
| -------------------------- | ----------------------------------------- |
| `drawPlate()` for cashback | Cashback vault building + perimeter props |
| `drawPlate()` for arena    | Arena building + district props           |

### 8.4 `DecorationGenerator.ts` (partial)

| Drawing                                    | Action                                 |
| ------------------------------------------ | -------------------------------------- |
| `drawDistrictStreetLights()` in hub bounds | Remove — replaced by manifest lanterns |
| `scatterDistrictProps()` in hub centre     | Reduce radius — props now hand-placed  |
| `drawEdgeBarriers()`                       | **Keep**                               |

### 8.5 `BuildingSystem` labels

Floating text labels may remain temporarily; hide when building art includes readable silhouette distinction.

---

## 9. Minimap Migration Notes

When implementing:

1. Register building footprints from manifest `footprintPx` at each `(x, y)`.
2. Keep `minimapTint` class per `gameId` from existing `HubLandmarks` spec.
3. Roads layer unchanged (`RoadGenerator` already registers full network).

---

## 10. QA Checklist (pre-merge)

- [ ] All 12 primary landmarks visible at blueprint coordinates
- [ ] No building sprite overlaps road collision rects (§4)
- [ ] Door-facing south on enterable landmarks aligns with `WorldObjects` door positions
- [ ] Spawn at (3648, 3132) has clear 360° road exit
- [ ] Bridge deck visually connects R03/R04/R11/R15 corridors
- [ ] Whale tower does not block east road arm (R07)
- [ ] Hall of Fame south approach readable from R18/R19
- [ ] Cashback + Arena southern avenue (R26) fully walkable
- [ ] No purple / neon accents visible at gameplay zoom
- [ ] Depth sorting correct along Y axis in each district
- [ ] Minimap footprints match sprite bounds ±10%

---

## 11. File Index

| Deliverable          | Path                                                |
| -------------------- | --------------------------------------------------- |
| This plan            | `docs/RUGTOWN_WORLD_ASSET_PLACEMENT_PLAN.md`        |
| Placement manifest   | `docs/rugtown-world-placement-manifest.json`        |
| Manifest generator   | `scripts/generate-world-placement-manifest.mjs`     |
| Building metadata    | `docs/rugtown-building-asset-sheet-v1.json`         |
| Environment metadata | `docs/environment-kit-v1/environment-manifest.json` |

**Next step (Phase 4):** Implement `WorldAssetLoader` + swap placeholders per §8 — only after explicit approval to modify game code.
