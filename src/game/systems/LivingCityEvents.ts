/**
 * LivingCityEvents.ts
 * ───────────────────
 * Random ambient city events for the Living City system (Phase 6).
 * Fires every 30–60 seconds as City Feed messages and optionally as
 * floating world text above the relevant district.
 *
 * Pure data — GamePage schedules; WorldScene renders world text.
 */

export interface LivingCityEvent {
  type: string;
  icon: string;
  messages: string[];
  /** Fractional world position for optional floating text. */
  fx: number;
  fy: number;
  /** Chance (0–1) that floating world text appears for this event. */
  worldTextChance: number;
}

/** Interval between random city events (ms). */
export const LIVING_CITY_EVENT_MIN_GAP = 30_000;
export const LIVING_CITY_EVENT_MAX_GAP = 60_000;

export const LIVING_CITY_EVENTS: LivingCityEvent[] = [
  {
    type: 'Whale Alert',
    icon: '🐳',
    fx: 0.643,
    fy: 0.193,
    worldTextChance: 0.7,
    messages: [
      'Whale Alert: a 540 SOL wallet just woke up near Whale Tower',
      'Whale Alert — big wallet circling Whale District again',
      'Whale bought 218 SOL near Whale Tower. City Feed is buzzing.',
    ],
  },
  {
    type: 'Meme Market Surge',
    icon: '📈',
    fx: 0.750,
    fy: 0.513,
    worldTextChance: 0.65,
    messages: [
      'Meme Market Surge: BONK +18% in Market District',
      'Meme Market Surge — degens are aping a fresh ticker',
      'Meme Market Surge: WIF pumping hard at the stalls',
    ],
  },
  {
    type: 'Alpha Leak',
    icon: '🧠',
    fx: 0.259,
    fy: 0.597,
    worldTextChance: 0.6,
    messages: [
      'Alpha Leak: whisper spreading from Alpha Lounge',
      'Alpha Leak — quiet call posted near Market District',
      'Alpha Leak detected. Alpha Lounge regulars are moving.',
    ],
  },
  {
    type: 'Arena Rumor',
    icon: '⚔️',
    fx: 0.811,
    fy: 0.864,
    worldTextChance: 0.55,
    messages: [
      'Arena Rumor: Future Arena gates may open soon',
      'Arena Rumor — spectators gathering in Arena District',
      'Arena Rumor: the colosseum south-east is stirring',
    ],
  },
  {
    type: 'Cashback Vault Signal',
    icon: '🔐',
    fx: 0.459,
    fy: 0.849,
    worldTextChance: 0.6,
    messages: [
      'Cashback Vault Signal: faint ping from Holder Vault',
      'Cashback Vault Signal detected in Cashback District',
      'Cashback Vault Signal — holders report a gold pulse from the vault',
    ],
  },
];

/** Pick a random living-city event template. */
export function pickLivingCityEvent(): LivingCityEvent {
  return LIVING_CITY_EVENTS[Math.floor(Math.random() * LIVING_CITY_EVENTS.length)];
}
