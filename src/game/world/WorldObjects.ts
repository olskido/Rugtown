/*
  WorldObjects.ts
  ───────────────
  Single source of truth for every interactable landmark in RugTown.

  This module is intentionally framework-agnostic (no Phaser import) so it
  can be referenced by anything that cares about "where things are and what
  they are" — WorldScene's interaction-zone detection today, and future
  quest triggers, NPC pathing/dialogue, ambient sound zones, and landmark
  icons/animations, without any of those systems needing to know about each
  other or duplicate coordinates.

  Coordinates are fractions (0–1) of world width/height, matching the
  convention already used for the player spawn and NPC gathering points —
  multiply by the actual worldW/worldH (known only once the city image has
  loaded) to get real pixel positions. Use `toWorldPosition()` for that.
*/

/* ─── Interaction category ───
   Semantic meaning for each landmark — useful for future systems (quests,
   NPC dialogue, sound, animation) to branch on "what kind of place is this"
   independently of whether a live interaction is wired up yet. */
export type InteractionType =
  | 'reward'        // grants the player something on interact
  | 'discovery'      // reveals information/content on interact
  | 'leaderboard'    // shows a ranking/standings view
  | 'travel'         // notice about movement/travel between areas
  | 'alert'          // ambient alert / notification flavor
  | 'social'         // social/gathering hub
  | 'notice'         // announcements / community board
  | 'rest'           // rest stop / buff spot
  | 'scenic';        // ambient/scenic, no functional payload

export interface WorldObject {
  id: string;
  displayName: string;
  /** Fraction of world width, 0–1 */
  x: number;
  /** Fraction of world height, 0–1 */
  y: number;
  /** Trigger radius in world px */
  interactionRadius: number;
  interactionType: InteractionType;
  /** Flavor text for not-yet-built features (quests, dialogue, tooltips) */
  futureDescription: string;
  /** Placeholder icon for future signposts/minimap/quest UI */
  futureIcon: string;
}

/* ─── Registry ───
   Every interactable landmark in RugTown. Adding a new landmark means
   adding one entry here — nothing else should hardcode a position. */
export const WORLD_OBJECTS: WorldObject[] = [
  {
    id: 'fountain',
    displayName: 'Spawn Fountain',
    x: 0.38,
    y: 0.58,
    interactionRadius: 110,
    interactionType: 'reward',
    futureDescription: 'Toss a coin for good luck and claim a small REP reward. Future updates may add daily streaks and seasonal wishes.',
    futureIcon: '⛲',
  },
  {
    id: 'market',
    displayName: 'Meme Market',
    x: 0.62,
    y: 0.28,
    interactionRadius: 120,
    interactionType: 'discovery',
    futureDescription: 'Stalls trading the latest meme tokens. Future updates may add live price tickers and trading mini-games.',
    futureIcon: '🛒',
  },
  {
    id: 'fame',
    displayName: 'Hall of Fame',
    x: 0.22,
    y: 0.80,
    interactionRadius: 120,
    interactionType: 'leaderboard',
    futureDescription: "A monument to RugTown's top degens. Future updates may add a live leaderboard and seasonal inductions.",
    futureIcon: '🏛️',
  },
  {
    id: 'bridge',
    displayName: 'Bridge',
    x: 0.55,
    y: 0.46,
    interactionRadius: 100,
    interactionType: 'travel',
    futureDescription: 'Crossing point into neighboring districts. Future updates may unlock fast travel and new zones beyond it.',
    futureIcon: '🌉',
  },
  {
    id: 'alpha',
    displayName: 'Alpha Lounge',
    x: 0.75,
    y: 0.48,
    interactionRadius: 110,
    interactionType: 'social',
    futureDescription: 'An exclusive lounge for alpha calls and private chat. Planned for a future social/chat update.',
    futureIcon: '🛋️',
  },
  {
    id: 'whale',
    displayName: 'Whale Tower',
    x: 0.55,
    y: 0.70,
    interactionRadius: 120,
    interactionType: 'alert',
    futureDescription: 'A watchtower for tracking large wallet movements. Future updates may add a live whale-alert feed.',
    futureIcon: '🐳',
  },
  {
    id: 'notice',
    displayName: 'Notice Board',
    x: 0.42,
    y: 0.40,
    interactionRadius: 90,
    interactionType: 'notice',
    futureDescription: 'Community notices and event announcements. Planned for a future quest/events update.',
    futureIcon: '📌',
  },
  {
    id: 'coffee',
    displayName: 'Coffee Shop',
    x: 0.30,
    y: 0.68,
    interactionRadius: 90,
    interactionType: 'rest',
    futureDescription: 'A cozy spot to rest and catch up on city gossip. Planned for a future NPC dialogue and buff update.',
    futureIcon: '☕',
  },
  {
    id: 'park',
    displayName: 'Park Entrance',
    x: 0.78,
    y: 0.68,
    interactionRadius: 100,
    interactionType: 'scenic',
    futureDescription: 'A quiet green corner of RugTown. Planned for a future ambient sound and idle-animation update.',
    futureIcon: '🌳',
  },
];

/* ─── Lookups ─── */
export function getWorldObject(id: string): WorldObject | undefined {
  return WORLD_OBJECTS.find(o => o.id === id);
}

/** Fractional (x,y) → real world pixels, once worldW/worldH are known. */
export function toWorldPosition(obj: WorldObject, worldW: number, worldH: number): { wx: number; wy: number } {
  return { wx: obj.x * worldW, wy: obj.y * worldH };
}

/* ─── Live interaction set ───
   Landmarks with a real interaction wired up today (proximity prompt +
   modal). Everything else in WORLD_OBJECTS is registered and ready for
   future quests/NPCs/sounds/animations to reference, but isn't triggered
   by the player yet. Expanding a landmark's interaction later means
   adding its id here — no coordinate or detection-logic changes needed. */
const LIVE_INTERACTION_IDS = new Set(['fountain', 'market', 'fame', 'bridge', 'whale']);

export function isInteractionLive(obj: WorldObject): boolean {
  return LIVE_INTERACTION_IDS.has(obj.id);
}

export function getLiveWorldObjects(): WorldObject[] {
  return WORLD_OBJECTS.filter(isInteractionLive);
}
