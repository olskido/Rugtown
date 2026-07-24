/**
 * social.ts — Phase 10E/10F social player types + DM recipient foundation.
 */

import type { CharacterAppearanceV1 } from '../game/characters/appearance/CharacterAppearanceDefaults';
import { decodeCharacterAppearance } from '../game/characters/appearance/CharacterAppearanceCodec';
import { assetExists } from '../game/characters/assets/CharacterAssetRegistry';
import type { PresencePayload } from './presence';

/** Canonical social summary for UI (profile card, DM recipient, prompts). */
export interface SocialPlayerSummary {
  playerId: string;
  username: string;
  isGuest: boolean;
  rep: number;
  /** Holder tier string: None | Bronze | Silver | Gold (not progression rank). */
  holderTier: string;
  /** @deprecated Use holderTier — kept for older call sites. */
  title: string;
  level?: number;
  rankLabel?: string;
  equippedTitle?: string;
  achievementSummary?: string;
  appearance?: CharacterAppearanceV1;
  worldX: number;
  worldY: number;
  direction?: string;
  online: boolean;
  lastSeenAt: number;
}

export interface DirectMessageRecipient {
  playerId: string;
  username: string;
  isGuest: boolean;
}

export const PRESENCE_STALE_MS = 2500;
export const PLAYER_INTERACT_RADIUS = 78;
export const PLAYER_FACING_CONE = 0.28;

export function isGuestPresenceId(id: string): boolean {
  return id.startsWith('guest_');
}

export function presenceToSocialSummary(
  p: PresencePayload,
  opts?: {
    worldX?: number;
    worldY?: number;
    direction?: string;
    lastSeenAt?: number;
    online?: boolean;
    level?: number;
    rankLabel?: string;
    equippedTitle?: string;
    achievementSummary?: string;
  },
): SocialPlayerSummary {
  const holderTier = p.holderTier || 'None';
  return {
    playerId: p.id,
    username: p.username,
    isGuest: isGuestPresenceId(p.id),
    rep: p.rep,
    holderTier,
    title: holderTier,
    level: opts?.level ?? p.level,
    rankLabel: opts?.rankLabel ?? p.rankLabel,
    equippedTitle: opts?.equippedTitle ?? p.equippedTitle,
    achievementSummary: opts?.achievementSummary,
    appearance: decodeCharacterAppearance(p.appearance, assetExists),
    worldX: opts?.worldX ?? p.x,
    worldY: opts?.worldY ?? p.y,
    direction: opts?.direction,
    online: opts?.online ?? true,
    lastSeenAt: opts?.lastSeenAt ?? Date.now(),
  };
}

export function isPresenceStale(lastSeenAt: number, now = Date.now()): boolean {
  return now - lastSeenAt > PRESENCE_STALE_MS;
}

export function toDmRecipient(s: SocialPlayerSummary): DirectMessageRecipient {
  return {
    playerId: s.playerId,
    username: s.username,
    isGuest: s.isGuest,
  };
}
