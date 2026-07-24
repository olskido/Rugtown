/**
 * WorldMinimapData.ts
 * ───────────────────
 * Collects fractional world geometry from the world-engine generators so
 * the React minimap can render roads, buildings, and district plates.
 * Populated once at city build time — static, zero per-frame cost.
 */

export interface MinimapRect {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  kind: 'building' | 'road' | 'district';
  tint?: string;
}

export interface WorldMinimapSnapshot {
  buildings: MinimapRect[];
  roads: MinimapRect[];
  districts: MinimapRect[];
}

const EMPTY: WorldMinimapSnapshot = { buildings: [], roads: [], districts: [] };

let snapshot: WorldMinimapSnapshot = { ...EMPTY, buildings: [], roads: [], districts: [] };

export function clearMinimapData(): void {
  snapshot = { buildings: [], roads: [], districts: [] };
}

export function addMinimapBuilding(fx: number, fy: number, fw: number, fh: number, tint?: string): void {
  snapshot.buildings.push({ fx, fy, fw, fh, kind: 'building', tint });
}

export function addMinimapRoad(fx: number, fy: number, fw: number, fh: number): void {
  snapshot.roads.push({ fx, fy, fw, fh, kind: 'road' });
}

export function addMinimapDistrict(id: string, fx: number, fy: number, fw: number, fh: number): void {
  snapshot.districts.push({ fx, fy, fw, fh, kind: 'district', tint: id });
}

export function getMinimapData(): WorldMinimapSnapshot {
  return snapshot;
}

export const EMPTY_MINIMAP: WorldMinimapSnapshot = EMPTY;
