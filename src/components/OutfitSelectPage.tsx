import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterPreviewGame } from '../game/CharacterPreviewGame';
import {
  SKIN_TONES,
  HAIRSTYLE_OPTIONS,
  FACIAL_HAIR_OPTIONS,
  HAT_OPTIONS,
  GLASSES_OPTIONS,
  ACCESSORY_OPTIONS,
  JACKET_OPTIONS,
  PANTS_OPTIONS,
  SHOES_OPTIONS,
  BACKPACK_OPTIONS,
  HANDHELD_OPTIONS,
  DEFAULT_APPEARANCE,
  type CharacterAppearance,
} from '../game/world/CharacterAppearance';

/*
  OutfitSelectPage.tsx
  ─────────────────────
  Character creator — the pre-game step between landing and GamePage.
  Replaces the original 8 static CSS-swatch cards with:

  • A live, idle-breathing animated preview rendered through the same
    drawHumanoid() function WorldScene uses, so the preview is always
    bit-identical to the in-game look.
  • Compact prev/next slot-picker rows, one per appearance category.

  Visual design: same black/gold language as the rest of the game
  (panel-corners, Cinzel font, gold borders) — no new visual style.
  The card is ~40% narrower than before (max 490px vs 720px) so more
  of the city background shows through.
*/

const OUTFIT_BLURBS: Record<string, string> = {
  degenHoodie:        'The classic look. Gold trim, low profile.',
  goldHolderCoat:     'Rich gold tones for the long-term holders.',
  whaleSuit:          'Icy blues. You move the market and you know it.',
  marketTrader:       'Warm amber. Always watching the order book.',
  alphaAnalyst:       'Teal accents. Quiet alpha, loud results.',
  rugAlleyInformant:  'Red flags, literally. Trust no dev.',
  builderJacket:      'Safety orange. Still shipping, still building.',
  memeLord:           'Playful pink. Probably nothing.',
};

type Category = keyof CharacterAppearance;

interface SlotConfig {
  key: Category;
  label: string;
  options: { id: string; name: string }[];
}

const SLOTS: SlotConfig[] = [
  { key: 'skinTone',  label: 'Skin',       options: SKIN_TONES },
  { key: 'hairstyle', label: 'Hairstyle',  options: HAIRSTYLE_OPTIONS },
  { key: 'facialHair',label: 'Facial Hair',options: FACIAL_HAIR_OPTIONS },
  { key: 'hat',       label: 'Hat',        options: HAT_OPTIONS },
  { key: 'glasses',   label: 'Glasses',    options: GLASSES_OPTIONS },
  { key: 'accessory', label: 'Accessory',  options: ACCESSORY_OPTIONS },
  { key: 'jacket',    label: 'Jacket',     options: JACKET_OPTIONS },
  { key: 'pants',     label: 'Pants',      options: PANTS_OPTIONS },
  { key: 'shoes',     label: 'Shoes',      options: SHOES_OPTIONS },
  { key: 'backpack',  label: 'Backpack',   options: BACKPACK_OPTIONS },
  { key: 'handheld',  label: 'Handheld',   options: HANDHELD_OPTIONS },
];

interface OutfitSelectPageProps {
  playerName: string;
  onSelect: (appearance: CharacterAppearance, playerName: string) => void;
  /**
   * Pre-filled appearance loaded from the user's Supabase profile.
   * Guests receive undefined here and start with DEFAULT_APPEARANCE.
   * App.tsx guarantees this is set before the component mounts (data is
   * fetched before the screen transition), so no async update is needed.
   */
  initialAppearance?: CharacterAppearance;
}

export function OutfitSelectPage({ playerName, onSelect, initialAppearance }: OutfitSelectPageProps) {
  const [appearance, setAppearance] = useState<CharacterAppearance>(
    initialAppearance ?? DEFAULT_APPEARANCE,
  );
  const [nickname, setNickname] = useState(playerName || '');
  const previewGameRef = useRef<CharacterPreviewGame | null>(null);
  const mountedRef = useRef(false);

  // Boot the preview Phaser.Game once on mount — same cancelled-flag
  // StrictMode-safe pattern used by GamePage.tsx for the main game.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    let cancelled = false;

    const game = new CharacterPreviewGame({
      parentId: 'character-preview-mount',
      initialAppearance: appearance,
      onReady: () => {
        if (cancelled) return;
        previewGameRef.current = game;
      },
    });
    // Also store immediately so the appearance-update effect can reach
    // it before the 'ready' event fires.
    previewGameRef.current = game;

    return () => {
      cancelled = true;
      game.destroy();
      previewGameRef.current = null;
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push appearance changes to the preview scene WITHOUT remounting.
  useEffect(() => {
    previewGameRef.current?.setAppearance(appearance);
  }, [appearance]);

  const cycleSlot = useCallback((key: Category, direction: -1 | 1) => {
    setAppearance(prev => {
      const slotCfg = SLOTS.find(s => s.key === key);
      if (!slotCfg) return prev;
      const { options } = slotCfg;
      const currentIdx = options.findIndex(o => o.id === prev[key]);
      const nextIdx = (currentIdx + direction + options.length) % options.length;
      return { ...prev, [key]: options[nextIdx].id };
    });
  }, []);

  const randomize = useCallback(() => {
    setAppearance(prev => {
      const next = { ...prev };
      for (const slot of SLOTS) {
        next[slot.key] = slot.options[Math.floor(Math.random() * slot.options.length)].id;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (playerName) setNickname(playerName);
  }, [playerName]);

  const handleEnter = useCallback(() => {
    const name = nickname.trim() || `Degen${Math.floor(Math.random() * 9999)}`;
    onSelect(appearance, name);
  }, [appearance, nickname, onSelect]);

  return (
    <div className="landing outfit-select landing--mounted screen-enter">
      <div className="landing__bg" aria-hidden>
        <div className="landing__bg-city" />
        <div className="landing__vignette-warm" />
        <div className="landing__overlay" />
      </div>

      <main className="outfit-select__content">
        <div className="landing__card outfit-select__card" role="main">
          <div className="card__top-ornament" aria-hidden>
            <div className="card__top-ornament-line" />
          </div>
          <span className="card__corner card__corner--tl" aria-hidden>◆</span>
          <span className="card__corner card__corner--tr" aria-hidden>◆</span>
          <span className="card__corner card__corner--bl" aria-hidden>◆</span>
          <span className="card__corner card__corner--br" aria-hidden>◆</span>

          <div className="card__inner outfit-select__inner">
            <div className="outfit-select__header">
              <h1 className="card__logo outfit-select__title">
                <span className="card__logo-text">CHARACTER</span>
              </h1>
              <p className="outfit-select__subtitle">
                Choose your degen name and build your look.
              </p>
            </div>

            <div className="outfit-nickname-row">
              <label className="outfit-nickname-row__label" htmlFor="outfit-nickname">
                Degen Name
              </label>
              <input
                id="outfit-nickname"
                className="guest__input outfit-nickname-input"
                type="text"
                placeholder="GuestDegen420"
                maxLength={20}
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnter()}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Degen name"
              />
            </div>

            <div className="outfit-select__body">
              {/* Live animated preview pane */}
              <div className="outfit-preview-pane">
                <div id="character-preview-mount" className="outfit-preview-canvas" />
              </div>

              {/* Slot-picker rows */}
              <div className="outfit-slots">
                {SLOTS.map(slot => {
                  const currentId = appearance[slot.key];
                  const currentOpt = slot.options.find(o => o.id === currentId) ?? slot.options[0];
                  const blurb = slot.key === 'jacket' ? OUTFIT_BLURBS[currentId] ?? '' : '';
                  return (
                    <div key={slot.key} className="outfit-slot-row">
                      <span className="outfit-slot-row__label">{slot.label}</span>
                      <div className="outfit-slot-row__control">
                        <button
                          className="outfit-slot-arrow"
                          onClick={() => cycleSlot(slot.key, -1)}
                          aria-label={`Previous ${slot.label}`}
                        >‹</button>
                        <span className="outfit-slot-row__value" title={blurb}>
                          {currentOpt.name}
                        </span>
                        <button
                          className="outfit-slot-arrow"
                          onClick={() => cycleSlot(slot.key, 1)}
                          aria-label={`Next ${slot.label}`}
                        >›</button>
                      </div>
                    </div>
                  );
                })}

                <button className="outfit-randomize-btn" onClick={randomize} type="button">
                  🎲 Randomize
                </button>
              </div>
            </div>

            <button
              className="btn btn--primary outfit-select__enter"
              onClick={handleEnter}
              aria-label="Confirm look and enter RugTown"
            >
              <span className="btn__shimmer" aria-hidden />
              <span className="btn__arrow" aria-hidden>▶</span>
              <span className="btn__label">Enter RugTown</span>
            </button>
          </div>

          <div className="card__bottom-ornament" aria-hidden>
            <div className="card__top-ornament-line" />
          </div>
        </div>
      </main>
    </div>
  );
}
