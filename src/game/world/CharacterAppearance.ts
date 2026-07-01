import { CHARACTER_STYLES, getCharacterStyle, DEFAULT_CHARACTER_STYLE_ID } from './CharacterStyles';

/*
  CharacterAppearance.ts
  ────────────────────────
  Modular RPG-style appearance system — replaces the single "outfit"
  pick with one independent choice per slot (hairstyle, skin tone,
  facial hair, hat, glasses, accessory, jacket, pants, shoes, backpack,
  handheld). Pure data/logic, no Phaser import (same convention as
  CharacterStyles.ts, which this file builds on rather than replaces —
  the existing 8 outfits become the "jacket" slot unchanged).

  Two layers:
  - `CharacterAppearance`  — the picks (one id per category), what gets
    stored/threaded through props and what the creator UI edits.
  - `ResolvedAppearance`   — the picks resolved to concrete draw values
    (colors + shape ids), computed once via `resolveAppearance()` and
    cached on the character (never recomputed per frame).

  `generateRandomAppearance()` independently randomizes every category
  for procedural NPCs. No dedup/uniqueness bookkeeping is needed: the
  combinatorial space here (6 skin × 8 hairstyles × 4 facial hair ×
  6 hats × 3 glasses × 4 accessories × 8 jackets × 4 pants × 4 shoes ×
  3 backpacks × 4 handheld ≈ 17M+ combinations) makes two identical
  citizens across a 40-60 population practically impossible.
*/

/* ─── Shape id unions — what HumanoidRenderer.ts switches on ─── */
export type HairShapeId = 'hood' | 'bald' | 'short' | 'long' | 'mohawk';
export type FacialHairId = 'none' | 'stubble' | 'beard' | 'mustache';
export type HatShapeId = 'none' | 'beanie' | 'cap' | 'topHat';
export type GlassesId = 'none' | 'shades' | 'round';
export type AccessoryShapeId = 'none' | 'chain' | 'earring' | 'scarf';
export type PantsShapeId = 'long' | 'short';
export type ShoesShapeId = 'sneakers' | 'boots' | 'sandals';
export type BackpackShapeId = 'none' | 'satchel' | 'hikingPack';
export type HandheldId = 'none' | 'phone' | 'coffeeCup' | 'briefcase';

/* ─── The picks — one id per category ─── */
export interface CharacterAppearance {
  skinTone: string;
  hairstyle: string;
  facialHair: string;
  hat: string;
  glasses: string;
  accessory: string;
  jacket: string;
  pants: string;
  shoes: string;
  backpack: string;
  handheld: string;
}

/* ─── Resolved — concrete values the renderer consumes directly ─── */
export interface ResolvedAppearance {
  skinColor: number;
  hairShape: HairShapeId;
  hairColor: number;
  facialHair: FacialHairId;
  facialHairColor: number;
  hat: HatShapeId;
  hatColor: number;
  glasses: GlassesId;
  accessory: AccessoryShapeId;
  accessoryColor: number;
  coatColor: number;
  coatHighlite: number;
  coatShade: number;
  accentColor: number;
  pants: PantsShapeId;
  pantsColor: number;
  shoes: ShoesShapeId;
  shoesColor: number;
  backpack: BackpackShapeId;
  backpackColor: number;
  handheld: HandheldId;
}

/** Darkens (factor < 1) or lightens (factor > 1) a 0xRRGGBB color —
 *  used to derive a second tone from a single stored category color
 *  (e.g. pants' alternating-leg shade) instead of storing two fields
 *  per category. */
export function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

/* ─── Option catalogs (creator UI iterates these directly) ─── */

export const SKIN_TONES: { id: string; name: string; color: number }[] = [
  { id: 'tan',        name: 'Tan',        color: 0xd4a878 },
  { id: 'golden',     name: 'Golden',     color: 0xc89868 },
  { id: 'bronze',     name: 'Bronze',     color: 0xb88858 },
  { id: 'fair',       name: 'Fair',       color: 0xe0b890 },
  { id: 'deep',       name: 'Deep',       color: 0x8a6040 },
  { id: 'porcelain',  name: 'Porcelain',  color: 0xf0d0b0 },
];

/** "Hoodie Hood" reproduces today's hardcoded hood exactly (same shape,
 *  same 0x171720 color) — the default pick, so a fresh character looks
 *  identical to the game's current look until the player changes it. */
export const HAIRSTYLE_OPTIONS: { id: string; name: string; shape: HairShapeId; color: number }[] = [
  { id: 'hoodieHood',   name: 'Hoodie Hood',     shape: 'hood',   color: 0x171720 },
  { id: 'bald',         name: 'Bald',            shape: 'bald',   color: 0x171720 },
  { id: 'shortBlack',   name: 'Short (Black)',   shape: 'short',  color: 0x171720 },
  { id: 'shortBlonde',  name: 'Short (Blonde)',  shape: 'short',  color: 0xd8b860 },
  { id: 'longBlack',    name: 'Long (Black)',    shape: 'long',   color: 0x171720 },
  { id: 'longRed',      name: 'Long (Red)',      shape: 'long',   color: 0xa84028 },
  { id: 'mohawkTeal',   name: 'Mohawk (Teal)',   shape: 'mohawk', color: 0x3ecfc0 },
  { id: 'mohawkGray',   name: 'Mohawk (Gray)',   shape: 'mohawk', color: 0x9a9aa0 },
];

export const FACIAL_HAIR_OPTIONS: { id: FacialHairId; name: string }[] = [
  { id: 'none',     name: 'None' },
  { id: 'stubble',  name: 'Stubble' },
  { id: 'beard',    name: 'Beard' },
  { id: 'mustache', name: 'Mustache' },
];

export const HAT_OPTIONS: { id: string; name: string; shape: HatShapeId; color: number }[] = [
  { id: 'none',        name: 'None',            shape: 'none',   color: 0x000000 },
  { id: 'beanieBlack', name: 'Beanie (Black)',  shape: 'beanie', color: 0x171720 },
  { id: 'beanieGold',  name: 'Beanie (Gold)',   shape: 'beanie', color: 0xc8902a },
  { id: 'capBlack',    name: 'Cap (Black)',     shape: 'cap',    color: 0x1c1e22 },
  { id: 'capRed',      name: 'Cap (Red)',       shape: 'cap',    color: 0xc83838 },
  { id: 'topHat',      name: 'Top Hat',         shape: 'topHat', color: 0x171720 },
];

export const GLASSES_OPTIONS: { id: GlassesId; name: string }[] = [
  { id: 'none',   name: 'None' },
  { id: 'shades', name: 'Shades' },
  { id: 'round',  name: 'Round Glasses' },
];

export const ACCESSORY_OPTIONS: { id: string; name: string; shape: AccessoryShapeId; color: number }[] = [
  { id: 'none',      name: 'None',       shape: 'none',    color: 0x000000 },
  { id: 'goldChain', name: 'Gold Chain', shape: 'chain',   color: 0xe8b84b },
  { id: 'earring',   name: 'Earring',    shape: 'earring', color: 0xe8b84b },
  { id: 'scarf',     name: 'Scarf',      shape: 'scarf',   color: 0xc83838 },
];

/** Jacket reuses CharacterStyles.ts unchanged — no new code, just a
 *  category alias so the creator UI can treat it like every other slot. */
export const JACKET_OPTIONS = CHARACTER_STYLES;

export const PANTS_OPTIONS: { id: string; name: string; shape: PantsShapeId; color: number }[] = [
  { id: 'darkDenim',   name: 'Dark Denim',  shape: 'long',  color: 0x2a3038 },
  { id: 'cargo',       name: 'Cargo',       shape: 'long',  color: 0x4a4530 },
  { id: 'trackPants',  name: 'Track Pants', shape: 'long',  color: 0x202428 },
  { id: 'shorts',      name: 'Shorts',      shape: 'short', color: 0x2a3038 },
];

export const SHOES_OPTIONS: { id: string; name: string; shape: ShoesShapeId; color: number }[] = [
  { id: 'sneakersBlack', name: 'Sneakers (Black)', shape: 'sneakers', color: 0x0c0c0e },
  { id: 'sneakersWhite', name: 'Sneakers (White)', shape: 'sneakers', color: 0xd8d0c0 },
  { id: 'boots',         name: 'Boots',            shape: 'boots',    color: 0x3a2818 },
  { id: 'sandals',       name: 'Sandals',          shape: 'sandals',  color: 0x8a6040 },
];

export const BACKPACK_OPTIONS: { id: string; name: string; shape: BackpackShapeId; color: number }[] = [
  { id: 'none',         name: 'None',        shape: 'none',       color: 0x000000 },
  { id: 'satchel',      name: 'Satchel',     shape: 'satchel',    color: 0x4a3420 },
  { id: 'hikingPack',   name: 'Hiking Pack', shape: 'hikingPack', color: 0x2e4830 },
];

export const HANDHELD_OPTIONS: { id: HandheldId; name: string }[] = [
  { id: 'none',        name: 'None' },
  { id: 'phone',        name: 'Phone' },
  { id: 'coffeeCup',    name: 'Coffee Cup' },
  { id: 'briefcase',    name: 'Briefcase' },
];

/* ─── Default — picked so resolveAppearance(DEFAULT_APPEARANCE) is
   pixel-identical to the game's pre-creator look (hood up, no hat/
   glasses/facial hair/accessory/backpack/handheld, default jacket). ─── */
export const DEFAULT_APPEARANCE: CharacterAppearance = {
  skinTone: SKIN_TONES[0].id,
  hairstyle: HAIRSTYLE_OPTIONS[0].id,
  facialHair: 'none',
  hat: 'none',
  glasses: 'none',
  accessory: 'none',
  jacket: DEFAULT_CHARACTER_STYLE_ID,
  pants: PANTS_OPTIONS[0].id,
  shoes: SHOES_OPTIONS[0].id,
  backpack: 'none',
  handheld: 'none',
};

function findOrFirst<T extends { id: string }>(list: T[], id: string): T {
  return list.find(item => item.id === id) ?? list[0];
}

/** Resolves a `CharacterAppearance` (ids) into concrete draw values.
 *  Call once per character on appearance change — never per frame. */
export function resolveAppearance(appearance: CharacterAppearance): ResolvedAppearance {
  const skin = findOrFirst(SKIN_TONES, appearance.skinTone);
  const hair = findOrFirst(HAIRSTYLE_OPTIONS, appearance.hairstyle);
  const facialHair = findOrFirst(FACIAL_HAIR_OPTIONS, appearance.facialHair);
  const hat = findOrFirst(HAT_OPTIONS, appearance.hat);
  const glasses = findOrFirst(GLASSES_OPTIONS, appearance.glasses);
  const accessory = findOrFirst(ACCESSORY_OPTIONS, appearance.accessory);
  const jacket = getCharacterStyle(appearance.jacket);
  const pants = findOrFirst(PANTS_OPTIONS, appearance.pants);
  const shoes = findOrFirst(SHOES_OPTIONS, appearance.shoes);
  const backpack = findOrFirst(BACKPACK_OPTIONS, appearance.backpack);
  const handheld = findOrFirst(HANDHELD_OPTIONS, appearance.handheld);

  return {
    skinColor: skin.color,
    hairShape: hair.shape,
    hairColor: hair.color,
    facialHair: facialHair.id,
    facialHairColor: hair.color,
    hat: hat.shape,
    hatColor: hat.color,
    glasses: glasses.id,
    accessory: accessory.shape,
    accessoryColor: accessory.color,
    coatColor: jacket.coatColor,
    coatHighlite: jacket.coatHighlite,
    coatShade: jacket.coatShade,
    accentColor: jacket.accentColor,
    pants: pants.shape,
    pantsColor: pants.color,
    shoes: shoes.shape,
    shoesColor: shoes.color,
    backpack: backpack.shape,
    backpackColor: backpack.color,
    handheld: handheld.id,
  };
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Independent random pick per category — used by createNpcs() so every
 * citizen is procedurally generated. `preferredJacketId`, when given,
 * pins the jacket slot (preserves the existing "alpha analysts wear
 * teal" personality flavor) while every other category still randomizes
 * freely; omit it to randomize the jacket too.
 */
export function generateRandomAppearance(preferredJacketId?: string): CharacterAppearance {
  return {
    skinTone: pickRandom(SKIN_TONES).id,
    hairstyle: pickRandom(HAIRSTYLE_OPTIONS).id,
    facialHair: pickRandom(FACIAL_HAIR_OPTIONS).id,
    hat: pickRandom(HAT_OPTIONS).id,
    glasses: pickRandom(GLASSES_OPTIONS).id,
    accessory: pickRandom(ACCESSORY_OPTIONS).id,
    jacket: preferredJacketId ?? pickRandom(CHARACTER_STYLES).id,
    pants: pickRandom(PANTS_OPTIONS).id,
    shoes: pickRandom(SHOES_OPTIONS).id,
    backpack: pickRandom(BACKPACK_OPTIONS).id,
    handheld: pickRandom(HANDHELD_OPTIONS).id,
  };
}
