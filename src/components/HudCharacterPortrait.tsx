import React, { useEffect, useRef, useState } from 'react';
import { CharacterPreviewGame } from '../game/CharacterPreviewGame';
import type { CharacterAppearanceV1 } from '../game/characters/appearance/CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance } from '../game/characters/appearance/CharacterAppearanceDefaults';
import { encodeCharacterAppearance } from '../game/characters/appearance/CharacterAppearanceCodec';
import { characterAppearanceService } from '../game/characters/appearance/CharacterAppearanceService';

/**
 * Permanent top-left player-card portrait — same bitmap appearance as the
 * live character / creator (IDs only; no uploaded portrait image).
 */
export function HudCharacterPortrait() {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<CharacterPreviewGame | null>(null);
  const appearanceEncodeRef = useRef('');
  const previewAppearanceEncodeRef = useRef('');
  const [live, setLive] = useState<CharacterAppearanceV1>(
    () => characterAppearanceService.getAppearance() ?? getDefaultCharacterAppearance(),
  );

  useEffect(() => {
    const setCommittedAppearance = (next: CharacterAppearanceV1) => {
      if (encodeCharacterAppearance(next) === appearanceEncodeRef.current) return;
      appearanceEncodeRef.current = encodeCharacterAppearance(next);
      setLive(next);
    };
    setCommittedAppearance(characterAppearanceService.getAppearance());
    return characterAppearanceService.subscribe(setCommittedAppearance);
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    const game = new CharacterPreviewGame(hostRef.current, live);
    previewRef.current = game;
    previewAppearanceEncodeRef.current = encodeCharacterAppearance(live);
    return () => {
      game.destroy();
      previewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const encoded = encodeCharacterAppearance(live);
    if (encoded === previewAppearanceEncodeRef.current) return;
    previewAppearanceEncodeRef.current = encoded;
    previewRef.current?.setAppearance(live);
  }, [live]);

  return (
    <div className="player-avatar" aria-hidden>
      <div ref={hostRef} className="player-avatar__canvas" />
    </div>
  );
}
