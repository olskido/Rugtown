/**
 * Day/night presentation — restrained overlay; does not affect collision.
 * Uses accelerated world clock aligned to local Date for demo; document
 * as non-authoritative (server events use server timestamps).
 */

export type DayPhase = 'morning' | 'day' | 'sunset' | 'night';

export interface DayNightState {
  phase: DayPhase;
  /** 0..1 darkness strength for overlay. */
  darkness: number;
  /** Accelerated hour 0..24. */
  worldHour: number;
}

/** One full day every 24 real minutes (1 world hour ≈ 60s). */
export function getDayNightState(nowMs = Date.now(), reducedDarkness = false): DayNightState {
  const cycleMs = 24 * 60 * 1000;
  const t = (nowMs % cycleMs) / cycleMs;
  const worldHour = t * 24;
  let phase: DayPhase = 'day';
  let darkness = 0;
  if (worldHour >= 5 && worldHour < 8) {
    phase = 'morning';
    darkness = 0.12;
  } else if (worldHour >= 8 && worldHour < 17) {
    phase = 'day';
    darkness = 0;
  } else if (worldHour >= 17 && worldHour < 20) {
    phase = 'sunset';
    darkness = 0.18;
  } else {
    phase = 'night';
    darkness = 0.38;
  }
  if (reducedDarkness) darkness *= 0.45;
  return { phase, darkness, worldHour };
}

export function dayNightOverlayCss(state: DayNightState): string {
  if (state.darkness <= 0.01) return 'transparent';
  if (state.phase === 'sunset') {
    return `rgba(40, 18, 8, ${state.darkness})`;
  }
  if (state.phase === 'morning') {
    return `rgba(20, 28, 40, ${state.darkness})`;
  }
  return `rgba(4, 8, 16, ${state.darkness})`;
}
