import React, { useCallback, useState } from 'react';
import './styles/global.css';
import './styles/landing.css';
import './styles/game.css';
import { LandingPage } from './components/LandingPage';
import { OutfitSelectPage } from './components/OutfitSelectPage';
import { GamePage } from './components/GamePage';
import { DEFAULT_CHARACTER_STYLE_ID } from './game/world/CharacterStyles';

/*
  App.tsx
  ───────
  Starts on LandingPage. Once a guest name is submitted, moves to the
  outfit-select screen; once an outfit is chosen, swaps over to GamePage
  and hands it both the name and outfit for the HUD/world. No backend,
  no wallet — both only live in memory for this session.
*/
export default function App() {
  const [screen, setScreen] = useState<'landing' | 'outfit' | 'game'>('landing');
  const [playerName, setPlayerName] = useState('');
  const [outfitId, setOutfitId] = useState(DEFAULT_CHARACTER_STYLE_ID);

  const handleEnter = useCallback((name: string) => {
    setPlayerName(name);
    setScreen('outfit');
  }, []);

  const handleOutfitSelect = useCallback((id: string) => {
    setOutfitId(id);
    setScreen('game');
  }, []);

  if (screen === 'game') {
    return <GamePage playerName={playerName} outfitId={outfitId} />;
  }

  if (screen === 'outfit') {
    return <OutfitSelectPage playerName={playerName} onSelect={handleOutfitSelect} />;
  }

  return <LandingPage onEnter={handleEnter} />;
}
