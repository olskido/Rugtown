import React, { useEffect, useId, useRef } from 'react';
import { CharacterPreviewGame } from '../game/CharacterPreviewGame';
import { DEFAULT_APPEARANCE, type CharacterAppearance } from '../game/world/CharacterAppearance';

/*
  HudCharacterPortrait.tsx
  ────────────────────────
  Small live character preview for the top-left HUD player card.
  Reuses CharacterPreviewGame / drawHumanoid() so the portrait matches
  the in-world look exactly.
*/

interface HudCharacterPortraitProps {
  appearance?: CharacterAppearance;
}

export function HudCharacterPortrait({ appearance = DEFAULT_APPEARANCE }: HudCharacterPortraitProps) {
  const reactId = useId().replace(/:/g, '');
  const parentId = `hud-player-portrait-${reactId}`;
  const previewRef = useRef<CharacterPreviewGame | null>(null);

  useEffect(() => {
    const game = new CharacterPreviewGame({
      parentId,
      initialAppearance: appearance,
      lowPower: true,
    });
    previewRef.current = game;
    return () => {
      game.destroy();
      previewRef.current = null;
    };
  // Mount once — appearance updates go through setAppearance below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  useEffect(() => {
    previewRef.current?.setAppearance(appearance);
  }, [appearance]);

  return (
    <div className="player-avatar" aria-hidden>
      <div id={parentId} className="player-avatar__canvas" />
    </div>
  );
}
