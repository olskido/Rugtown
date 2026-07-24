/**
 * WorldPalette.ts
 * ───────────────
 * Shared visual constants + deterministic randomness for the RugTown World Engine.
 *
 * These are the exact colours that used to live inside CityMapSystem. They are
 * centralised here so every generator (Road / Building / District / Decoration)
 * draws with an identical palette and the city keeps looking the same.
 *
 * Dark / gold visual style only — no purple. No external assets needed.
 */

/* ─── Palette ─────────────────────────────────────────────────────────── */
export const C_GROUND_DARK   = 0x0c1014;
export const C_GROUND_MID    = 0x111820;
export const C_GROUND_ROAD   = 0x141e28;
export const C_BORDER_GOLD   = 0xc8902a;
export const C_BORDER_DIM    = 0x3a2a10;
export const C_WALL_DARK     = 0x080c0f;
export const C_WALL_ACCENT   = 0x1e2a30;
export const C_FENCE_LINE    = 0x2a4a5a;
export const C_ROCK          = 0x1a2030;
export const C_ROCK_EDGE     = 0x2a3040;
export const C_LAMP_GLOW     = 0xe8b84b;
export const C_BUILDING_A    = 0x0d1620;
export const C_BUILDING_B    = 0x111c28;
export const C_BUILDING_WIN  = 0xe8b84b;
export const C_VAULT_FACE    = 0x0a1218;
export const C_VAULT_GOLD    = 0xe8c840;
export const C_LOCK_METAL    = 0x506070;
export const C_ARENA_FACE    = 0x0e1822;
export const C_ARENA_ACCENT  = 0xd4a030;
export const C_DOOR_FRAME    = 0xb07820;
export const C_DOOR_DARK     = 0x050a0e;

/* ─── Decoration palette (foliage / props) ───────────────────────────── */
export const C_LEAF_DARK     = 0x142218;
export const C_LEAF_MID      = 0x1c3324;
export const C_TRUNK         = 0x2a1e12;
export const C_FLOWER_GOLD   = 0xe8c840;
export const C_FLOWER_RED    = 0xb03a2a;
export const C_BENCH_WOOD    = 0x3a2a18;
export const C_METAL_DARK    = 0x2a3a48;

/**
 * Global default seed for the world's decorative layout. Re-generating with the
 * same seed reproduces the exact same decoration placement.
 */
export const RUGTOWN_WORLD_SEED = 0x52544f57; // "RTOW"

/**
 * mulberry32 — small, fast, deterministic PRNG.
 * Returns a function producing floats in [0, 1). Seed fully determines output.
 */
export function makeSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically derive a 32-bit numeric seed from any string. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
