# RugTown — World Asset Visual QA Report (Phase 5)

**Date:** July 2026  
**Manifest version:** `1.1-qa`  
**Placements:** **145** (was 147 — 2 clutter stalls removed)  
**Audit tool:** `node scripts/audit-world-asset-placements.mjs`

---

## Executive Summary

All **145** manifest assets load and render. Phase 5 applied **scale**, **depth**, and **position** patches for landmark readability and prop road clearance. Four in-game debug overlays were added for ongoing visual QA.

| Metric | Before QA | After QA |
|--------|-----------|----------|
| Manifest placements | 147 | **145** |
| Props overlapping road corridors (audit) | 56 | **39** |
| Undersized landmarks (scale &lt; 0.55) | 2 | **0** |
| Duplicate prop clusters (&lt; 40 px, same sprite) | 0 | **0** |
| Missing asset paths | 0 | **0** |

Remaining audit “road overlaps” are **expected** for landmarks centered on plazas (fountain, bridge deck, vault, arena) and plaza-edge props — walk collision is unchanged.

---

## 1. Screenshot Checklist (per district)

Capture at **zoom 0.6**, spawn **(3648, 3132)**. Enable debug overlays from Settings while shooting QA frames.

| # | District | Camera target (x, y) | What to verify |
|---|----------|----------------------|----------------|
| 1 | **Spawn Plaza** | 3648, 3132 | Fountain readable at scale 1.05; perimeter lamps off walk arms; benches outside plaza ring |
| 2 | **Notice spur** | 3802, 2720 | Notice board scale 0.58 (was 0.42); north of R01 without crushing road |
| 3 | **Meme Market** | 4570, 2420 | Main hall scale 1.08; stall row north of R09/R10; no auction stall clutter on road |
| 4 | **Bridge** | 4301, 2860 | Bridge scale 0.68; deck spans corridor; hanging lanterns north of deck |
| 5 | **Alpha Lounge** | 5069, 2920 | Building south of node; VIP lamp north of R13 |
| 6 | **Whale Tower** | 4350, 3320 | Tower east of R15 vertical; fences east/south of walk mesh |
| 7 | **Hall of Fame** | 3034, 3580 | Hall scale 1.12; stairs/banners off south door lane; courtyard props symmetric |
| 8 | **Coffee spur** | 3341, 3320 | Coffee shop west of R05/R06 junction |
| 9 | **Park gate** | 5184, 3320 | Arch + flanking trees off R16 east arm |
| 10 | **Cashback Vault** | 1805, 4660 | Vault on plaza; barrels south of R26 avenue |
| 11 | **Future Arena** | 7795, 4660 | Arena scale 1.12; perimeter props south of main avenue |
| 12 | **NFT District** | 6200, 2580 | Gallery + stalls in expansion zone |
| 13 | **Hub crossroads** | 4301, 3080 | Roads visible under/over assets; player walks through plazas |
| 14 | **Debug overlay** | spawn | Bounds (gold/green), anchors (dots), road clearance (green), player depth (pink) |

---

## 2. Issues Found

### 2.1 Asset overlap

| Issue | Severity | Status |
|-------|----------|--------|
| Market stall row overlapping R09/R10 (notice→market) | High | **Fixed** — stalls shifted −95 px Y, east stalls −90 px X |
| Whale fence/props on R15 vertical (bridge→whale) | Medium | **Fixed** — props moved west/east |
| Spawn perimeter lamps on R05/R07 arms | Medium | **Fixed** — moved to plaza edge |
| Two auction stalls redundant + road-blocking | Low | **Removed** (`env-mkt-stall-9`, `env-mkt-stall-10`) |
| Landmark footprints intersect plaza roads (fountain, bridge, etc.) | Info | **Accepted** — intentional plaza anchoring |

### 2.2 Depth sorting

| Issue | Severity | Status |
|-------|----------|--------|
| Bridge deck below road paint at depth 1.12 | Medium | **Fixed** → depth **1.18** |
| Fountain/HOF landmarks compete with props at same band | Low | **Fixed** — fountain 1.48, HOF 1.52 |
| Player (depth 10) always above world assets (1.1–1.5) | Info | **Correct** — no change |

### 2.3 Assets covering roads (visual)

| Issue | Severity | Status |
|-------|----------|--------|
| Props visually sitting on asphalt (56 audit hits) | High | **Reduced to 39** — props moved; landmarks exempt |
| Southern avenue barrels (R26) | Medium | **Fixed** — +70–75 px Y for arena/cashback props |
| Bridge hanging lanterns on deck centerline | Low | **Fixed** — moved north to y=2798 |

### 2.4 Scale too small / too large

| Asset | Was | Now | Reason |
|-------|-----|-----|--------|
| Notice board | 0.42 | **0.58** | Unreadable at hub distance |
| Main bridge | 0.52 | **0.68** | Deck too small vs road width |
| Spawn fountain | 0.99 | **1.05** | Landmark focal point |
| Meme Market hall | 1.03 | **1.08** | Bazaar anchor |
| Hall of Fame | 1.06 | **1.12** | Monument prominence |
| Whale Tower | 0.71 | **0.78** | Tall silhouette |
| Future Arena | 1.08 | **1.12** | Southern district anchor |

### 2.5 Props floating / misaligned

| Issue | Status |
|-------|--------|
| Props use origin (0.5, 1) ground contact | **Correct** |
| Buildings use origin (0.5, 0.5) footprint center | **Correct** |
| Procedural SVG props have transparent padding — minor float at curb | **Known** — acceptable for V1 kit |

### 2.6 Repeated props

| Issue | Status |
|-------|--------|
| Duplicate sprites within 40 px | **None detected** |
| Visually similar plaza lanterns (short × 4) | **Accepted** — spawn symmetry intentional |
| Two bridge hanging-lantern-triple | **Accepted** — east/west bridge symmetry |

### 2.7 Landmark readability

| Landmark | Issue | Fix |
|----------|-------|-----|
| Notice board | Too small | Scale 0.58 |
| Bridge | Lost in crossroads | Scale 0.68 + depth bump |
| Fountain | Slightly undersized | Scale 1.05 |
| Hall of Fame | Competed with courtyard props | Scale + depth 1.52 |
| Market | Stalls obscured hall | Stalls north + removed 2 auction stalls |

### 2.8 Performance

| Topic | Notes |
|-------|-------|
| **Sprites** | 145 `Image` objects — lightweight vs prior Graphics districts |
| **Textures** | 118 unique PNG paths, 145 texture keys — acceptable for desktop |
| **Debug overlays** | Graphics redraw on toggle only; player depth label updates each frame when enabled |
| **Load** | Preload queues 118 images in `preload()` — ~2–4 s on first visit; cached after |
| **Recommendation** | Future: texture atlas per district if mobile perf needed |

---

## 3. Debug Helpers Added

Available in **Settings → Visual QA** (GamePage):

| Toggle | Registry key | Visual |
|--------|--------------|--------|
| **Asset Bounds** | `assetBoundsDebug` | Gold building rects, green prop rects |
| **Asset Anchors** | `assetAnchorsDebug` | Crosshair at manifest (x, y) anchor |
| **Road Clearance Overlay** | `assetRoadDebug` | Green road corridors + 12 px margin (matches audit) |
| **Player Depth Layer** | `assetPlayerDepthDebug` | Pink ring + `player depth 10` label following player |

Implementation: `WorldAssetLoader.ts` + `WorldScene` public setters.

---

## 4. Fixes Applied

### Manifest (`scripts/generate-world-placement-manifest.mjs` — Phase 5 QA block)

- Landmark scale/depth bumps (7 buildings)
- Spawn prop repositioning (8 entries)
- Market stall row shift + east stall west nudge (10 stalls)
- Removed `env-mkt-stall-9`, `env-mkt-stall-10`
- Whale / bridge / park / HOF / arena / cashback prop moves
- Support buildings `bld-005`, `bld-006`, `bld-011`, `bld-016` nudged

### Code

- `WorldAssetLoader.ts` — anchor, road, player depth debug layers
- `WorldScene.ts` — debug setters + player depth update in game loop
- `GamePage.tsx` — four settings toggles
- `scripts/audit-world-asset-placements.mjs` — automated road overlap audit

---

## 5. Systems Unchanged (verified)

- World size 9600×5400  
- `RoadNetwork` / `CollisionSystem`  
- Player movement, NPCs, HUD, missions, interiors, wallet  
- Minimap registration (`registerHubLandmarksMinimap`)  
- `RoadGenerator` visuals  

---

## 6. Screenshot Instructions

1. `npm run dev` (syncs assets via `predev`).
2. Enter world; open **Settings** (gear icon).
3. For each district in §1, pan camera to target coordinates (minimap helps).
4. Capture screenshots **without** debug overlays first (clean pass).
5. Enable all four Visual QA toggles; recapture spawn + market + bridge (debug pass).
6. Optional: enable **Collision Debug** alongside road overlay to compare walk mesh vs visual roads.
7. Save as `docs/qa-screenshots/phase5-{district}.png` (folder optional).

**Console check:**  
`[WorldAssetLoader] Rendered 145/145 placements`

---

## 7. Regeneration Workflow

```bash
node scripts/generate-world-placement-manifest.mjs   # applies QA patches
node scripts/sync-world-assets.mjs                   # → public + src/game/data
node scripts/audit-world-asset-placements.mjs        # road overlap report
npm run dev
```

---

## 8. Known Remaining Items (non-blocking)

1. **39 audit road intersections** — mostly plaza-centered landmarks; not walk blockers.
2. **Environment kit art** — procedural SVG style; future painted pass may replace props without coordinate changes.
3. **Government Quarter / Trading Academy** — support buildings only; no `WorldObjects` entry yet.
4. **NFT district** — planned landmark; interaction not wired.
5. **Purple accents** on some building sheet cells — recolor in art pass if visible at gameplay zoom.

---

## 9. File Index

| File | Role |
|------|------|
| `docs/WORLD_ASSET_QA_REPORT.md` | This report |
| `docs/rugtown-world-placement-manifest.json` | Source manifest v1.1-qa |
| `src/game/data/world-placement-manifest.json` | Runtime copy |
| `scripts/audit-world-asset-placements.mjs` | Automated overlap audit |
| `src/game/worldEngine/WorldAssetLoader.ts` | Render + debug overlays |
