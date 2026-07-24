/**
 * MinimapTheme.ts — Phase 10C centralized map colors and marker sizes.
 * Do not scatter raw hex values through UI components.
 */

export const MINIMAP_TEXTURE_URL = '/assets/world/minimap_rugtown.png';
export const MINIMAP_TEXTURE_FALLBACK_URL = '/assets/world/main_rugtown.png';

/** World aspect (4344×1448 ≈ 3:1). */
export const MINIMAP_WORLD_ASPECT = 3;

export const MINIMAP_THEME = {
  overlay: 'rgba(4, 8, 14, 0.38)',

  localPlayer: {
    fill: '#3ee8ff',
    stroke: '#e8b84b',
    glow: 'rgba(62, 232, 255, 0.55)',
    radius: 5,
    arrowLen: 7,
  },

  remotePlayer: {
    fill: '#4ade80',
    stroke: '#166534',
    glow: 'rgba(74, 222, 128, 0.45)',
    radius: 4,
  },

  npc: {
    fill: '#f5d0a0',
    stroke: '#a07030',
    glow: 'rgba(245, 208, 160, 0.35)',
    radius: 2.5,
    roamingFill: '#ffb86a',
  },

  landmark: {
    fill: '#e8b84b',
    stroke: '#7a5c1e',
    lockedFill: '#6a7a88',
    lockedStroke: '#3a4550',
    radius: 4,
    majorRadius: 5,
  },

  mission: {
    fill: '#ffd54a',
    stroke: '#ff9800',
    glow: 'rgba(255, 213, 74, 0.7)',
    radius: 7,
  },

  event: {
    fill: '#ff6b3d',
    stroke: '#c62828',
    glow: 'rgba(255, 107, 61, 0.65)',
    radius: 5,
  },

  water: {
    fill: 'rgba(48, 120, 180, 0.22)',
    stroke: 'rgba(72, 150, 210, 0.35)',
  },

  district: {
    stroke: 'rgba(232, 200, 120, 0.28)',
    fill: 'rgba(232, 184, 75, 0.05)',
    label: '#e8d5a3',
  },

  viewport: {
    stroke: 'rgba(200, 230, 255, 0.75)',
    fill: 'rgba(200, 230, 255, 0.06)',
    lineWidth: 1.25,
  },

  waypoint: {
    fill: '#c084fc',
    stroke: '#7c3aed',
    radius: 5,
  },

  road: {
    fill: 'rgba(40, 56, 72, 0.45)',
    stroke: 'rgba(60, 80, 100, 0.35)',
  },

  label: {
    text: '#e8d5a3',
    shadow: 'rgba(0,0,0,0.75)',
  },
} as const;

/** Major landmarks shown with icon on compact map. */
export const COMPACT_LANDMARK_IDS = new Set([
  'fountain', 'market', 'fame', 'bridge', 'arena', 'whale', 'government',
]);
