/**
 * LandmarkCatalog.ts — Phase 10D canonical landmark metadata.
 * Built from WorldObjects + EnterableBuildings (no duplicate coordinate list).
 */

import { WORLD_OBJECTS, isInteractionLive, type InteractionType, type WorldObject } from '../world/WorldObjects';
import { ENTERABLE_BUILDINGS, type BuildingAccess } from '../world/EnterableBuildings';
import { getDistrictAtWorld, type DistrictId } from '../world/WorldDistricts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/WorldMapScale';

export type LandmarkStatus =
  | 'available'
  | 'locked'
  | 'coming_soon'
  | 'mission'
  | 'event'
  | 'inactive';

export type LandmarkAction =
  | 'enter'
  | 'inspect'
  | 'gather'
  | 'read'
  | 'open_market'
  | 'talk'
  | 'locked'
  | 'coming_soon'
  | 'none';

export type LabelVisibility = 'far' | 'visible' | 'near';

export interface LandmarkMeta {
  id: string;
  displayName: string;
  shortName: string;
  icon: string;
  districtId: DistrictId | null;
  districtName: string;
  /** Anchor world position (building / object centre). */
  worldX: number;
  worldY: number;
  /** Interaction / entrance point (door if enterable, else object). */
  entranceX: number;
  entranceY: number;
  /** Label float point (slightly above entrance). */
  labelX: number;
  labelY: number;
  labelOffsetY: number;
  interactionRadius: number;
  visibilityRadius: number;
  status: LandmarkStatus;
  access: BuildingAccess | 'inspect_only' | 'inactive';
  interactionType: InteractionType;
  action: LandmarkAction;
  actionLabel: string;
  lockedReason: string;
  live: boolean;
  interiorId: string | null;
  missionTags: string[];
}

/** Tuned for PLAYER_SPEED 176 and zoom 0.85–1.70. */
export const LANDMARK_VISIBILITY_MIN = 300;
export const LANDMARK_VISIBILITY_FACTOR = 3.4;
export const LANDMARK_LABEL_OFFSET_Y = 42;
export const MAX_FULL_LABELS = 5;

const SHORT_NAMES: Record<string, string> = {
  fountain: 'Spring Water',
  government: 'Government',
  fame: 'Hall of Fame',
  trading_academy: 'Academy',
  research_observatory: 'Observatory',
  notice: 'Notices',
  market: 'Meme Market',
  market_shop: 'Market Shop',
  alpha: 'Alpha Lounge',
  coffee: 'Coffee',
  nft_gallery: 'NFT Gallery',
  whale: 'Whale Tower',
  financial_office: 'Finance',
  cashback: 'Cashback Vault',
  holder_bank: 'Holder Bank',
  bridge: 'Main Bridge',
  arena: 'Arena',
  tournament_hall: 'Tournaments',
  nft_creator_studio: 'Creator Studio',
  park: 'Park Gate',
};

const ACTION_BY_ID: Partial<Record<string, LandmarkAction>> = {
  fountain: 'gather',
  notice: 'read',
  market: 'open_market',
  coffee: 'enter',
  alpha: 'enter',
  fame: 'enter',
  cashback: 'locked',
  arena: 'coming_soon',
  bridge: 'inspect',
};

function actionLabelFor(action: LandmarkAction, name: string): string {
  switch (action) {
    case 'enter': return `Enter ${name}`;
    case 'gather': return 'Gather';
    case 'read': return 'Read';
    case 'open_market': return 'Open Market';
    case 'talk': return `Talk`;
    case 'locked': return 'Locked';
    case 'coming_soon': return 'Coming Soon';
    case 'inspect': return `Inspect`;
    default: return 'Inspect';
  }
}

function resolveBaseStatus(obj: WorldObject, access: BuildingAccess | null): LandmarkStatus {
  if (access === 'locked' || obj.interactionType === 'locked') return 'locked';
  if (access === 'coming_soon') return 'coming_soon';
  if (!isInteractionLive(obj) && !access) return 'inactive';
  return 'available';
}

function resolveAction(
  obj: WorldObject,
  access: BuildingAccess | null,
): LandmarkAction {
  if (access === 'locked') return 'locked';
  if (access === 'coming_soon') return 'coming_soon';
  if (ACTION_BY_ID[obj.id]) return ACTION_BY_ID[obj.id]!;
  if (access === 'open') return 'enter';
  if (isInteractionLive(obj)) return 'inspect';
  return 'none';
}

/** Build the full catalog once world dimensions are known. */
export function buildLandmarkCatalog(
  worldW = WORLD_WIDTH,
  worldH = WORLD_HEIGHT,
): LandmarkMeta[] {
  return WORLD_OBJECTS.map((obj) => {
    const enterable = ENTERABLE_BUILDINGS.find((b) => b.worldObjectId === obj.id) ?? null;
    const worldX = obj.x * worldW;
    const worldY = obj.y * worldH;
    const entranceX = enterable ? enterable.doorFx * worldW : worldX;
    const entranceY = enterable ? enterable.doorFy * worldH : worldY;
    const interactionRadius = enterable
      ? Math.max(obj.interactionRadius, enterable.doorRadius)
      : obj.interactionRadius;
    const visibilityRadius = Math.max(
      LANDMARK_VISIBILITY_MIN,
      Math.round(interactionRadius * LANDMARK_VISIBILITY_FACTOR),
    );
    const district = getDistrictAtWorld(worldX, worldY);
    const access = enterable?.access ?? (isInteractionLive(obj) ? 'inspect_only' : 'inactive');
    const status = resolveBaseStatus(obj, enterable?.access ?? null);
    const action = resolveAction(obj, enterable?.access ?? null);
    const shortName = SHORT_NAMES[obj.id] ?? obj.displayName;
    const lockedReason = enterable?.lockedMessage
      || (status === 'locked' ? 'Locked until requirements are met.' : '')
      || (status === 'coming_soon' ? 'Coming soon.' : '');

    return {
      id: obj.id,
      displayName: obj.displayName,
      shortName,
      icon: obj.futureIcon,
      districtId: district?.id ?? null,
      districtName: district?.name ?? 'RugTown',
      worldX,
      worldY,
      entranceX,
      entranceY,
      labelX: entranceX,
      labelY: entranceY - LANDMARK_LABEL_OFFSET_Y,
      labelOffsetY: LANDMARK_LABEL_OFFSET_Y,
      interactionRadius,
      visibilityRadius,
      status,
      access,
      interactionType: obj.interactionType,
      action,
      actionLabel: actionLabelFor(action, shortName),
      lockedReason,
      live: isInteractionLive(obj) || !!enterable,
      interiorId: enterable?.id ?? null,
      missionTags: enterable ? [enterable.id, obj.id] : [obj.id],
    };
  });
}

export function getLandmarkMeta(
  id: string,
  catalog: LandmarkMeta[],
): LandmarkMeta | undefined {
  return catalog.find((l) => l.id === id);
}

export const OFFICIAL_LANDMARK_COUNT = 20;
