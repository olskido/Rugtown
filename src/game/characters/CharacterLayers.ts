/** Product layer stack for bitmap characters (bottom → top). */
export const CHARACTER_LAYER_ORDER = [
  'base',
  'pants',
  'shoes',
  'hair',
  'facial-hair',
  'headwear',
  'accessories',
] as const;

export type CharacterLayerId = (typeof CHARACTER_LAYER_ORDER)[number];
