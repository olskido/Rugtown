import React, { useCallback, useState } from 'react';
import './styles/global.css';
import './styles/landing.css';
import './styles/game.css';
import { LandingPage } from './components/LandingPage';
import { GamePage } from './components/GamePage';

/*
  App.tsx
  ───────
  Starts on LandingPage. Once a guest name is submitted, swaps over to
  GamePage and hands it the chosen name for the HUD. No backend, no
  wallet — the name only lives in memory for this session.
*/
export default function App() {
  const [screen, setScreen] = useState<'landing' | 'game'>('landing');
  const [playerName, setPlayerName] = useState('');

  const handleEnter = useCallback((name: string) => {
    setPlayerName(name);
    setScreen('game');
  }, []);

  if (screen === 'game') {
    return <GamePage playerName={playerName} />;
  }

  return <LandingPage onEnter={handleEnter} />;
}
