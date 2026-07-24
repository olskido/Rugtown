import React, { useState } from 'react';

interface OutfitSelectPageProps {
  playerName: string;
  onSelect: (playerName: string) => void;
}

/** Name-only entry screen. Player cosmetics are locked to the canonical look. */
export function OutfitSelectPage({ playerName, onSelect }: OutfitSelectPageProps) {
  const [name, setName] = useState(playerName);
  const canEnter = name.trim().length >= 2;
  const enter = () => {
    if (canEnter) onSelect(name.trim());
  };

  return (
    <div className="landing outfit-select screen-enter">
      <div className="landing__bg" aria-hidden>
        <div className="landing__bg-city" />
        <div className="landing__overlay" />
      </div>
      <main className="outfit-select__content">
        <div className="landing__card" style={{ maxWidth: 460 }}>
          <div className="card__top-ornament" aria-hidden><div className="card__top-ornament-line" /></div>
          <h1 className="card__title">Enter RugTown</h1>
          <p className="card__subtitle">Choose the name other citizens will see.</p>
          <label className="reward-centre__meta" htmlFor="player-name">Display name</label>
          <input
            id="player-name"
            className="dm-panel__input"
            value={name}
            maxLength={20}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') enter();
            }}
            placeholder="Your name"
          />
          <div className="dm-panel__composer">
            <button type="button" className="btn btn--primary" disabled={!canEnter} onClick={enter}>
              Enter RugTown
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
