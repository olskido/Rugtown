import React from 'react';
import './styles/global.css';
import './styles/game.css';
import { GamePage } from './components/GamePage';

/*
  App.tsx
  ───────
  App opens directly into GamePage.
  No landing page for this build — game world view only.
*/
export default function App() {
  return <GamePage />;
}
