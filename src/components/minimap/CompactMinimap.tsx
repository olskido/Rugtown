/**
 * CompactMinimap.tsx — Phase 10C HUD minimap (wide 3:1 aspect).
 */

import { useCallback } from 'react';
import { DEFAULT_LANDMARKS, WorldMapCanvas } from './WorldMapCanvas';
import type { MinimapFilters, MinimapLiveSnapshot, MinimapRemoteMarker } from '../../game/minimap/MinimapTypes';

export interface CompactMinimapProps {
  live: MinimapLiveSnapshot;
  remotes: MinimapRemoteMarker[];
  missionLandmarkId: string | null;
  filters: MinimapFilters;
  onOpenExpanded: () => void;
}

export function CompactMinimap({
  live,
  remotes,
  missionLandmarkId,
  filters,
  onOpenExpanded,
}: CompactMinimapProps) {
  const handleClick = useCallback(() => {
    onOpenExpanded();
  }, [onOpenExpanded]);

  return (
    <div
      className="minimap minimap--wide"
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && onOpenExpanded()}
      role="button"
      tabIndex={0}
      title="Open world map"
      aria-label="Compact world map — click to expand"
      data-ui-block-camera
    >
      <WorldMapCanvas
        className="minimap__canvas"
        mode="compact"
        live={live}
        remotes={remotes}
        landmarks={DEFAULT_LANDMARKS}
        missionLandmarkId={missionLandmarkId}
        filters={filters}
        selectedLandmarkId={null}
        waypoint={null}
        interactive={false}
        ariaLabel="RugTown compact map"
      />
    </div>
  );
}
