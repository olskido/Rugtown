/** Animation / pose states for CharacterAnimationController. */
export type CharacterAnimState =
  | 'idle'
  | 'walk'
  | 'interact'
  | 'emote'
  | 'celebration'
  | 'afk';

export const CHARACTER_ANIM_STATES: CharacterAnimState[] = [
  'idle', 'walk', 'interact', 'emote', 'celebration', 'afk',
];
