/**
 * Phase 8H — lightweight validation for the compact-world NPC population
 * model. No browser required.
 *
 * NOTE: COMPACT_NPC_CONFIG and NPC_HOME_LANDMARKS below are a snapshot of
 * the same-named constants in src/game/scenes/WorldScene.ts. If those
 * change, update this snapshot too (same pattern as scripts/lib/canonical-
 * world.mjs mirroring WorldObjects.ts / RoadNetwork.ts).
 *
 * Checks (Task 24):
 *  - total population is within the recommended 18-28 range
 *  - every home landmark id is a known canonical landmark
 *  - the population list length matches totalPopulation exactly
 *  - no more home-assigned NPCs on the bridge than bridgeCapacity
 *  - spawnClearanceRadius is geometrically sane (fits inside Spring
 *    Water's own plaza, so the clearance offset still lands on walkable
 *    ground — see RoadNetwork.ts fountain plaza=165)
 *  - district groupings cover all 20 canonical landmarks (reuses the same
 *    grouping as CompactWorldAmbience.ts's DISTRICT_GROUPS)
 *
 * Run: node scripts/validate-npc-population.mjs
 */
import { CANONICAL_LANDMARK_IDS, WORLD_OBJECTS_SNAPSHOT } from './lib/canonical-world.mjs';

const COMPACT_NPC_CONFIG = {
  totalPopulation: 22,
  spawnClearanceRadius: 130,
  bridgeCapacity: 2,
  crossDistrictChance: 0.18,
  speedMin: 145,
  speedMax: 195,
};

const NPC_HOME_LANDMARKS = [
  'fountain', 'notice', 'coffee',
  'fame', 'government',
  'market', 'market', 'market', 'market_shop', 'market_shop',
  'whale', 'financial_office', 'holder_bank', 'research_observatory', 'alpha',
  'nft_gallery', 'nft_creator_studio',
  'arena', 'tournament_hall',
  'park',
  'bridge', 'cashback',
];

// Mirrors CompactWorldAmbience.ts's DISTRICT_GROUPS (Phase 8E) — every
// canonical landmark must appear in exactly one group.
const DISTRICT_GROUPS = {
  plaza: ['fountain', 'notice', 'coffee'],
  government: ['fame', 'government', 'trading_academy'],
  market: ['market', 'market_shop'],
  financial: ['whale', 'financial_office', 'holder_bank', 'research_observatory', 'alpha'],
  creator: ['nft_gallery', 'nft_creator_studio'],
  arena: ['arena', 'tournament_hall'],
  park: ['park'],
  waterfront: ['bridge', 'cashback'],
};

const PLAYER_SPEED = 252;

function main() {
  const errors = [];
  const warnings = [];

  if (NPC_HOME_LANDMARKS.length !== COMPACT_NPC_CONFIG.totalPopulation) {
    errors.push(`NPC_HOME_LANDMARKS has ${NPC_HOME_LANDMARKS.length} entries, expected totalPopulation=${COMPACT_NPC_CONFIG.totalPopulation}`);
  }
  if (COMPACT_NPC_CONFIG.totalPopulation < 18 || COMPACT_NPC_CONFIG.totalPopulation > 28) {
    warnings.push(`totalPopulation ${COMPACT_NPC_CONFIG.totalPopulation} is outside the recommended 18-28 range`);
  }

  for (const id of NPC_HOME_LANDMARKS) {
    if (!CANONICAL_LANDMARK_IDS.includes(id)) {
      errors.push(`NPC_HOME_LANDMARKS references unknown landmark id "${id}"`);
    }
  }

  const bridgeHomes = NPC_HOME_LANDMARKS.filter((id) => id === 'bridge').length;
  if (bridgeHomes > COMPACT_NPC_CONFIG.bridgeCapacity) {
    errors.push(`${bridgeHomes} NPCs are home-assigned to "bridge", exceeding bridgeCapacity=${COMPACT_NPC_CONFIG.bridgeCapacity}`);
  }

  const fountainPlaza = WORLD_OBJECTS_SNAPSHOT.fountain.plaza;
  if (COMPACT_NPC_CONFIG.spawnClearanceRadius >= fountainPlaza) {
    errors.push(`spawnClearanceRadius (${COMPACT_NPC_CONFIG.spawnClearanceRadius}) must be smaller than Spring Water's plaza radius (${fountainPlaza}) so the clearance-offset home still lands on walkable ground`);
  }

  if (COMPACT_NPC_CONFIG.speedMax >= PLAYER_SPEED) {
    errors.push(`speedMax (${COMPACT_NPC_CONFIG.speedMax}) must stay below PLAYER_SPEED (${PLAYER_SPEED})`);
  }
  if (COMPACT_NPC_CONFIG.speedMin < 0 || COMPACT_NPC_CONFIG.speedMin > COMPACT_NPC_CONFIG.speedMax) {
    errors.push(`speedMin (${COMPACT_NPC_CONFIG.speedMin}) must be positive and <= speedMax`);
  }

  const grouped = new Set(Object.values(DISTRICT_GROUPS).flat());
  const missingFromGroups = CANONICAL_LANDMARK_IDS.filter((id) => !grouped.has(id));
  if (missingFromGroups.length) {
    errors.push(`Landmarks missing from DISTRICT_GROUPS: ${missingFromGroups.join(', ')}`);
  }
  const seen = new Set();
  for (const [groupId, ids] of Object.entries(DISTRICT_GROUPS)) {
    for (const id of ids) {
      if (seen.has(id)) errors.push(`Landmark "${id}" appears in more than one district group`);
      seen.add(id);
      if (!CANONICAL_LANDMARK_IDS.includes(id)) errors.push(`DISTRICT_GROUPS["${groupId}"] references unknown landmark "${id}"`);
    }
  }

  const districtCounts = {};
  for (const [groupId, ids] of Object.entries(DISTRICT_GROUPS)) {
    districtCounts[groupId] = NPC_HOME_LANDMARKS.filter((id) => ids.includes(id)).length;
  }

  for (const w of warnings) console.warn('⚠️  ' + w);
  if (errors.length) {
    console.error(`\n❌ NPC population validation FAILED (${errors.length} error(s)):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  console.log(`✅ NPC population validation passed — ${NPC_HOME_LANDMARKS.length} citizens, speed ${COMPACT_NPC_CONFIG.speedMin}-${COMPACT_NPC_CONFIG.speedMax}px/s (< ${PLAYER_SPEED}), spawnClearance=${COMPACT_NPC_CONFIG.spawnClearanceRadius}px, bridgeCapacity=${COMPACT_NPC_CONFIG.bridgeCapacity}.`);
  console.log('District distribution:', districtCounts);
}

main();
