/**
 * InteractionTargetResolver.ts — Phase 10D/10E deterministic target selection
 * with player candidates and sticky hysteresis.
 */

import type { Direction } from '../characters/animation/CharacterDirection';
import type { LandmarkAction, LandmarkStatus } from './LandmarkCatalog';

export type InteractTargetKind =
  | 'door'
  | 'zone'
  | 'npc'
  | 'treasure'
  | 'whale'
  | 'statue'
  | 'town_crier'
  | 'player';

export interface InteractCandidate {
  kind: InteractTargetKind;
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  /** Lower = higher priority band. */
  priorityBand: number;
  missionBoost?: boolean;
  status?: LandmarkStatus;
  action?: LandmarkAction;
  actionLabel?: string;
  access?: 'open' | 'locked' | 'coming_soon';
  lockedReason?: string;
  mobileLabel?: string;
}

export interface InteractTargetResult {
  target: InteractCandidate | null;
  distance: number;
  facingScore: number;
  priorityScore: number;
  hysteresisHeld: boolean;
}

export interface PlayerPose {
  x: number;
  y: number;
  facing: Direction;
}

export interface ResolveOptions {
  /** Sticky previous target id (hysteresis). */
  previousId?: string | null;
  /** Score must beat sticky by this margin to switch. */
  switchMargin?: number;
  /** Keep sticky target until this many ms after last selection (caller tracks). */
  holdMs?: number;
  heldSince?: number;
  now?: number;
}

const FACING_VEC: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Priority bands (Phase 10E):
 * Mission door → door → faced player → mission zone → zone → …
 * Unfaced players sit after NPCs so buildings aren't always beaten.
 */
export const PRIORITY = {
  MISSION_DOOR: 0,
  DOOR: 1,
  PLAYER_FACING: 2,
  MISSION_ZONE: 3,
  ZONE: 4,
  NPC: 5,
  PLAYER: 6,
  TREASURE: 7,
  WHALE: 8,
  TOWN_CRIER: 9,
  STATUE: 10,
} as const;

export const DEFAULT_SWITCH_MARGIN = 28;
export const DEFAULT_HOLD_MS = 220;

function scoreCandidate(
  player: PlayerPose,
  c: InteractCandidate,
): { ok: boolean; dist: number; facingScore: number; priorityScore: number } {
  const dx = c.x - player.x;
  const dy = c.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > c.radius) {
    return { ok: false, dist, facingScore: 0, priorityScore: Infinity };
  }
  const face = FACING_VEC[player.facing];
  const len = dist || 1;
  const facingScore = (dx / len) * face.x + (dy / len) * face.y;
  const facingBonus = facingScore > 0.25 ? facingScore * (c.kind === 'player' ? 32 : 18) : 0;
  const missionBonus = c.missionBoost ? 40 : 0;
  const priorityScore = c.priorityBand * 1000 + dist - facingBonus - missionBonus;
  return { ok: true, dist, facingScore, priorityScore };
}

/**
 * Pick a single active interaction target with optional hysteresis.
 */
export function resolveInteractTarget(
  player: PlayerPose,
  candidates: InteractCandidate[],
  opts?: ResolveOptions,
): InteractTargetResult {
  let best: InteractCandidate | null = null;
  let bestScore = Infinity;
  let bestDist = Infinity;
  let bestFacing = 0;

  const scored = new Map<string, ReturnType<typeof scoreCandidate>>();

  for (const c of candidates) {
    const s = scoreCandidate(player, c);
    scored.set(c.id, s);
    if (!s.ok) continue;
    if (s.priorityScore < bestScore) {
      bestScore = s.priorityScore;
      best = c;
      bestDist = s.dist;
      bestFacing = s.facingScore;
    }
  }

  let hysteresisHeld = false;
  const prevId = opts?.previousId ?? null;
  const switchMargin = opts?.switchMargin ?? DEFAULT_SWITCH_MARGIN;
  const holdMs = opts?.holdMs ?? DEFAULT_HOLD_MS;
  const now = opts?.now ?? 0;
  const heldSince = opts?.heldSince ?? 0;

  if (prevId && best?.id !== prevId) {
    const prevCand = candidates.find((c) => c.id === prevId);
    const prevScore = prevCand ? scored.get(prevId) : undefined;
    const stillValid = !!prevScore?.ok;
    const withinHold = heldSince > 0 && now - heldSince < holdMs;

    if (stillValid && prevCand && prevScore) {
      const improvement = prevScore.priorityScore - bestScore;
      if (withinHold || improvement < switchMargin) {
        best = prevCand;
        bestScore = prevScore.priorityScore;
        bestDist = prevScore.dist;
        bestFacing = prevScore.facingScore;
        hysteresisHeld = true;
      }
    }
  }

  return {
    target: best,
    distance: bestDist,
    facingScore: bestFacing,
    priorityScore: best === null ? 0 : bestScore,
    hysteresisHeld,
  };
}

/** HUD / mobile prompt copy for a resolved target. */
export function formatInteractPrompt(
  target: InteractCandidate,
  opts?: { fountainUnclaimed?: boolean },
): { desktop: string; mobile: string; keyHint: string } {
  if (target.kind === 'player') {
    return {
      desktop: `Press E to Interact — ${target.name}`,
      mobile: `View · ${target.name}`,
      keyHint: 'E',
    };
  }

  if (target.kind === 'door') {
    if (target.access === 'open') {
      return {
        desktop: `Press E to Enter — ${target.name}`,
        mobile: `Enter · ${target.name}`,
        keyHint: 'E',
      };
    }
    if (target.access === 'coming_soon') {
      return {
        desktop: `${target.name} — Coming Soon`,
        mobile: 'Coming Soon',
        keyHint: 'E',
      };
    }
    return {
      desktop: `${target.name} — Locked`,
      mobile: 'Locked',
      keyHint: 'E',
    };
  }

  if (target.kind === 'zone') {
    if (target.id === 'fountain' && opts?.fountainUnclaimed) {
      return {
        desktop: 'Press E to Gather — Spring Water',
        mobile: 'Gather',
        keyHint: 'E',
      };
    }
    const label = target.actionLabel ?? 'Inspect';
    if (target.action === 'locked' || target.action === 'coming_soon') {
      return {
        desktop: `${target.name} — ${label}`,
        mobile: label,
        keyHint: 'E',
      };
    }
    return {
      desktop: `Press E to ${label}${label.includes(target.name) ? '' : ` — ${target.name}`}`,
      mobile: target.mobileLabel ?? label.split(' ')[0] ?? 'Inspect',
      keyHint: 'E',
    };
  }

  if (target.kind === 'npc' || target.kind === 'town_crier') {
    return {
      desktop: `Press E to Talk — ${target.name}`,
      mobile: `Talk · ${target.name}`,
      keyHint: 'E',
    };
  }
  if (target.kind === 'treasure') {
    return { desktop: 'Press E to Open Treasure', mobile: 'Open', keyHint: 'E' };
  }
  if (target.kind === 'whale') {
    return { desktop: 'Press E to Inspect Whale', mobile: 'Inspect', keyHint: 'E' };
  }
  if (target.kind === 'statue') {
    return { desktop: `Press E to Inspect — ${target.name}`, mobile: 'Inspect', keyHint: 'E' };
  }

  return {
    desktop: `Press E — ${target.name}`,
    mobile: target.mobileLabel ?? 'Interact',
    keyHint: 'E',
  };
}
