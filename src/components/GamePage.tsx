import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RugTownGame } from '../game/RugTownGame';
import { WorldScene } from '../game/scenes/WorldScene';

/*
  GamePage.tsx
  ────────────
  Mounts the Phaser canvas fullscreen with a React HUD overlay on top.

  Layout from Image 2 (gameplay-master):
  ┌──────────────────────────────────────────────────────────────────┐
  │ TOP-LEFT: logo + player card                                     │
  │ TOP-RIGHT: [not needed for world view]                           │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  LEFT SIDEBAR (narrow)    │  PHASER CANVAS  │  RIGHT SIDEBAR    │
  │  Player card              │  fills center   │  Minimap          │
  │  Quick stats              │                 │  Camera info      │
  │                           │                 │                   │
  ├──────────────────────────────────────────────────────────────────┤
  │ BOTTOM ACTION BAR — gold-bordered icon row (Image 2 bottom)      │
  └──────────────────────────────────────────────────────────────────┘

  UI style from Image 3 (ui-bible):
  - Dark near-black panels (#0a0c0e to #0d1117)
  - Thick gold borders with filigree/ornament corners
  - Gold header bars at top of each panel
  - Cinzel serif font for all headings
  - Gold shimmer on hover states
*/

/* ─── Types ─── */
interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/* ─── Action bar items matching Image 2 bottom bar ─── */
const ACTION_BAR_ITEMS = [
  { icon: '💬', label: 'Chat',        key: 'C' },
  { icon: '😄', label: 'Emotes',      key: 'E' },
  { icon: '🎒', label: 'Inventory',   key: 'I' },
  { icon: '📋', label: 'Quests',      key: 'Q' },
  { icon: '🏆', label: 'Leaderboard', key: 'L' },
  { icon: '💎', label: 'Holder',      key: 'H' },
  { icon: '🗺️',  label: 'Map',         key: 'M' },
  { icon: '⚙️',  label: 'Settings',    key: '' },
];

/* ─── Minimap zone dots — placeholder positions matching Image 2 minimap ─── */
const MINIMAP_ZONES = [
  { id: 'spawn',    label: 'SP', x: 35,  y: 38,  color: '#1ecbcb' },
  { id: 'market',  label: 'MM', x: 62,  y: 28,  color: '#e8b84b' },
  { id: 'alpha',   label: 'AL', x: 75,  y: 48,  color: '#1ecbcb' },
  { id: 'alley',   label: 'RA', x: 28,  y: 62,  color: '#cc2222' },
  { id: 'whale',   label: 'WT', x: 55,  y: 70,  color: '#1e88cc' },
  { id: 'park',    label: 'LP', x: 78,  y: 68,  color: '#22aa55' },
  { id: 'fame',    label: 'HF', x: 22,  y: 80,  color: '#e8b84b' },
  { id: 'vault',   label: 'VT', x: 50,  y: 85,  color: '#c8962a' },
];

/* ─── Component ─── */
export function GamePage() {
  const mountRef   = useRef<HTMLDivElement>(null);
  const gameRef    = useRef<RugTownGame | null>(null);
  const sceneRef   = useRef<WorldScene | null>(null);

  const [ready,  setReady]  = useState(false);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 0.85 });
  const [worldSize, setWorldSize] = useState({ w: 3840, h: 2160 });
  const [bgMissing, setBgMissing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  /* ── Boot Phaser ── */
  useEffect(() => {
    if (!mountRef.current || gameRef.current) return;

    const game = new RugTownGame({
      parentId: 'phaser-mount',
      onReady: (scene: WorldScene) => {
        sceneRef.current = scene;
        setReady(true);
        setWorldSize(scene.getWorldSize());

        // Read bgMissing flag from registry
        const missing = scene.game?.registry?.get('bgMissing') ?? false;
        setBgMissing(missing);
      },
    });

    gameRef.current = game;

    /* Poll camera state from Phaser registry */
    const poll = setInterval(() => {
      if (!sceneRef.current) return;
      const reg = sceneRef.current.game?.registry;
      if (!reg) return;
      setCamera({
        x:    reg.get('camX') ?? 0,
        y:    reg.get('camY') ?? 0,
        zoom: reg.get('zoom') ?? 0.85,
      });
    }, 100);

    return () => {
      clearInterval(poll);
      game.destroy();
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  /* ── HUD keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept Phaser's camera keys
      const hud = ACTION_BAR_ITEMS.find(a => a.key === e.key.toUpperCase());
      if (hud) setActiveAction(prev => prev === hud.label ? null : hud.label);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Zoom buttons from HUD ── */
  const zoomIn  = useCallback(() => sceneRef.current?.setTargetZoom(camera.zoom + 0.15), [camera.zoom]);
  const zoomOut = useCallback(() => sceneRef.current?.setTargetZoom(camera.zoom - 0.15), [camera.zoom]);
  const resetView = useCallback(() => {
    // Return player to fountain spawn area (38% x, 58% y) and reset zoom
    sceneRef.current?.panTo(worldSize.w * 0.38, worldSize.h * 0.58, 600);
    sceneRef.current?.setTargetZoom(1.0);
  }, [worldSize]);

  /* ── Minimap click → camera pan ── */
  const minimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sceneRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top)  / rect.height;
    sceneRef.current.panTo(px * worldSize.w, py * worldSize.h, 500);
  }, [worldSize]);

  /* ── Minimap player dot position ── */
  const playerMapX = sceneRef.current ? (sceneRef.current.getPlayerPos().x / worldSize.w) * 100 : 50;
  const playerMapY = sceneRef.current ? (sceneRef.current.getPlayerPos().y / worldSize.h) * 100 : 50;

  /* ── Camera center position for display ── */
  const camCenterX = Math.round(camera.x + (window.innerWidth / 2) / camera.zoom);
  const camCenterY = Math.round(camera.y + (window.innerHeight / 2) / camera.zoom);
  const zoomPct    = Math.round(camera.zoom * 100);

  return (
    <div className="game-page">

      {/* ══════════════════════════════════════════════════════════
          PHASER CANVAS MOUNT
          Full screen behind all HUD elements
          ══════════════════════════════════════════════════════════ */}
      <div
        id="phaser-mount"
        ref={mountRef}
        className="game-canvas"
        aria-label="RugTown world view"
      />

      {/* Loading state — before Phaser is ready */}
      {!ready && (
        <div className="game-loading">
          <div className="game-loading__inner">
            <div className="game-loading__logo">RUGTOWN</div>
            <div className="game-loading__sub">Loading world...</div>
            <div className="game-loading__bar">
              <div className="game-loading__fill" />
            </div>
          </div>
        </div>
      )}

      {/* Asset missing notice */}
      {ready && bgMissing && (
        <div className="asset-notice">
          <span className="asset-notice__icon">ℹ</span>
          <span>
            City art not found — place <code>rugtown-city.png</code> in{' '}
            <code>public/assets/backgrounds/</code> and refresh.
            Camera, zoom, and HUD are fully functional.
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HUD OVERLAY
          All panels are positioned absolute over the canvas.
          Match Image 2 layout + Image 3 ornate gold style.
          ══════════════════════════════════════════════════════════ */}
      {ready && (
        <div className="hud" role="complementary" aria-label="Game HUD">

          {/* ──────────────────────────────────────────────────────
              TOP-LEFT: RugTown Logo + Player Card
              Image 2: avatar top-left, name + stats below
              Image 3: ornate gold-bordered panel
              ────────────────────────────────────────────────────── */}
          <div className="hud-panel hud-panel--tl">
            {/* Panel corner ornaments — Image 3 style */}
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

            {/* Panel header bar — gold strip from Image 3 */}
            <div className="panel-header">
              <span className="panel-header__logo">RUGTOWN</span>
              <span className="panel-header__sub">THE DEGEN CITY</span>
            </div>

            {/* Player card */}
            <div className="player-card">
              <div className="player-avatar">
                {/* Placeholder avatar circle */}
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <circle cx="20" cy="20" r="19" stroke="#c8902a" strokeWidth="2" fill="#0d1117"/>
                  <circle cx="20" cy="16" r="7" fill="#c8902a" opacity="0.6"/>
                  <path d="M6 36c0-8 6-13 14-13s14 5 14 13" fill="#c8902a" opacity="0.4"/>
                </svg>
              </div>
              <div className="player-info">
                <div className="player-name">DegenExplorer</div>
                <div className="player-title">Wandering Degen</div>
                <div className="player-rep">
                  <span className="rep-label">REP</span>
                  <span className="rep-value">—</span>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="quick-stats">
              <div className="qstat">
                <span className="qstat__dot qstat__dot--live" />
                <span className="qstat__label">Real Players</span>
                <span className="qstat__value">—</span>
              </div>
              <div className="qstat">
                <span className="qstat__dot" />
                <span className="qstat__label">NPC Citizens</span>
                <span className="qstat__value">10</span>
              </div>
            </div>

            {/* Mode badge */}
            <div className="mode-badge">
              <span className="mode-badge__dot" />
              WORLD VIEW · NO BACKEND
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────
              TOP-CENTER: Camera coordinates + controls
              ────────────────────────────────────────────────────── */}
          <div className="hud-coords">
            <button
              className="coord-btn"
              onClick={zoomOut}
              aria-label="Zoom out"
              title="Zoom out (− key)"
            >−</button>
            <span className="coord-text">
              {zoomPct}% · {camCenterX},{camCenterY}
            </span>
            <button
              className="coord-btn"
              onClick={zoomIn}
              aria-label="Zoom in"
              title="Zoom in (+ key)"
            >+</button>
            <button
              className="coord-btn coord-btn--reset"
              onClick={resetView}
              aria-label="Reset view"
              title="Reset view"
            >⌂</button>
          </div>

          {/* ──────────────────────────────────────────────────────
              RIGHT SIDEBAR: Minimap + Zone list
              Image 2: small map upper-right with zone dots
              Image 3: ornate gold bordered panel
              ────────────────────────────────────────────────────── */}
          <div className="hud-panel hud-panel--tr">
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

            <div className="panel-header">
              <span className="panel-header__logo">RUGTOWN MAP</span>
            </div>

            {/* Clickable minimap */}
            <div
              className="minimap"
              onClick={minimapClick}
              title="Click to pan camera"
              role="button"
              aria-label="Minimap — click to navigate"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && minimapClick(e as unknown as React.MouseEvent<HTMLDivElement>)}
            >
              {/* Zone dots */}
              {MINIMAP_ZONES.map(z => (
                <div
                  key={z.id}
                  className="minimap-zone"
                  style={{ left: `${z.x}%`, top: `${z.y}%`, background: z.color }}
                  title={z.label}
                >
                  <span className="minimap-zone__label">{z.label}</span>
                </div>
              ))}

              {/* Player dot */}
              <div
                className="minimap-player"
                style={{ left: `${playerMapX}%`, top: `${playerMapY}%` }}
                aria-label="Your position"
              />

              {/* Camera viewport rectangle */}
              <div
                className="minimap-viewport"
                style={{
                  left:   `${(camera.x / worldSize.w) * 100}%`,
                  top:    `${(camera.y / worldSize.h) * 100}%`,
                  width:  `${((window.innerWidth / camera.zoom) / worldSize.w) * 100}%`,
                  height: `${((window.innerHeight / camera.zoom) / worldSize.h) * 100}%`,
                }}
              />
            </div>

            {/* Zone legend */}
            <div className="zone-legend">
              {MINIMAP_ZONES.slice(0, 6).map(z => (
                <div key={z.id} className="zone-legend-item"
                  onClick={() => {
                    const wx = (z.x / 100) * worldSize.w;
                    const wy = (z.y / 100) * worldSize.h;
                    sceneRef.current?.panTo(wx, wy, 600);
                  }}
                >
                  <span className="zone-dot" style={{ background: z.color }} />
                  <span className="zone-name">{z.label}</span>
                </div>
              ))}
            </div>

            {/* Camera info */}
            <div className="cam-info">
              <span>Zoom: {zoomPct}%</span>
              <span>WASD to move player</span>
              <span>Scroll to zoom</span>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────
              BOTTOM ACTION BAR
              Image 2: horizontal row of icon buttons at screen bottom
              Image 3: gold-bordered dark bar, circular icon buttons
              ────────────────────────────────────────────────────── */}
          <div className="action-bar" role="toolbar" aria-label="Game actions">
            {/* Left ornament */}
            <div className="action-bar__ornament action-bar__ornament--left" aria-hidden>
              <svg viewBox="0 0 24 48" fill="none">
                <path d="M22 4 L4 24 L22 44" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="22" cy="4"  r="3" fill="currentColor"/>
                <circle cx="22" cy="44" r="3" fill="currentColor"/>
              </svg>
            </div>

            {/* Action buttons */}
            {ACTION_BAR_ITEMS.map((item) => (
              <button
                key={item.label}
                className={`action-btn ${activeAction === item.label ? 'action-btn--active' : ''}`}
                onClick={() => setActiveAction(prev => prev === item.label ? null : item.label)}
                aria-label={item.label}
                aria-pressed={activeAction === item.label}
                title={`${item.label}${item.key ? ` (${item.key})` : ''}`}
              >
                {/* Shimmer on hover */}
                <span className="action-btn__shimmer" aria-hidden />
                {/* Corner ornaments for active state */}
                {activeAction === item.label && <>
                  <span className="action-btn__corner action-btn__corner--tl" aria-hidden>◆</span>
                  <span className="action-btn__corner action-btn__corner--tr" aria-hidden>◆</span>
                </>}
                <span className="action-btn__icon" aria-hidden>{item.icon}</span>
                <span className="action-btn__label">{item.label}</span>
                {item.key && (
                  <span className="action-btn__key" aria-hidden>{item.key}</span>
                )}
              </button>
            ))}

            {/* Right ornament */}
            <div className="action-bar__ornament action-bar__ornament--right" aria-hidden>
              <svg viewBox="0 0 24 48" fill="none">
                <path d="M2 4 L20 24 L2 44" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="2" cy="4"  r="3" fill="currentColor"/>
                <circle cx="2" cy="44" r="3" fill="currentColor"/>
              </svg>
            </div>
          </div>

          {/* Controls hint — fades after a few seconds */}
          <div className="controls-hint" role="note">
            <span>WASD / ↑↓←→  move</span>
            <span className="hint-sep">·</span>
            <span>+ / −  zoom</span>
            <span className="hint-sep">·</span>
            <span>Scroll wheel  zoom</span>
            <span className="hint-sep">·</span>
            <span>⌂  return to fountain</span>
            <span className="hint-sep">·</span>
            <span>Click map  teleport</span>
          </div>

        </div>
      )}
    </div>
  );
}
