/*
  CharacterStyles.ts
  ───────────────────
  Single source of truth for character outfit colors — shared by the
  player (picked on the outfit-select screen) and RugTown Citizens
  (assigned by personality). Pure data, no Phaser import, same pattern
  as WorldObjects.ts/CollisionZones.ts.

  Recoloring one shared silhouette (drawn in WorldScene's drawHumanoid)
  rather than per-outfit shapes — same technique already used for the
  5 original NPC variants, just promoted to a shared, player-selectable
  registry and extended to 8 outfits.
*/

export interface CharacterStyle {
  id: string;
  name: string;
  coatColor: number;
  coatHighlite: number;
  coatShade: number;
  accentColor: number;
}

export const CHARACTER_STYLES: CharacterStyle[] = [
  {
    id: 'degenHoodie',
    name: 'Degen Hoodie',
    coatColor: 0x1c1e22, coatHighlite: 0x2e3038, coatShade: 0x101216,
    accentColor: 0xe8b84b, // gold — the classic look
  },
  {
    id: 'goldHolderCoat',
    name: 'Gold Holder Coat',
    coatColor: 0x3a2e10, coatHighlite: 0xb8902a, coatShade: 0x1c1608,
    accentColor: 0xf3d896, // bright gold, richer than the default accent
  },
  {
    id: 'whaleSuit',
    name: 'Whale Suit',
    coatColor: 0x16243a, coatHighlite: 0x2a4868, coatShade: 0x0c1622,
    accentColor: 0x5cb8ec, // icy blue
  },
  {
    id: 'marketTrader',
    name: 'Market Trader',
    coatColor: 0x3a2a18, coatHighlite: 0x5a4228, coatShade: 0x201408,
    accentColor: 0xe8902a, // warm amber
  },
  {
    id: 'alphaAnalyst',
    name: 'Alpha Analyst',
    coatColor: 0x24282e, coatHighlite: 0x3c4450, coatShade: 0x141618,
    accentColor: 0x3ecfc0, // teal
  },
  {
    id: 'rugAlleyInformant',
    name: 'Rug Alley Informant',
    coatColor: 0x241418, coatHighlite: 0x3a1e24, coatShade: 0x140a0c,
    accentColor: 0xc83838, // red — not the usual gold
  },
  {
    id: 'builderJacket',
    name: 'Builder Jacket',
    coatColor: 0x2e2818, coatHighlite: 0x5a4a20, coatShade: 0x181408,
    accentColor: 0xe87020, // safety orange
  },
  {
    id: 'memeLord',
    name: 'Meme Lord',
    coatColor: 0x2a1830, coatHighlite: 0x4a2858, coatShade: 0x180c1c,
    accentColor: 0xe858c8, // playful pink
  },
];

export const DEFAULT_CHARACTER_STYLE_ID = 'degenHoodie';

export function getCharacterStyle(id: string | null | undefined): CharacterStyle {
  return CHARACTER_STYLES.find(s => s.id === id) ?? CHARACTER_STYLES[0];
}
