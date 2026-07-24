import { getWorldObject } from './WorldObjects';

export type InteriorType =
  | 'coffee_shop'
  | 'alpha_lounge'
  | 'meme_market'
  | 'hall_of_fame'
  | 'cashback_vault'
  | 'future_arena';

export type BuildingAccess = 'open' | 'locked' | 'coming_soon';

export interface EnterableBuilding {
  id: string;
  displayName: string;
  worldObjectId: string;
  interiorType: InteriorType;
  isLocked: boolean;
  lockedMessage: string;
  spawnPosition: { x: number; y: number };
  access: BuildingAccess;
  doorFx: number;
  doorFy: number;
  doorRadius: number;
  roomLabel: string;
  featureLabel: string;
}

export const ENTERABLE_BUILDINGS: EnterableBuilding[] = [
  {
    id: 'coffee-shop',
    displayName: 'Coffee Shop',
    worldObjectId: 'coffee',
    interiorType: 'coffee_shop',
    isLocked: false,
    lockedMessage: '',
    spawnPosition: { x: 640, y: 560 },
    access: 'open',
    doorFx: 0.4144,
    doorFy: 0.62,
    doorRadius: 50,
    roomLabel: 'Rug Roast Coffee',
    featureLabel: 'Barista Counter',
  },
  {
    id: 'alpha-lounge',
    displayName: 'Alpha Lounge',
    worldObjectId: 'alpha',
    interiorType: 'alpha_lounge',
    isLocked: false,
    lockedMessage: '',
    spawnPosition: { x: 640, y: 560 },
    access: 'open',
    doorFx: 0.3131,
    doorFy: 0.58,
    doorRadius: 50,
    roomLabel: 'Alpha Lounge',
    featureLabel: 'Signal Terminal',
  },
  {
    id: 'meme-market',
    displayName: 'Meme Market',
    worldObjectId: 'market',
    interiorType: 'meme_market',
    isLocked: false,
    lockedMessage: '',
    spawnPosition: { x: 640, y: 560 },
    access: 'open',
    doorFx: 0.5433,
    doorFy: 0.37,
    doorRadius: 55,
    roomLabel: 'Meme Market',
    featureLabel: 'Ticker Board',
  },
  {
    id: 'hall-of-fame',
    displayName: 'Hall of Fame',
    worldObjectId: 'fame',
    interiorType: 'hall_of_fame',
    isLocked: false,
    lockedMessage: '',
    spawnPosition: { x: 640, y: 560 },
    access: 'open',
    doorFx: 0.1105,
    doorFy: 0.42,
    doorRadius: 55,
    roomLabel: 'Hall of Fame',
    featureLabel: 'Legacy Plaque',
  },
  {
    id: 'holder-cashback-vault',
    displayName: 'Holder Cashback Vault',
    worldObjectId: 'cashback',
    interiorType: 'cashback_vault',
    isLocked: true,
    lockedMessage: 'Holder Cashback Vault is locked until $RUGTOWN holder perks go live.',
    spawnPosition: { x: 640, y: 560 },
    access: 'locked',
    doorFx: 0.7274,
    doorFy: 0.76,
    doorRadius: 60,
    roomLabel: 'Holder Cashback Vault',
    featureLabel: 'Vault Door',
  },
  {
    id: 'future-arena',
    displayName: 'Future Arena',
    worldObjectId: 'arena',
    interiorType: 'future_arena',
    isLocked: true,
    lockedMessage: 'Future Arena is coming soon.',
    spawnPosition: { x: 640, y: 560 },
    access: 'coming_soon',
    doorFx: 0.9576,
    doorFy: 0.43,
    doorRadius: 65,
    roomLabel: 'Future Arena',
    featureLabel: 'Arena Gate',
  },
];

export interface ResolvedDoorZone {
  building: EnterableBuilding;
  wx: number;
  wy: number;
  radius: number;
}

export function getEnterableBuilding(id: string): EnterableBuilding | undefined {
  return ENTERABLE_BUILDINGS.find(b => b.id === id);
}

export function getEnterableBuildingByWorldObjectId(worldObjectId: string): EnterableBuilding | undefined {
  return ENTERABLE_BUILDINGS.find(b => b.worldObjectId === worldObjectId);
}

export function buildEnterableDoorZones(worldW: number, worldH: number): ResolvedDoorZone[] {
  return ENTERABLE_BUILDINGS.map(building => ({
    building,
    wx: building.doorFx * worldW,
    wy: building.doorFy * worldH,
    radius: building.doorRadius,
  }));
}

export function getWorldReturnPosition(buildingId: string, worldW: number, worldH: number): { x: number; y: number } | null {
  const building = getEnterableBuilding(buildingId);
  if (!building) return null;
  const obj = getWorldObject(building.worldObjectId);
  if (!obj) return null;
  return {
    x: obj.x * worldW,
    y: (obj.y * worldH) + 48,
  };
}
