/**
 * MinimapTypes.ts — Phase 10C live map snapshot shapes.
 */

import type { Direction } from '../characters/animation/CharacterDirection';
export type { Direction };

export interface MinimapViewportWorld {
  scrollX: number;
  scrollY: number;
  viewW: number;
  viewH: number;
}

export interface MinimapPlayerMarker {
  x: number;
  y: number;
  facing: Direction;
}

export interface MinimapNpcMarker {
  x: number;
  y: number;
  roaming: boolean;
}

export interface MinimapRemoteMarker {
  id: string;
  x: number;
  y: number;
  username: string;
  /** Optional presence fields for social-card inspect from the map. */
  rep?: number;
  holderTier?: string;
}

export interface MinimapEventMarker {
  kind: 'treasure' | 'whale' | 'town_crier' | 'event';
  x: number;
  y: number;
  label?: string;
}

export interface MinimapLiveSnapshot {
  player: MinimapPlayerMarker;
  npcs: MinimapNpcMarker[];
  camera: MinimapViewportWorld;
  events: MinimapEventMarker[];
}

export interface MinimapWaypoint {
  x: number;
  y: number;
}

export interface MinimapFilters {
  realPlayers: boolean;
  npcs: boolean;
  landmarks: boolean;
  missions: boolean;
  events: boolean;
  districtNames: boolean;
}

export const DEFAULT_MINIMAP_FILTERS: MinimapFilters = {
  realPlayers: true,
  npcs: true,
  landmarks: true,
  missions: true,
  events: true,
  districtNames: false,
};

export interface MinimapUiDebug {
  mapWidth: number;
  mapHeight: number;
  scaleX: number;
  scaleY: number;
  playerMapX: number;
  playerMapY: number;
  remoteCount: number;
  npcCount: number;
  landmarkCount: number;
  viewportMapX: number;
  viewportMapY: number;
  viewportMapW: number;
  viewportMapH: number;
  selectedLandmarkId: string | null;
  waypoint: MinimapWaypoint | null;
  filters: MinimapFilters;
}

export const EMPTY_MINIMAP_LIVE: MinimapLiveSnapshot = {
  player: { x: 0, y: 0, facing: 'down' },
  npcs: [],
  camera: { scrollX: 0, scrollY: 0, viewW: 800, viewH: 600 },
  events: [],
};
