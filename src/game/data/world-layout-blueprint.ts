/**
 * world-layout-blueprint.ts
 * ─────────────────────────
 * Phase 8B — Compact Social World Rebalance.
 *
 * DATA ONLY. Does not place sprites, change collisions, or alter gameplay.
 *
 * Coordinate authority for LIVE gameplay:
 *   - Interactions / doors / missions → WorldObjects.ts + EnterableBuildings.ts
 *   - Walkability → RoadNetwork.ts (ROAD_WIDTH = 88)
 *   - World size → 3600 × 2400
 *
 * Spring Water (fountain) is the single canonical centre/spawn — unified
 * across WorldScene spawn, WorldObjects fountain, RoadNetwork fountain
 * node, interaction zone, event anchor, minimap anchor, and mission
 * anchor. There is exactly one fountain coordinate now (see `conflicts`).
 *
 * Landmark anchors below are derived from WorldObjects fractional × world
 * size, so this blueprint (and the F9 overlay that reads it) always draws
 * exactly what the player experiences.
 */

export const WORLD_LAYOUT_WIDTH = 3600;
export const WORLD_LAYOUT_HEIGHT = 2400;

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export type RoadCorridorKind = 'primary' | 'secondary';

export interface WorldDistrictBlueprint {
  id: string;
  name: string;
  bounds: WorldRect;
  center: WorldPoint;
  purpose: string;
  /** WorldObject / planned landmark ids that belong in this district. */
  landmarkIds: string[];
  /** NPC dialogue district id when overlapping (NpcDistrictDialogue). */
  dialogueDistrictId?: string;
}

export interface LandmarkZoneBlueprint {
  id: string;
  displayName: string;
  /** Live WorldObject id when one exists. */
  worldObjectId: string | null;
  /** Pixel anchor — from WorldObjects when available. */
  anchor: WorldPoint;
  /** Soft planning pad for future sprite footprint (visual only). */
  zone: WorldRect;
  districtId: string;
  hierarchy: 'primary' | 'secondary' | 'support';
  /** True when coords come from WorldObjects / RoadNetwork. */
  gameplayLocked: boolean;
  notes?: string;
}

export interface RoadCorridorBlueprint {
  id: string;
  kind: RoadCorridorKind;
  /** RoadNetwork edge endpoints when mirroring live walkable edges. */
  fromNodeId?: string;
  toNodeId?: string;
  /** Polyline in world pixels (L-shaped corridors use 3 points). */
  points: WorldPoint[];
  notes?: string;
}

export interface NamedRectBlueprint {
  id: string;
  name: string;
  districtId: string;
  bounds: WorldRect;
  notes?: string;
}

export interface WorldLayoutBlueprint {
  version: string;
  worldSize: { width: number; height: number };
  /** Player spawn used by WorldScene (SPAWN_FX/FY) — Spring Water, unified. */
  sceneSpawn: WorldPoint;
  /** Gameplay fountain / plaza from WorldObjects — same point as sceneSpawn. */
  gameplayFountain: WorldPoint;
  districts: WorldDistrictBlueprint[];
  landmarkZones: LandmarkZoneBlueprint[];
  primaryRoads: RoadCorridorBlueprint[];
  secondaryRoads: RoadCorridorBlueprint[];
  plazas: NamedRectBlueprint[];
  residentialBlocks: NamedRectBlueprint[];
  commercialBlocks: NamedRectBlueprint[];
  parkZones: NamedRectBlueprint[];
  reservedOpenSpaces: NamedRectBlueprint[];
  conflicts: string[];
}

/** Convert WorldObjects-style fractions to pixels. */
export function fracToPx(fx: number, fy: number): WorldPoint {
  return {
    x: Math.round(fx * WORLD_LAYOUT_WIDTH),
    y: Math.round(fy * WORLD_LAYOUT_HEIGHT),
  };
}

function rect(x: number, y: number, width: number, height: number): WorldRect {
  return { x, y, width, height };
}

function centerOf(b: WorldRect): WorldPoint {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Live WorldObject fractional positions (gameplay truth) — mirrors WorldObjects.ts. */
const WO = {
  fountain:              { x: 0.500, y: 0.500 },
  notice:                { x: 0.500, y: 0.342 },
  coffee:                { x: 0.409, y: 0.421 },
  fame:                  { x: 0.394, y: 0.160 },
  government:            { x: 0.372, y: 0.308 },
  trading_academy:       { x: 0.193, y: 0.178 },
  whale:                 { x: 0.643, y: 0.193 },
  financial_office:      { x: 0.745, y: 0.192 },
  holder_bank:           { x: 0.840, y: 0.263 },
  research_observatory:  { x: 0.840, y: 0.392 },
  market:                { x: 0.750, y: 0.513 },
  market_shop:           { x: 0.810, y: 0.616 },
  tournament_hall:       { x: 0.849, y: 0.756 },
  arena:                 { x: 0.811, y: 0.864 },
  alpha:                 { x: 0.259, y: 0.597 },
  nft_gallery:           { x: 0.227, y: 0.787 },
  nft_creator_studio:    { x: 0.254, y: 0.868 },
  park:                  { x: 0.389, y: 0.859 },
  bridge:                { x: 0.518, y: 0.811 },
  cashback:              { x: 0.459, y: 0.849 },
} as const;

type LandmarkKey = keyof typeof WO;

const P: Record<LandmarkKey, WorldPoint> = Object.fromEntries(
  (Object.keys(WO) as LandmarkKey[]).map((k) => [k, fracToPx(WO[k].x, WO[k].y)]),
) as Record<LandmarkKey, WorldPoint>;

/** Spring Water — canonical spawn (WorldScene SPAWN_FX=0.5, SPAWN_FY=0.5). */
const SCENE_SPAWN: WorldPoint = P.fountain;

function zoneAround(anchor: WorldPoint, w: number, h: number): WorldRect {
  return rect(anchor.x - w / 2, anchor.y - h / 2, w, h);
}

function lCorridor(
  id: string,
  kind: RoadCorridorKind,
  a: WorldPoint,
  b: WorldPoint,
  corner: 'h' | 'v',
  fromNodeId: string,
  toNodeId: string,
): RoadCorridorBlueprint {
  const mid =
    corner === 'h'
      ? { x: b.x, y: a.y }
      : { x: a.x, y: b.y };
  return {
    id,
    kind,
    fromNodeId,
    toNodeId,
    points: [a, mid, b],
    notes: `Mirrors RoadNetwork edge ${fromNodeId}→${toNodeId} (corner=${corner})`,
  };
}

/* ─── Districts ──────────────────────────────────────────────────────────
   Compact radial sectors around Spring Water. Bounds are soft framing
   rects for the F9 overlay only — walkability is RoadNetwork.ts. */

const DISTRICTS: WorldDistrictBlueprint[] = [
  {
    id: 'civic-core',
    name: 'Civic / Spawn Core',
    bounds: rect(1330, 720, 940, 660),
    center: P.fountain,
    purpose: 'Spring Water plaza — the canonical centre, spawn, and civic orientation point.',
    landmarkIds: ['fountain', 'notice', 'coffee'],
    dialogueDistrictId: 'spawn',
  },
  {
    id: 'prestige-north',
    name: 'Hall of Fame / Prestige North',
    bounds: rect(560, 100, 1220, 700),
    center: P.fame,
    purpose: 'Monumental prestige — Hall of Fame, Government Quarter, Trading Academy.',
    landmarkIds: ['fame', 'government', 'trading_academy'],
    dialogueDistrictId: 'spawn',
  },
  {
    id: 'whale-financial-ne',
    name: 'Whale / Financial Northeast',
    bounds: rect(2180, 80, 1340, 700),
    center: P.whale,
    purpose: 'Finance silhouette — Whale Tower, Financial Office, Holder Bank, Research Observatory.',
    landmarkIds: ['whale', 'financial_office', 'holder_bank', 'research_observatory'],
    dialogueDistrictId: 'whale',
  },
  {
    id: 'meme-market',
    name: 'Meme Market District',
    bounds: rect(2380, 950, 900, 780),
    center: P.market,
    purpose: 'Dense lively commerce — Meme Market Main Hall, Market Shop.',
    landmarkIds: ['market', 'market_shop'],
    dialogueDistrictId: 'market',
  },
  {
    id: 'arena-se',
    name: 'Arena / Tournament Southeast',
    bounds: rect(2560, 1560, 900, 700),
    center: P.arena,
    purpose: 'Entertainment SE — Tournament Hall, Future Arena, crowd plazas.',
    landmarkIds: ['tournament_hall', 'arena'],
    dialogueDistrictId: 'arena',
  },
  {
    id: 'alpha-creator-w',
    name: 'Alpha / Creator West',
    bounds: rect(560, 1160, 1100, 900),
    center: P.alpha,
    purpose: 'Social + creative west — Alpha Lounge, NFT Gallery, NFT Creator Studio.',
    landmarkIds: ['alpha', 'nft_gallery', 'nft_creator_studio'],
    dialogueDistrictId: 'market',
  },
  {
    id: 'park-green',
    name: 'Park / Green Belt',
    bounds: rect(1100, 1780, 700, 480),
    center: P.park,
    purpose: 'Green relief — Park Entrance Gate, southwest of civic core.',
    landmarkIds: ['park'],
    dialogueDistrictId: 'spawn',
  },
  {
    id: 'bridge-cashback-s',
    name: 'Bridge / Cashback Southern Edge',
    bounds: rect(1300, 1650, 800, 620),
    center: P.bridge,
    purpose: 'Outer southern edge — Main Bridge water transition, Holder Cashback Vault.',
    landmarkIds: ['bridge', 'cashback'],
    dialogueDistrictId: 'cashback',
  },
];

for (const d of DISTRICTS) {
  d.center = centerOf(d.bounds);
  if (d.id === 'civic-core') d.center = P.fountain;
  if (d.id === 'prestige-north') d.center = P.fame;
  if (d.id === 'whale-financial-ne') d.center = P.whale;
  if (d.id === 'meme-market') d.center = P.market;
  if (d.id === 'arena-se') d.center = P.arena;
  if (d.id === 'alpha-creator-w') d.center = P.alpha;
  if (d.id === 'park-green') d.center = P.park;
  if (d.id === 'bridge-cashback-s') d.center = P.bridge;
}

/* ─── Landmark zones ───────────────────────────────────────────────────── */

function liveZone(
  id: string,
  displayName: string,
  worldObjectId: LandmarkKey,
  w: number,
  h: number,
  districtId: string,
  hierarchy: 'primary' | 'secondary' | 'support',
): LandmarkZoneBlueprint {
  return {
    id,
    displayName,
    worldObjectId,
    anchor: P[worldObjectId],
    zone: zoneAround(P[worldObjectId], w, h),
    districtId,
    hierarchy,
    gameplayLocked: true,
  };
}

const LANDMARK_ZONES: LandmarkZoneBlueprint[] = [
  liveZone('lz-fountain', 'Spring Water', 'fountain', 300, 300, 'civic-core', 'primary'),
  liveZone('lz-notice', 'Notice Board', 'notice', 180, 160, 'civic-core', 'secondary'),
  liveZone('lz-coffee', 'Coffee Shop', 'coffee', 200, 180, 'civic-core', 'secondary'),
  liveZone('lz-fame', 'Hall of Fame', 'fame', 300, 260, 'prestige-north', 'primary'),
  liveZone('lz-government', 'Government Quarter', 'government', 240, 200, 'prestige-north', 'secondary'),
  liveZone('lz-trading-academy', 'Trading Academy', 'trading_academy', 220, 200, 'prestige-north', 'support'),
  liveZone('lz-whale', 'Whale Tower', 'whale', 240, 320, 'whale-financial-ne', 'primary'),
  liveZone('lz-financial', 'Financial Office', 'financial_office', 220, 200, 'whale-financial-ne', 'secondary'),
  liveZone('lz-holder-bank', 'Holder Bank', 'holder_bank', 220, 200, 'whale-financial-ne', 'secondary'),
  liveZone('lz-research', 'Research Observatory', 'research_observatory', 200, 200, 'whale-financial-ne', 'support'),
  liveZone('lz-market', 'Meme Market Main Hall', 'market', 320, 280, 'meme-market', 'primary'),
  liveZone('lz-market-shop', 'Market Shop', 'market_shop', 200, 180, 'meme-market', 'support'),
  liveZone('lz-tournament', 'Tournament Hall', 'tournament_hall', 220, 200, 'arena-se', 'secondary'),
  liveZone('lz-arena', 'Arena', 'arena', 400, 340, 'arena-se', 'primary'),
  liveZone('lz-alpha', 'Alpha Lounge', 'alpha', 280, 260, 'alpha-creator-w', 'primary'),
  liveZone('lz-nft-gallery', 'NFT Gallery', 'nft_gallery', 240, 220, 'alpha-creator-w', 'secondary'),
  liveZone('lz-nft-studio', 'NFT Creator Studio', 'nft_creator_studio', 220, 200, 'alpha-creator-w', 'support'),
  liveZone('lz-park-gate', 'Park Entrance Gate', 'park', 260, 220, 'park-green', 'primary'),
  liveZone('lz-bridge', 'Main Bridge', 'bridge', 320, 180, 'bridge-cashback-s', 'primary'),
  liveZone('lz-cashback', 'Cashback Vault', 'cashback', 300, 260, 'bridge-cashback-s', 'primary'),
];

/* ─── Primary roads (mirror RoadNetwork.ROAD_EDGES) ────────────────────── */

const PRIMARY_ROADS: RoadCorridorBlueprint[] = [
  lCorridor('pr-fountain-notice', 'primary', P.fountain, P.notice, 'h', 'fountain', 'notice'),
  lCorridor('pr-fountain-coffee', 'primary', P.fountain, P.coffee, 'h', 'fountain', 'coffee'),
  lCorridor('pr-fountain-fame', 'primary', P.fountain, P.fame, 'v', 'fountain', 'fame'),
  lCorridor('pr-fountain-whale', 'primary', P.fountain, P.whale, 'v', 'fountain', 'whale'),
  lCorridor('pr-fountain-market', 'primary', P.fountain, P.market, 'h', 'fountain', 'market'),
  lCorridor('pr-fountain-alpha', 'primary', P.fountain, P.alpha, 'h', 'fountain', 'alpha'),
  lCorridor('pr-fountain-bridge', 'primary', P.fountain, P.bridge, 'v', 'fountain', 'bridge'),
  lCorridor('pr-notice-whale', 'primary', P.notice, P.whale, 'h', 'notice', 'whale'),
  lCorridor('pr-whale-market', 'primary', P.whale, P.market, 'v', 'whale', 'market'),
  lCorridor('pr-market-arena', 'primary', P.market, P.arena, 'v', 'market', 'arena'),
  lCorridor('pr-arena-bridge', 'primary', P.arena, P.bridge, 'h', 'arena', 'bridge'),
  lCorridor('pr-bridge-cashback', 'primary', P.bridge, P.cashback, 'h', 'bridge', 'cashback'),
  lCorridor('pr-cashback-park', 'primary', P.cashback, P.park, 'h', 'cashback', 'park'),
  lCorridor('pr-park-alpha', 'primary', P.park, P.alpha, 'v', 'park', 'alpha'),
  lCorridor('pr-alpha-coffee', 'primary', P.alpha, P.coffee, 'v', 'alpha', 'coffee'),
  lCorridor('pr-coffee-fame', 'primary', P.coffee, P.fame, 'v', 'coffee', 'fame'),
  lCorridor('pr-fame-notice', 'primary', P.fame, P.notice, 'h', 'fame', 'notice'),
  lCorridor('pr-fame-government', 'primary', P.fame, P.government, 'v', 'fame', 'government'),
  lCorridor('pr-fame-trading-academy', 'primary', P.fame, P.trading_academy, 'h', 'fame', 'trading_academy'),
  lCorridor('pr-whale-financial', 'primary', P.whale, P.financial_office, 'h', 'whale', 'financial_office'),
  lCorridor('pr-financial-holder', 'primary', P.financial_office, P.holder_bank, 'v', 'financial_office', 'holder_bank'),
  lCorridor('pr-holder-research', 'primary', P.holder_bank, P.research_observatory, 'v', 'holder_bank', 'research_observatory'),
  lCorridor('pr-market-marketshop', 'primary', P.market, P.market_shop, 'v', 'market', 'market_shop'),
  lCorridor('pr-marketshop-tournament', 'primary', P.market_shop, P.tournament_hall, 'v', 'market_shop', 'tournament_hall'),
  lCorridor('pr-tournament-arena', 'primary', P.tournament_hall, P.arena, 'h', 'tournament_hall', 'arena'),
  lCorridor('pr-alpha-nftgallery', 'primary', P.alpha, P.nft_gallery, 'v', 'alpha', 'nft_gallery'),
  lCorridor('pr-nftgallery-nftstudio', 'primary', P.nft_gallery, P.nft_creator_studio, 'h', 'nft_gallery', 'nft_creator_studio'),
  lCorridor('pr-park-nftstudio', 'primary', P.park, P.nft_creator_studio, 'h', 'park', 'nft_creator_studio'),
];

/* ─── Secondary roads — none planned beyond the live network for this
   compact layout; every landmark already sits on a primary route. ────── */

const SECONDARY_ROADS: RoadCorridorBlueprint[] = [];

/* ─── Plazas / blocks / parks / reserved ───────────────────────────────── */

const PLAZAS: NamedRectBlueprint[] = [
  {
    id: 'plaza-spawn',
    name: 'Spring Water Plaza',
    districtId: 'civic-core',
    bounds: zoneAround(P.fountain, 330, 330),
    notes: 'Matches RoadNetwork fountain plaza radius 165px half-extent.',
  },
  {
    id: 'plaza-market',
    name: 'Market Forecourt',
    districtId: 'meme-market',
    bounds: zoneAround(P.market, 224, 224),
  },
  {
    id: 'plaza-arena',
    name: 'Arena Forecourt',
    districtId: 'arena-se',
    bounds: zoneAround(P.arena, 320, 320),
  },
  {
    id: 'plaza-cashback',
    name: 'Vault Approach Plaza',
    districtId: 'bridge-cashback-s',
    bounds: zoneAround(P.cashback, 280, 280),
  },
  {
    id: 'plaza-alpha',
    name: 'Alpha Courtyard',
    districtId: 'alpha-creator-w',
    bounds: zoneAround(P.alpha, 210, 210),
  },
];

const COMMERCIAL_BLOCKS: NamedRectBlueprint[] = [
  {
    id: 'com-market-shop',
    name: 'Market Shop Row',
    districtId: 'meme-market',
    bounds: zoneAround(P.market_shop, 200, 160),
    notes: 'commercial_small_*, carts, crates, barrels.',
  },
  {
    id: 'com-nft-row',
    name: 'NFT Creator Row',
    districtId: 'alpha-creator-w',
    bounds: zoneAround(P.nft_creator_studio, 200, 160),
  },
];

const RESIDENTIAL_BLOCKS: NamedRectBlueprint[] = [
  {
    id: 'res-inner-a',
    name: 'Inner Residential Block A',
    districtId: 'civic-core',
    bounds: rect(1420, 1330, 380, 220),
    notes: 'Small residential infill between civic core and park.',
  },
  {
    id: 'res-inner-b',
    name: 'Inner Residential Block B',
    districtId: 'meme-market',
    bounds: rect(2380, 1200, 340, 220),
  },
];

const PARK_ZONES: NamedRectBlueprint[] = [
  {
    id: 'park-main',
    name: 'Main Park Green',
    districtId: 'park-green',
    bounds: rect(1150, 1830, 500, 380),
  },
  {
    id: 'park-civic-planters',
    name: 'Civic Planter Belts',
    districtId: 'civic-core',
    bounds: rect(1650, 1000, 300, 90),
  },
  {
    id: 'park-bridge-approach',
    name: 'Bridge Softscape',
    districtId: 'bridge-cashback-s',
    bounds: rect(1720, 1780, 340, 90),
  },
];

const RESERVED: NamedRectBlueprint[] = [
  {
    id: 'open-spawn-clearance',
    name: 'Spring Water Clearance (no dense props)',
    districtId: 'civic-core',
    bounds: zoneAround(P.fountain, 460, 460),
    notes: 'Keep Spring Water approach readable.',
  },
  {
    id: 'open-world-margin',
    name: 'World Edge Margin',
    districtId: 'civic-core',
    bounds: rect(80, 80, 3440, 2240),
    notes: 'Soft reminder of playable interior vs mountain/wall art edge.',
  },
];

const CONFLICTS: string[] = [
  'RESOLVED (Phase 8B): WorldScene spawn, WorldObjects fountain, and RoadNetwork fountain node are now the single point (1800, 1200) = Spring Water, world centre. No duplicate fountain coordinates remain.',
  'The Phase 7/9 terrain placement manifest (world-placement-manifest.json, measured against RugTown_World_V1_Final at 9600×5400) is no longer scale-compatible with the compact 3600×2400 world — WORLD_ASSETS_ENABLED was set to false so those stale placements do not render off-world. HubLandmarks placeholder silhouettes cover the 11 previously-live landmarks at their new positions until the 108-asset library is placed in a dedicated art phase.',
  'The nine new landmark ids (government, market_shop, trading_academy, research_observatory, financial_office, holder_bank, nft_gallery, nft_creator_studio, tournament_hall) have live WorldObjects + RoadNetwork anchors and are walkable/road-connected, but have no placeholder silhouette art yet and are not in LIVE_INTERACTION_IDS — they render as F9 "planned" pads only until art + interactions are wired up.',
  'SpawnPlazaDistrict.ts / HallOfFameDistrict.ts (Phase 7 hand-tuned prop art, ~30+ individual coordinates each) still reference the old 9600×5400 pixel positions and are intentionally NOT invoked by BuildingGenerator in this phase — migrating their dozens of prop coordinates to the compact layout is out of scope here and belongs to a dedicated art-migration phase.',
];

export const WORLD_LAYOUT_BLUEPRINT: WorldLayoutBlueprint = {
  version: '8b-compact-rebalance',
  worldSize: { width: WORLD_LAYOUT_WIDTH, height: WORLD_LAYOUT_HEIGHT },
  sceneSpawn: SCENE_SPAWN,
  gameplayFountain: P.fountain,
  districts: DISTRICTS,
  landmarkZones: LANDMARK_ZONES,
  primaryRoads: PRIMARY_ROADS,
  secondaryRoads: SECONDARY_ROADS,
  plazas: PLAZAS,
  residentialBlocks: RESIDENTIAL_BLOCKS,
  commercialBlocks: COMMERCIAL_BLOCKS,
  parkZones: PARK_ZONES,
  reservedOpenSpaces: RESERVED.filter((r) => r.id !== 'open-world-margin'),
  conflicts: CONFLICTS,
};

export function getDistrictBlueprint(id: string): WorldDistrictBlueprint | undefined {
  return WORLD_LAYOUT_BLUEPRINT.districts.find((d) => d.id === id);
}

export function getLandmarkZone(id: string): LandmarkZoneBlueprint | undefined {
  return WORLD_LAYOUT_BLUEPRINT.landmarkZones.find((z) => z.id === id);
}
