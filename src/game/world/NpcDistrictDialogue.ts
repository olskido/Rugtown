/**
 * NpcDistrictDialogue.ts
 * ──────────────────────
 * District-themed NPC lines for the Living City system (Phase 6).
 * Each major district has 3+ unique lines that match its theme.
 * Used for ambient speech bubbles and E-key dialogue when no hand-written
 * per-name lines exist.
 */

/** Maps a WorldObject landmark id to a Phase-4 district id. */
const LANDMARK_TO_DISTRICT: Record<string, string> = {
  fountain: 'spawn',
  coffee:   'spawn',
  park:     'spawn',
  bridge:   'spawn',
  notice:   'spawn',
  fame:     'spawn',
  government: 'spawn',
  trading_academy: 'spawn',
  market:   'market',
  market_shop: 'market',
  alpha:    'market',
  nft_gallery: 'market',
  nft_creator_studio: 'market',
  whale:    'whale',
  financial_office: 'whale',
  holder_bank: 'whale',
  research_observatory: 'whale',
  cashback: 'cashback',
  arena:    'arena',
  tournament_hall: 'arena',
};

/** District id → themed dialogue lines (at least 3 per district). */
export const NPC_DISTRICT_DIALOGUE: Record<string, string[]> = {
  spawn: [
    'The fountain never stops flowing — just like the degens.',
    'Every journey in RugTown starts right here at Spawn Plaza.',
    'First time? Claim your REP at the fountain before you wander.',
    'Spawn District is where the real stories begin.',
  ],
  market: [
    'Meme Market is buzzing — tickers are flying off the board.',
    'I just saw a new coin list at Meme Market. Probably nothing.',
    'The Market District never sleeps when volume picks up.',
    'Alpha Lounge and Meme Market — the twin hearts of degen trade.',
    'Spreads are tight in Market District today. Rare sight.',
  ],
  whale: [
    'Whale District always has eyes on the big wallets.',
    'Saw a shadow wallet move near Whale Tower last night.',
    'The whales don\'t announce themselves — you just feel the ripples.',
    'Whale Tower watches every large transfer in RugTown.',
    'Big money moves quiet in Whale District.',
  ],
  cashback: [
    'Holder Cashback Vault hums even when it\'s locked.',
    'They say the vault opens when $RUGTOWN holder perks go live.',
    'Cashback District feels different — heavier, more serious.',
    'I keep hearing signals from the vault. Probably hopium.',
    'The gold doors of the Cashback Vault are worth the walk south.',
  ],
  arena: [
    'Future Arena District is coming — you can feel the hype building.',
    'Rumors say the Arena will host live degen battles soon.',
    'Arena District echoes even when the gates are closed.',
    'Everyone\'s talking about what the Future Arena will host.',
    'The colosseum silhouette south-east is impossible to ignore.',
  ],
};

/** Resolve the district id for a landmark (WorldObject id). */
export function getDistrictForLandmark(landmarkId: string): string {
  return LANDMARK_TO_DISTRICT[landmarkId] ?? 'spawn';
}

/** Pick a random themed line for a district. Falls back to spawn. */
export function getRandomDistrictLine(districtId: string): string {
  const pool = NPC_DISTRICT_DIALOGUE[districtId] ?? NPC_DISTRICT_DIALOGUE.spawn;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** All lines for dialogue (E-key) — personality lines can be mixed in by caller. */
export function getDistrictDialogueLines(districtId: string): string[] {
  return NPC_DISTRICT_DIALOGUE[districtId] ?? NPC_DISTRICT_DIALOGUE.spawn;
}
