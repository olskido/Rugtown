/*
  EventTypes.ts
  ─────────────
  Type definitions for the RugTown Event Engine (Phase 2). Pure data
  contracts, no Phaser/React import — same framework-agnostic pattern
  as WorldObjects.ts/CollisionZones.ts/CharacterStyles.ts, so both the
  Phaser world (WorldScene) and the React HUD can depend on it without
  depending on each other.

  This file describes the SHAPE every future event must fit into. It
  intentionally does not contain any of the 10 sample events — those
  live in EventDefinitions.ts — and it does not contain the engine
  that drives them — that's EventManager.ts.
*/

/* ─── Lifecycle ───
   Idle → Countdown → Announcement → Live → Completed → Cooldown → (loops
   back into Countdown for the next event, via EventManager.scheduleNext()).
   Idle is the only phase with no active EventInstance. */
export type EventPhase =
  | 'idle'
  | 'countdown'
  | 'announcement'
  | 'live'
  | 'completed'
  | 'cooldown';

export type EventRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/* ─── Reward ───
   Local/mock only — no Solana, no real token amounts. `type` describes
   what kind of reward a future system should grant; `amount` is generic
   (REP points, a multiplier, etc. depending on `type`); `label` is the
   human-readable line shown in UI regardless of how `amount` is used. */
export type EventRewardType = 'rep' | 'badge' | 'cosmetic' | 'multiplier' | 'none';

export interface EventReward {
  type: EventRewardType;
  amount?: number;
  label: string;
}

/* ─── Location ───
   `landmarkId` ties an event to an existing WorldObjects.ts landmark
   (so WorldScene can resolve real world coordinates for it); `null`
   means the event isn't anchored to one specific landmark (city-wide,
   or "somewhere — go find it"). `displayName` is always present so UI
   never needs to know whether a landmark backs the event. */
export interface EventLocation {
  landmarkId: string | null;
  displayName: string;
}

/* ─── Dialogue ───
   One line per phase an event wants citizens/UI to be able to "say".
   Not every phase needs a line — Countdown and Cooldown are usually
   silent build-up/wind-down, so only announcement/live/completed are
   valid line phases today (extendable later if a future event wants
   a countdown line). */
export type EventDialoguePhase = Extract<EventPhase, 'announcement' | 'live' | 'completed'>;

export interface EventDialogueLine {
  phase: EventDialoguePhase;
  text: string;
}

/* ─── Citizen behaviour ───
   'gather' pulls a sample of RugTown Citizens toward the event's
   location for the Live phase (reversible — they return to their
   normal routine after); 'none' leaves citizen movement untouched. */
export interface EventCitizenBehaviour {
  mode: 'gather' | 'none';
  /** Only used when mode is 'gather' — how many citizens get pulled in. */
  citizenCount?: number;
}

/** Per-event override of the manager's default phase timings. Every
 *  field is optional — omitted phases fall back to EventManager's
 *  configured defaults, so a new event definition only has to specify
 *  what makes it different (e.g. a longer Countdown for suspense). */
export type EventPhaseTimingOverrides = Partial<
  Record<Exclude<EventPhase, 'idle' | 'live'>, number>
>;

/* ─── Event chains ───
   A possible follow-up event, rolled independently when the event that
   owns this option Completes (see EventManager.pickChainFollowUp()).
   `probability` is an absolute 0-1 chance for THIS option specifically
   — each option in a chainOptions array is checked in order, the first
   one whose roll succeeds wins, and if none succeed EventManager falls
   back to its normal rarity-weighted random pick. Probabilities in one
   array don't need to sum to 1; "nothing chains" is just as valid an
   outcome as any listed option. */
export interface EventChainOption {
  /** id of the EventDefinition this can lead to. */
  id: string;
  /** 0-1 absolute chance this specific follow-up fires. */
  probability: number;
}

/* ─── Event definition ───
   The data-driven description of one event "type". EventManager never
   hardcodes event-specific behavior — everything it needs to run the
   lifecycle, apply overrides, and describe the event to UI comes from
   this shape. Adding a new event to the game means adding one of these
   to EventDefinitions.ts; nothing else needs to change. */
export interface EventDefinition {
  id: string;
  title: string;
  description: string;
  rarity: EventRarity;
  /** ms — how long the event stays in the Live phase. */
  duration: number;
  reward: EventReward;
  location: EventLocation;
  dialogue: EventDialogueLine[];
  /** Weather id WorldScene should render while this event is Live, or
   *  null for "don't touch the weather". Purely additive/cosmetic —
   *  today only 'rain' is implemented, but any future weather id can be
   *  added without changing this type. */
  weatherOverride: string | null;
  /** Music/track id WorldScene's audio layer should switch to while
   *  Live, or null to leave the ambient music alone. SoundManager
   *  doesn't support named track-switching yet (synthesized loops
   *  only) — this field is intentionally future-proofed so a real
   *  per-event track system can be dropped in later without touching
   *  EventDefinitions.ts again. */
  musicOverride: string | null;
  citizenBehaviour: EventCitizenBehaviour;
  /** Optional — see EventPhaseTimingOverrides. */
  phaseTimingOverrides?: EventPhaseTimingOverrides;
  /** Optional — possible follow-up events rolled when this one Completes.
   *  Omitted/empty means this event never chains into another. */
  chainOptions?: EventChainOption[];
}

/* ─── Running instance ───
   A definition plus its live lifecycle position. EventManager hands
   these out via getCurrentEvent()/onChange() — never the bare
   EventDefinition, so consumers always know what phase it's in and
   how long that phase has left. */
export interface EventInstance {
  definition: EventDefinition;
  phase: EventPhase;
  /** Date.now() timestamp the current phase began. */
  phaseStartedAt: number;
  /** ms duration configured for the current phase. */
  phaseDuration: number;
  /** id of the event that chained into this one via its chainOptions,
   *  or null/undefined if this event was picked the normal (random)
   *  way. Lets UI show "the city reacts to X" instead of just "Y started". */
  chainedFrom?: string | null;
}

/** Notified on every phase transition, including the idle ↔ countdown
 *  edges. `instance` is null exactly when phase is 'idle'. */
export type EventManagerListener = (instance: EventInstance | null, prevPhase: EventPhase) => void;
