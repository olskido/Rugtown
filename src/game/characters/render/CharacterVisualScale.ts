/**
 * Visual scale constants — preserved from prior gameplay feel.
 * Independent of atlas native pixel size; BitmapCharacter applies fit-to-height.
 */
export const PLAYER_VISUAL_SCALE = 0.82;
export const REMOTE_PLAYER_VISUAL_SCALE = 0.82;
// Phase 11B: NPCs were set to exactly 120% of their prior 0.78 visual
// size (0.78 * 1.2 = 0.936).
// Phase 11C: applied ONCE more, on top of the Phase 11B runtime value
// (not the pre-11B 0.78 baseline) — 0.936 * 1.30 = 1.2168. Verified this
// is the only NPC visual-scale multiplier site (WorldScene.ts uses this
// constant exactly once, for BitmapCharacter's `visualScale` option on
// NPC construction — not for Town Crier or the player, and not for
// collision/interaction/hitbox radius, which are unaffected).
const NPC_VISUAL_SCALE_PHASE_11B = 0.78 * 1.2; // 0.936
export const NPC_VISUAL_SCALE = NPC_VISUAL_SCALE_PHASE_11B * 1.3; // 1.2168
export const TARGET_DISPLAY_HEIGHT = 48;
export const SHADOW_W = 18;
export const SHADOW_H = 7;
