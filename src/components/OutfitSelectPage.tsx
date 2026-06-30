import React, { useState } from 'react';
import { CHARACTER_STYLES, DEFAULT_CHARACTER_STYLE_ID } from '../game/world/CharacterStyles';

/*
  OutfitSelectPage.tsx
  ─────────────────────
  New step between LandingPage and GamePage: choose an outfit before
  entering the city. Reuses the landing screen's background/particle
  classes (landing.css) for visual continuity, with its own
  `.outfit-select` card styles (game.css). Selection is local React
  state only — handed up via onSelect, nothing persisted.

  Swatches/colors come straight from CharacterStyles.ts, the same
  registry WorldScene reads from, so the preview never drifts from
  the actual in-game look.
*/

const OUTFIT_BLURBS: Record<string, string> = {
  degenHoodie:       'The classic look. Gold trim, low profile.',
  goldHolderCoat:    'Rich gold tones for the long-term holders.',
  whaleSuit:         'Icy blues. You move the market and you know it.',
  marketTrader:      'Warm amber. Always watching the order book.',
  alphaAnalyst:      'Teal accents. Quiet alpha, loud results.',
  rugAlleyInformant: 'Red flags, literally. Trust no dev.',
  builderJacket:     'Safety orange. Still shipping, still building.',
  memeLord:          'Playful pink. Probably nothing.',
};

interface OutfitSelectPageProps {
  playerName: string;
  onSelect: (outfitId: string) => void;
}

export function OutfitSelectPage({ playerName, onSelect }: OutfitSelectPageProps) {
  const [selected, setSelected] = useState(DEFAULT_CHARACTER_STYLE_ID);

  return (
    <div className="landing outfit-select landing--mounted">
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
            <h1 className="card__logo outfit-select__title">
              <span className="card__logo-text">CHOOSE YOUR LOOK</span>
            </h1>
            <p className="outfit-select__subtitle">
              {playerName}, pick how you'll be seen on the streets of RugTown.
            </p>

            <div className="outfit-grid" role="radiogroup" aria-label="Outfit selection">
              {CHARACTER_STYLES.map((style) => {
                const isActive = style.id === selected;
                return (
                  <button
                    key={style.id}
                    type="button"
                    className={`outfit-card ${isActive ? 'outfit-card--active' : ''}`}
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setSelected(style.id)}
                  >
                    <span
                      className="outfit-card__swatch"
                      style={{
                        background: `linear-gradient(160deg, #${style.coatHighlite.toString(16).padStart(6, '0')}, #${style.coatColor.toString(16).padStart(6, '0')} 55%, #${style.coatShade.toString(16).padStart(6, '0')})`,
                        boxShadow: `0 0 0 2px #${style.accentColor.toString(16).padStart(6, '0')}55 inset`,
                      }}
                      aria-hidden
                    >
                      <span
                        className="outfit-card__accent-dot"
                        style={{ background: `#${style.accentColor.toString(16).padStart(6, '0')}` }}
                      />
                    </span>
                    <span className="outfit-card__name">{style.name}</span>
                    <span className="outfit-card__blurb">{OUTFIT_BLURBS[style.id] ?? ''}</span>
                    {isActive && <span className="outfit-card__check" aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>

            <button
              className="btn btn--primary outfit-select__enter"
              onClick={() => onSelect(selected)}
              aria-label="Confirm outfit and enter RugTown"
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
