/**
 * DayNightOverlay — restrained lighting wash over the Phaser canvas.
 */

import { useEffect, useState } from 'react';
import { dayNightOverlayCss, getDayNightState } from '../../game/world/DayNightCycle';

export function DayNightOverlay({ reducedDarkness = false }: { reducedDarkness?: boolean }) {
  const [color, setColor] = useState('transparent');
  const [phase, setPhase] = useState('day');

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      const state = getDayNightState(Date.now(), reducedDarkness || reducedMotion);
      setColor(dayNightOverlayCss(state));
      setPhase(state.phase);
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [reducedDarkness]);

  if (color === 'transparent') return null;

  return (
    <div
      className="day-night-overlay"
      aria-hidden
      data-phase={phase}
      style={{ background: color, pointerEvents: 'none' }}
    />
  );
}
