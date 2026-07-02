/*
  LevelDefinitions.ts
  ───────────────────
  Single source of truth for RugTown's 30-level progression system.
  Each level has a unique id, objective type, optional target, REP reward,
  and display metadata. Add Level 31+ here — zero logic changes needed.
*/

export type LevelObjectiveType =
  | 'visit_zone'
  | 'claim_fountain'
  | 'talk_npc'
  | 'send_chat'
  | 'use_emote'
  | 'claim_treasure'
  | 'inspect_whale'
  | 'open_leaderboard'
  | 'open_inventory'
  | 'open_holder'
  | 'inspect_statue'
  | 'rep_reached';

export interface LevelDef {
  id: number;
  group: string;
  title: string;
  description: string;
  objectiveType: LevelObjectiveType;
  /** zone id for visit_zone; REP threshold for rep_reached; omit otherwise */
  target?: string | number;
  rewardRep: number;
  unlockText: string;
  hint: string;
  buildingName: string;
}

export const LEVEL_DEFINITIONS: LevelDef[] = [
  /* ── Group 1: New Degen Tutorial (1–5) ── */
  {
    id: 1,
    group: 'New Degen Tutorial',
    title: 'First REP',
    description: 'Claim your first REP from the Spawn Fountain',
    objectiveType: 'claim_fountain',
    rewardRep: 10,
    unlockText: 'First REP claimed. The journey begins.',
    hint: 'Walk to the fountain and press E to interact.',
    buildingName: 'Spawn Fountain',
  },
  {
    id: 2,
    group: 'New Degen Tutorial',
    title: 'GM the City',
    description: 'Send your first message in City Chat',
    objectiveType: 'send_chat',
    rewardRep: 5,
    unlockText: 'Word spreads fast in RugTown.',
    hint: 'Open Chat from the action bar and say anything.',
    buildingName: 'City Chat',
  },
  {
    id: 3,
    group: 'New Degen Tutorial',
    title: 'Read the Board',
    description: 'Check the Notice Board',
    objectiveType: 'visit_zone',
    target: 'notice',
    rewardRep: 5,
    unlockText: 'Information is alpha.',
    hint: 'Find the Notice Board and step inside its zone.',
    buildingName: 'Notice Board',
  },
  {
    id: 4,
    group: 'New Degen Tutorial',
    title: 'Meet a Local',
    description: 'Talk to any NPC citizen',
    objectiveType: 'talk_npc',
    rewardRep: 5,
    unlockText: 'The citizens know your name now.',
    hint: 'Walk up to a citizen and press E to talk.',
    buildingName: 'Anywhere',
  },
  {
    id: 5,
    group: 'New Degen Tutorial',
    title: 'Show Your Vibe',
    description: 'Use any emote',
    objectiveType: 'use_emote',
    rewardRep: 5,
    unlockText: 'Your personality is showing.',
    hint: 'Open Emotes from the action bar and pick one.',
    buildingName: 'Emote Menu',
  },

  /* ── Group 2: City Explorer (6–10) ── */
  {
    id: 6,
    group: 'City Explorer',
    title: 'Market Recon',
    description: 'Visit the Meme Market',
    objectiveType: 'visit_zone',
    target: 'market',
    rewardRep: 10,
    unlockText: 'The market never sleeps.',
    hint: 'Walk northeast toward the Meme Market.',
    buildingName: 'Meme Market',
  },
  {
    id: 7,
    group: 'City Explorer',
    title: 'Hall of Legends',
    description: 'Visit the Hall of Fame',
    objectiveType: 'visit_zone',
    target: 'fame',
    rewardRep: 10,
    unlockText: 'The legends are watching.',
    hint: 'Walk to the Hall of Fame building.',
    buildingName: 'Hall of Fame',
  },
  {
    id: 8,
    group: 'City Explorer',
    title: 'Inventory Check',
    description: 'Open your Inventory',
    objectiveType: 'open_inventory',
    rewardRep: 5,
    unlockText: 'You checked your bags.',
    hint: 'Open Inventory from the action bar.',
    buildingName: 'Inventory',
  },
  {
    id: 9,
    group: 'City Explorer',
    title: 'Know Your Rank',
    description: 'Open the Leaderboard',
    objectiveType: 'open_leaderboard',
    rewardRep: 5,
    unlockText: 'You checked the scoreboard.',
    hint: 'Open Leaderboard from the action bar.',
    buildingName: 'Leaderboard',
  },
  {
    id: 10,
    group: 'City Explorer',
    title: 'REP Builder',
    description: 'Accumulate 40 total REP',
    objectiveType: 'rep_reached',
    target: 40,
    rewardRep: 15,
    unlockText: "You're building a name for yourself.",
    hint: 'Complete quests and actions to earn more REP.',
    buildingName: 'REP Counter',
  },

  /* ── Group 3: Meme Market Scout (11–15) ── */
  {
    id: 11,
    group: 'Meme Market Scout',
    title: 'Alpha Territory',
    description: 'Visit the Alpha Lounge',
    objectiveType: 'visit_zone',
    target: 'alpha',
    rewardRep: 15,
    unlockText: 'The real calls come from here.',
    hint: 'Find the Alpha Lounge and step inside.',
    buildingName: 'Alpha Lounge',
  },
  {
    id: 12,
    group: 'Meme Market Scout',
    title: 'Bridge Walker',
    description: 'Walk across the Bridge',
    objectiveType: 'visit_zone',
    target: 'bridge',
    rewardRep: 10,
    unlockText: 'New districts await.',
    hint: 'Find the Bridge and walk over it.',
    buildingName: 'Bridge',
  },
  {
    id: 13,
    group: 'Meme Market Scout',
    title: 'Legend Study',
    description: 'Inspect a Hall of Fame statue',
    objectiveType: 'inspect_statue',
    rewardRep: 15,
    unlockText: 'You paid your respects.',
    hint: 'Press E near a statue in the Hall of Fame.',
    buildingName: 'Hall of Fame',
  },
  {
    id: 14,
    group: 'Meme Market Scout',
    title: 'Whale Zone',
    description: 'Visit Whale Tower',
    objectiveType: 'visit_zone',
    target: 'whale',
    rewardRep: 15,
    unlockText: 'The whales see you now.',
    hint: 'Walk to Whale Tower and enter its zone.',
    buildingName: 'Whale Tower',
  },
  {
    id: 15,
    group: 'Meme Market Scout',
    title: 'REP Milestone',
    description: 'Accumulate 80 total REP',
    objectiveType: 'rep_reached',
    target: 80,
    rewardRep: 20,
    unlockText: "You're becoming known in RugTown.",
    hint: 'Keep exploring and earning REP.',
    buildingName: 'REP Counter',
  },

  /* ── Group 4: Whale Watcher (16–20) ── */
  {
    id: 16,
    group: 'Whale Watcher',
    title: 'Holder Preview',
    description: 'Open the Holder Status panel',
    objectiveType: 'open_holder',
    rewardRep: 10,
    unlockText: 'Tier system understood.',
    hint: 'Open Holder from the action bar.',
    buildingName: 'Holder Panel',
  },
  {
    id: 17,
    group: 'Whale Watcher',
    title: 'Whale Alert',
    description: 'Inspect a live Whale Alert event marker',
    objectiveType: 'inspect_whale',
    rewardRep: 20,
    unlockText: 'You tracked the whale.',
    hint: 'Wait for a Whale Alert event, then press E on the marker.',
    buildingName: 'Whale Tower',
  },
  {
    id: 18,
    group: 'Whale Watcher',
    title: 'Treasure Seeker',
    description: 'Find and claim a Treasure Chest',
    objectiveType: 'claim_treasure',
    rewardRep: 25,
    unlockText: 'X marks the rug.',
    hint: 'Wait for a Treasure Hunt event and claim the chest.',
    buildingName: 'Treasure Chest',
  },
  {
    id: 19,
    group: 'Whale Watcher',
    title: 'Social Degen',
    description: 'Send a message in City Chat',
    objectiveType: 'send_chat',
    rewardRep: 10,
    unlockText: 'The city hears you.',
    hint: 'Open Chat and say something.',
    buildingName: 'City Chat',
  },
  {
    id: 20,
    group: 'Whale Watcher',
    title: 'REP Grinder',
    description: 'Accumulate 140 total REP',
    objectiveType: 'rep_reached',
    target: 140,
    rewardRep: 25,
    unlockText: 'Top tier degen energy.',
    hint: 'Keep earning REP through actions and quests.',
    buildingName: 'REP Counter',
  },

  /* ── Group 5: Alpha Hunter (21–25) ── */
  {
    id: 21,
    group: 'Alpha Hunter',
    title: 'Coffee Break',
    description: 'Visit the Coffee Shop',
    objectiveType: 'visit_zone',
    target: 'coffee',
    rewardRep: 10,
    unlockText: 'Fueled and ready to degen.',
    hint: 'Find the Coffee Shop near the plaza.',
    buildingName: 'Coffee Shop',
  },
  {
    id: 22,
    group: 'Alpha Hunter',
    title: 'Park Life',
    description: 'Visit the City Park',
    objectiveType: 'visit_zone',
    target: 'park',
    rewardRep: 15,
    unlockText: 'Even degens need fresh air.',
    hint: 'Find the City Park and step inside.',
    buildingName: 'Park Entrance',
  },
  {
    id: 23,
    group: 'Alpha Hunter',
    title: 'Emote Master',
    description: 'Use another emote',
    objectiveType: 'use_emote',
    rewardRep: 10,
    unlockText: 'Communication is universal.',
    hint: 'Open Emotes and express yourself again.',
    buildingName: 'Emote Menu',
  },
  {
    id: 24,
    group: 'Alpha Hunter',
    title: 'City Regular',
    description: 'Talk to another NPC citizen',
    objectiveType: 'talk_npc',
    rewardRep: 15,
    unlockText: 'You know everyone by now.',
    hint: 'Find any citizen and press E to chat.',
    buildingName: 'Anywhere',
  },
  {
    id: 25,
    group: 'Alpha Hunter',
    title: 'Rising Star',
    description: 'Accumulate 220 total REP',
    objectiveType: 'rep_reached',
    target: 220,
    rewardRep: 30,
    unlockText: "You're climbing the ranks.",
    hint: 'Keep earning REP — the city is watching.',
    buildingName: 'REP Counter',
  },

  /* ── Group 6: RugTown Citizen (26–30) ── */
  {
    id: 26,
    group: 'RugTown Citizen',
    title: 'Alpha Reader',
    description: 'Revisit the Alpha Lounge',
    objectiveType: 'visit_zone',
    target: 'alpha',
    rewardRep: 15,
    unlockText: 'The alpha keeps coming.',
    hint: 'Head back to the Alpha Lounge.',
    buildingName: 'Alpha Lounge',
  },
  {
    id: 27,
    group: 'RugTown Citizen',
    title: 'City Voice',
    description: 'Send a message in City Chat',
    objectiveType: 'send_chat',
    rewardRep: 15,
    unlockText: 'RugTown listens when you speak.',
    hint: "Open Chat and let the city know you're here.",
    buildingName: 'City Chat',
  },
  {
    id: 28,
    group: 'RugTown Citizen',
    title: 'Full Inventory',
    description: 'Check your full inventory',
    objectiveType: 'open_inventory',
    rewardRep: 10,
    unlockText: 'Bags checked. Ready for anything.',
    hint: 'Open Inventory from the action bar.',
    buildingName: 'Inventory',
  },
  {
    id: 29,
    group: 'RugTown Citizen',
    title: 'REP Legend',
    description: 'Accumulate 280 total REP',
    objectiveType: 'rep_reached',
    target: 280,
    rewardRep: 40,
    unlockText: 'You are RugTown royalty.',
    hint: "Keep earning — you're almost a legend.",
    buildingName: 'REP Counter',
  },
  {
    id: 30,
    group: 'RugTown Citizen',
    title: 'RugTown Legend',
    description: 'Reach 360 REP — the ultimate degen milestone',
    objectiveType: 'rep_reached',
    target: 360,
    rewardRep: 50,
    unlockText: 'You are now a RugTown Legend. The city bows.',
    hint: "You're almost there — keep earning REP.",
    buildingName: 'RugTown',
  },
];
