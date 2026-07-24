/**
 * Homepage visual configuration — single source for landing artwork.
 * Matches the in-game world background (Phase 10A / 10M).
 */

export const HOMEPAGE_VISUAL = {
  /** Same asset as WorldTerrainLayer / active playable world. */
  backgroundUrl: '/assets/world/main_rugtown.png',
  /** Object-position focal point (desktop). */
  focalDesktop: 'center 42%',
  /** Object-position for tablet. */
  focalTablet: 'center 48%',
  /** Object-position for mobile — keep plaza / bridge readable. */
  focalMobile: '38% 52%',
  overlay: {
    dark: 'rgba(4, 8, 10, 0.55)',
    goldWash: 'rgba(200, 144, 42, 0.12)',
  },
  parallaxEnabledDefault: true,
  reducedMotionDisableParallax: true,
} as const;

export type HomepageVisualConfig = typeof HOMEPAGE_VISUAL;
