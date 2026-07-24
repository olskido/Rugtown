/**
 * useMinimapLiveData.ts — polls Phaser registry for live map markers.
 */

import { useEffect, useRef, useState } from 'react';
import type { WorldScene } from '../../game/scenes/WorldScene';
import type { PresencePayload } from '../../lib/presence';
import {
  EMPTY_MINIMAP_LIVE,
  type MinimapEventMarker,
  type MinimapFilters,
  type MinimapLiveSnapshot,
  type MinimapRemoteMarker,
  type MinimapUiDebug,
  DEFAULT_MINIMAP_FILTERS,
} from '../../game/minimap/MinimapTypes';
import { MINIMAP_LANDMARK_COUNT } from '../../game/minimap/MinimapLandmarks';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../game/world/WorldMapScale';

const FILTER_STORAGE_KEY = 'rugtown:mapFilters';

export function loadMapFilters(): MinimapFilters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MINIMAP_FILTERS };
    const parsed = JSON.parse(raw) as Partial<MinimapFilters>;
    return { ...DEFAULT_MINIMAP_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_MINIMAP_FILTERS };
  }
}

export function saveMapFilters(filters: MinimapFilters): void {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch { /* ignore */ }
}

export interface MinimapLiveBundle {
  live: MinimapLiveSnapshot;
  remotes: MinimapRemoteMarker[];
  missionLandmarkId: string | null;
  worldW: number;
  worldH: number;
}

export function useMinimapLiveData(
  sceneRef: React.RefObject<WorldScene | null>,
  onlinePlayers: PresencePayload[],
  localPresenceId: string,
  highlightZoneId: string | null,
): MinimapLiveBundle {
  const [bundle, setBundle] = useState<MinimapLiveBundle>({
    live: EMPTY_MINIMAP_LIVE,
    remotes: [],
    missionLandmarkId: highlightZoneId,
    worldW: WORLD_WIDTH,
    worldH: WORLD_HEIGHT,
  });

  const lastRef = useRef('');

  useEffect(() => {
  const interval = setInterval(() => {
    const scene = sceneRef.current;
    const reg = scene?.game?.registry;
    if (!reg) return;

    const live = (reg.get('minimapLive') as MinimapLiveSnapshot | undefined) ?? EMPTY_MINIMAP_LIVE;
    const worldW = reg.get('worldW') ?? WORLD_WIDTH;
    const worldH = reg.get('worldH') ?? WORLD_HEIGHT;
    const missionId = (reg.get('missionState') as { highlightZoneId?: string | null } | undefined)?.highlightZoneId
      ?? highlightZoneId;

    const remotes: MinimapRemoteMarker[] = onlinePlayers
      .filter((p) => p.id !== localPresenceId)
      .map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        username: p.username,
        rep: p.rep,
        holderTier: p.holderTier,
      }));

    const sig = JSON.stringify({
      px: Math.round(live.player.x),
      py: Math.round(live.player.y),
      f: live.player.facing,
      n: live.npcs.length,
      r: remotes.length,
      e: live.events.length,
      cx: Math.round(live.camera.scrollX),
      cy: Math.round(live.camera.scrollY),
      vw: Math.round(live.camera.viewW),
      missionId,
    });

    if (sig !== lastRef.current) {
      lastRef.current = sig;
      setBundle({ live, remotes, missionLandmarkId: missionId, worldW, worldH });
    }
  }, 50);

  return () => clearInterval(interval);
  }, [sceneRef, onlinePlayers, localPresenceId, highlightZoneId]);

  return bundle;
}

export function publishMinimapUiDebug(
  sceneRef: React.RefObject<WorldScene | null>,
  debug: MinimapUiDebug | null,
): void {
  sceneRef.current?.game?.registry.set('minimapUiDebug', debug);
}
