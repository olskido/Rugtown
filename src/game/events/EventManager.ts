import type {
  EventDefinition,
  EventInstance,
  EventManagerListener,
  EventPhase,
  EventRarity,
} from './EventTypes';

/*
  EventManager.ts
  ───────────────
  The reusable engine every RugTown event runs through. Framework-agnostic
  (no Phaser/React import) so it can be driven from WorldScene, polled
  from React, or both — same "single source of truth, multiple consumers"
  pattern as WorldObjects.ts/CharacterStyles.ts. All scheduling here uses
  plain setTimeout chains, identical in spirit to the existing
  triggerCityEvent self-rescheduling timer in GamePage.tsx — there's no
  per-frame tick() requirement, so nothing has to wire this into Phaser's
  update loop just to keep time moving.

  Lifecycle (data-driven per EventDefinition, timed by phaseDurations):

    Idle → Countdown → Announcement → Live → Completed → Cooldown → (loops)

  Event chains (Phase 4): an EventDefinition can list chainOptions —
  other events it might lead into. When Cooldown elapses, the event
  that just finished gets first say (pickChainFollowUp()) before
  scheduleNext() falls back to its normal rarity-weighted random pick.
  Purely additive — calling scheduleNext() with no argument behaves
  exactly as it always has.

  Not connected to Solana. Everything here is local-only timers and
  in-memory state — no network calls, no wallet, no real money.
*/

/** Higher weight = picked more often. Not linear with rarity name, just
 *  relative — tune freely without touching EventManager's logic. */
const RARITY_WEIGHT: Record<EventRarity, number> = {
  common: 10,
  uncommon: 6,
  rare: 3,
  epic: 1.5,
  legendary: 1,
};

/** Default ms duration for every phase except Live (which always comes
 *  from the event definition's own `duration` field — that's the one
 *  number that actually defines "how long is this event"). Any
 *  definition can override individual phases via phaseTimingOverrides. */
const DEFAULT_PHASE_DURATIONS: Record<'countdown' | 'announcement' | 'completed' | 'cooldown', number> = {
  countdown: 15000,
  announcement: 6000,
  completed: 4000,
  cooldown: 20000,
};

/** Lifecycle order used to figure out "what comes next" — Idle isn't in
 *  here because it's not a timed phase, it's the resting state between
 *  scheduleNext() calls. */
const PHASE_ORDER: Exclude<EventPhase, 'idle'>[] = ['countdown', 'announcement', 'live', 'completed', 'cooldown'];

export interface EventManagerOptions {
  /** Override any subset of the default non-Live phase durations. */
  phaseDurations?: Partial<typeof DEFAULT_PHASE_DURATIONS>;
  /** When false, the manager stops at Idle after Cooldown instead of
   *  automatically picking and starting the next event. Useful for a
   *  future "manual/admin-triggered events only" mode. Defaults true. */
  autoAdvance?: boolean;
}

export class EventManager {
  private readonly definitions: EventDefinition[];
  private readonly phaseDurations: Record<'countdown' | 'announcement' | 'completed' | 'cooldown', number>;
  private readonly autoAdvance: boolean;

  private phase: EventPhase = 'idle';
  private current: EventInstance | null = null;
  private lastEventId: string | null = null;

  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<EventManagerListener>();
  private destroyed = false;

  constructor(definitions: EventDefinition[], options: EventManagerOptions = {}) {
    if (definitions.length === 0) {
      throw new Error('EventManager requires at least one EventDefinition');
    }
    this.definitions = definitions;
    this.phaseDurations = { ...DEFAULT_PHASE_DURATIONS, ...options.phaseDurations };
    this.autoAdvance = options.autoAdvance ?? true;
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */

  /** Subscribe to every phase transition. Returns an unsubscribe fn. */
  onChange(listener: EventManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getCurrentEvent(): EventInstance | null {
    return this.current;
  }

  getPhase(): EventPhase {
    return this.phase;
  }

  /** ms left in the current phase, 0 if Idle or already elapsed. */
  getPhaseTimeRemaining(): number {
    if (!this.current) return 0;
    const elapsed = Date.now() - this.current.phaseStartedAt;
    return Math.max(0, this.current.phaseDuration - elapsed);
  }

  /** All registered event definitions — read-only inspection (e.g. a
   *  future "Event Almanac" UI listing every event type that can occur). */
  getDefinitions(): readonly EventDefinition[] {
    return this.definitions;
  }

  /**
   * Picks the next event and begins its Countdown phase. This is the
   * engine's main entry point — call it once (with no argument) to
   * start the loop. Cooldown completion calls it again automatically
   * unless `autoAdvance: false` was passed in.
   *
   * `justFinished` is internal plumbing from onPhaseTimerElapsed() — when
   * given, its chainOptions get a chance to pick the follow-up (req. 3)
   * before falling back to the normal rarity-weighted random pick.
   * Calling scheduleNext() directly (no argument) always behaves exactly
   * as it did before chains existed.
   */
  scheduleNext(justFinished?: EventDefinition): void {
    if (this.destroyed) return;
    const chainSource = justFinished ? this.pickChainFollowUp(justFinished) : null;
    const def = chainSource ?? this.pickNextDefinition();
    this.lastEventId = def.id;
    this.current = {
      definition: def,
      phase: 'countdown',
      phaseStartedAt: Date.now(),
      phaseDuration: 0,
      chainedFrom: chainSource ? justFinished!.id : null,
    };
    this.enterPhase('countdown');
  }

  /**
   * Force-starts an event immediately, skipping straight to Live —
   * for manual/debug triggers (e.g. a future admin "force Whale Alert"
   * action). Picks `id` if given and valid, otherwise a random
   * definition via the same weighting scheduleNext() uses.
   */
  startEvent(id?: string): void {
    if (this.destroyed) return;
    const def = (id && this.definitions.find(d => d.id === id)) || this.pickNextDefinition();
    this.lastEventId = def.id;
    this.current = { definition: def, phase: 'live', phaseStartedAt: Date.now(), phaseDuration: 0, chainedFrom: null };
    this.enterPhase('live');
  }

  /** Ends the current event immediately, skipping any remaining Live
   *  time and moving straight to Completed (then Cooldown as normal). */
  endEvent(): void {
    if (this.destroyed || !this.current) return;
    this.enterPhase('completed');
  }

  /** Stops the lifecycle entirely and returns to Idle. Does not
   *  auto-schedule a replacement — call scheduleNext() to resume. */
  reset(): void {
    if (this.destroyed) return;
    this.clearTimer();
    this.current = null;
    this.setIdle();
  }

  /** Clears timers and listeners. Call on scene/component teardown so a
   *  stale manager can't fire callbacks into a destroyed world. */
  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  /* ═══════════════════════════════════════════════════════════
     INTERNALS
     ═══════════════════════════════════════════════════════════ */

  private pickNextDefinition(): EventDefinition {
    const pool = this.definitions.length > 1
      ? this.definitions.filter(d => d.id !== this.lastEventId)
      : this.definitions;

    const totalWeight = pool.reduce((sum, d) => sum + RARITY_WEIGHT[d.rarity], 0);
    let roll = Math.random() * totalWeight;
    for (const def of pool) {
      roll -= RARITY_WEIGHT[def.rarity];
      if (roll <= 0) return def;
    }
    return pool[pool.length - 1] ?? this.definitions[0];
  }

  /**
   * Rolls `def.chainOptions` in array order — each option's probability
   * is an independent, absolute 0-1 chance, so it's normal (and by
   * design) for every roll to miss and return null, which just means
   * "no chain this time, schedule normally." The first option whose
   * roll succeeds wins; later options in the same array are never
   * consulted once one has already hit.
   */
  private pickChainFollowUp(def: EventDefinition): EventDefinition | null {
    const options = def.chainOptions;
    if (!options || options.length === 0) return null;

    for (const option of options) {
      if (Math.random() < option.probability) {
        const target = this.definitions.find(d => d.id === option.id);
        if (target) return target;
      }
    }
    return null;
  }

  private durationFor(def: EventDefinition, phase: Exclude<EventPhase, 'idle'>): number {
    if (phase === 'live') return def.duration;
    return def.phaseTimingOverrides?.[phase] ?? this.phaseDurations[phase];
  }

  private enterPhase(phase: Exclude<EventPhase, 'idle'>): void {
    if (!this.current) return;
    const def = this.current.definition;
    const duration = this.durationFor(def, phase);
    const prevPhase = this.phase;

    this.phase = phase;
    this.current = { ...this.current, phase, phaseStartedAt: Date.now(), phaseDuration: duration };
    this.notify(prevPhase);

    this.clearTimer();
    this.phaseTimer = setTimeout(() => this.onPhaseTimerElapsed(), Math.max(0, duration));
  }

  private onPhaseTimerElapsed(): void {
    if (this.destroyed || !this.current) return;
    const idx = PHASE_ORDER.indexOf(this.phase as Exclude<EventPhase, 'idle'>);
    const isLastPhase = idx === -1 || idx === PHASE_ORDER.length - 1;

    if (isLastPhase) {
      // Cooldown just elapsed — drop to Idle, then immediately schedule
      // the next event unless the caller wants manual control. The
      // event that just finished gets first say via its own
      // chainOptions (req. 3) before scheduleNext() falls back to a
      // normal random pick.
      const justFinished = this.current.definition;
      this.current = null;
      this.setIdle();
      if (this.autoAdvance) this.scheduleNext(justFinished);
      return;
    }

    this.enterPhase(PHASE_ORDER[idx + 1]);
  }

  private setIdle(): void {
    const prevPhase = this.phase;
    this.phase = 'idle';
    this.notify(prevPhase);
  }

  private notify(prevPhase: EventPhase): void {
    for (const listener of this.listeners) listener(this.current, prevPhase);
  }

  private clearTimer(): void {
    if (this.phaseTimer !== null) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }
}
