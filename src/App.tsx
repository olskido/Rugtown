import React, { useCallback, useState } from 'react';
import './styles/global.css';
import './styles/landing.css';
import './styles/game.css';
import { LandingPage } from './components/LandingPage';
import { OutfitSelectPage } from './components/OutfitSelectPage';
import { GamePage } from './components/GamePage';
import { DEFAULT_APPEARANCE, type CharacterAppearance } from './game/world/CharacterAppearance';

/*
  App.tsx
  ───────
  Starts on LandingPage. Once a guest name is submitted, moves to the
  character-creator screen; once an appearance is chosen, swaps over to
  GamePage and hands it both the name and appearance for the HUD/world.
  No backend, no wallet — both only live in memory for this session.
*/
export default function App() {
  const [screen, setScreen] = useState<'landing' | 'outfit' | 'game'>('landing');
  const [playerName, setPlayerName] = useState('');
  const [appearance, setAppearance] = useState<CharacterAppearance>(DEFAULT_APPEARANCE);

  const handleEnter = useCallback((name: string) => {
    setPlayerName(name);
    setScreen('outfit');
  }, []);

  const handleAppearanceSelect = useCallback((picked: CharacterAppearance) => {
    setAppearance(picked);
    setScreen('game');
  }, []);

  if (screen === 'game') {
    return <GamePage playerName={playerName} appearance={appearance} />;
  }

  if (screen === 'outfit') {
    return <OutfitSelectPage playerName={playerName} onSelect={handleAppearanceSelect} />;
  }

  return <LandingPage onEnter={handleEnter} />;
}
