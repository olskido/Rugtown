import type { MissionDefinition } from '../systems/MissionSystem';

/**
 * Chapter One is intentionally linear: each completed lead unlocks the next.
 * The total mission reward is 455 XP, paced to reach level 3 and begin level 4.
 */
export const CHAPTER_ONE_TITLE = 'Chapter One: The Missing Ledger';

export const CHAPTER_ONE_MISSIONS: MissionDefinition[] = [
  { id: 'ch1_new_face', title: 'A New Face', description: 'Speak with the Town Crier to hear what is missing.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'talk_town_crier', objectiveHint: 'Find the Town Crier and press E.', rewardXp: 20, rewardRep: 3, unlocksNext: 'ch1_water_before_rumours' },
  { id: 'ch1_water_before_rumours', title: 'Water Before Rumours', description: 'Start at Spring Water before chasing the story.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'fountain', objectiveHint: 'Visit Spring Water.', rewardXp: 25, rewardRep: 3, unlocksNext: 'ch1_empty_cart' },
  { id: 'ch1_empty_cart', title: 'The Empty Cart', description: 'Inspect the Meme Market for signs of the missing ledger.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'market', objectiveHint: 'Visit Meme Market.', rewardXp: 35, rewardRep: 5, unlocksNext: 'ch1_milo_heard' },
  { id: 'ch1_milo_heard', title: 'What Milo Heard', description: 'Follow the coffee-shop lead and ask around inside.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'enter_building', targetId: 'coffee-shop', objectiveHint: 'Enter the Coffee Shop.', rewardXp: 30, rewardRep: 4, unlocksNext: 'ch1_notice_never_posted' },
  { id: 'ch1_notice_never_posted', title: 'The Notice Never Posted', description: 'Check the Notice Board for the missing announcement.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'notice', objectiveHint: 'Visit the Notice Board.', rewardXp: 40, rewardRep: 5, unlocksNext: 'ch1_proof_not_panic' },
  { id: 'ch1_proof_not_panic', title: 'Proof, Not Panic', description: 'Take the evidence to the Government Quarter.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'government', objectiveHint: 'Visit Government Quarter.', rewardXp: 45, rewardRep: 7, unlocksNext: 'ch1_patterns_in_ink' },
  { id: 'ch1_patterns_in_ink', title: 'Patterns in Ink', description: 'Compare the marks with the Trading Academy records.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'trading_academy', objectiveHint: 'Visit Trading Academy.', rewardXp: 50, rewardRep: 7, unlocksNext: 'ch1_bridge_keeps_count' },
  { id: 'ch1_bridge_keeps_count', title: 'The Bridge Keeps Count', description: 'Trace the ledger route across the Main Bridge.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'bridge', objectiveHint: 'Visit Main Bridge.', rewardXp: 55, rewardRep: 8, unlocksNext: 'ch1_whales_shadow' },
  { id: 'ch1_whales_shadow', title: 'The Whale’s Shadow', description: 'Look toward Whale Tower for the final clue.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'visit_landmark', targetId: 'whale', objectiveHint: 'Visit Whale Tower.', rewardXp: 60, rewardRep: 9, unlocksNext: 'ch1_missing_ledger' },
  { id: 'ch1_missing_ledger', title: 'The Missing Ledger', description: 'Return to the Town Crier with what you learned.', chapterTitle: CHAPTER_ONE_TITLE, objectiveType: 'talk_town_crier', objectiveHint: 'Speak with the Town Crier again.', rewardXp: 95, rewardRep: 14, unlocksNext: null },
];
