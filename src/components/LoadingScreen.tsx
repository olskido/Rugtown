import React, { useEffect, useState } from 'react';

/*
  LoadingScreen.tsx
  ─────────────────
  Black/gold interstitial shown after character creation and before
  GamePage mounts. Keeps the player off the map until Phaser is ready
  to boot — no blank flash, no early movement.
*/

const LOADING_MS_MIN = 3000;
const LOADING_MS_MAX = 5000;

interface LoadingScreenProps {
  playerName?: string;
  onComplete: () => void;
}

export function LoadingScreen({ playerName, onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  const tips = [
    'Claim REP at the Spawn Fountain',
    'Watch the Meme Market for live pumps',
    'Press E near citizens to chat',
    'Complete quests to unlock districts',
    'Real players appear when Supabase is live',
  ];

  useEffect(() => {
    const duration =
      LOADING_MS_MIN + Math.floor(Math.random() * (LOADING_MS_MAX - LOADING_MS_MIN));
    const start = performance.now();
    let raf = 0;
    let done = false;

    const tick = (now: number) => {
      if (done) return;
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (elapsed < duration) {
        raf = requestAnimationFrame(tick);
      } else {
        done = true;
        setProgress(100);
        onComplete();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [onComplete]);

  useEffect(() => {
    const id = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 2200);
    return () => clearInterval(id);
  }, [tips.length]);

  const displayName = playerName?.trim() || 'Degen';

  return (
    <div className="loading-screen screen-enter" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-screen__bg" aria-hidden>
        <div className="loading-screen__glow loading-screen__glow--tl" />
        <div className="loading-screen__glow loading-screen__glow--br" />
      </div>

      <div className="loading-screen__content">
        <div className="loading-screen__logo">RUGTOWN</div>
        <p className="loading-screen__tagline">The Degen City</p>

        <div className="loading-screen__divider" aria-hidden>
          <span className="loading-screen__divider-line" />
          <span className="loading-screen__divider-gem">◆</span>
          <span className="loading-screen__divider-line" />
        </div>

        <p className="loading-screen__status">
          Preparing the city for <strong>{displayName}</strong>…
        </p>

        <div className="loading-screen__bar-track" aria-hidden>
          <div
            className="loading-screen__bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="loading-screen__tip">{tips[tipIdx]}</p>
      </div>
    </div>
  );
}
