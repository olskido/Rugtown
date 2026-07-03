/*
  notificationQueue.ts
  ────────────────────
  Global, framework-agnostic notification queue for RugTown.

  Problem it solves: Mayor announcements, Whale Alerts, Treasure Hunt, Town
  Crier, badge/level/REP/district unlocks, event announcements and system
  messages all used to pop independently and could stack / overlap on screen.

  Rules (single source of truth for the whole app):
   1. Only ONE notification is ever visible at a time.
   2. New notifications while one is showing are QUEUED (FIFO) — never replace
      the visible one.
   3. When a notification finishes NATURALLY, wait ~15s before the next.
   4. Closing with the X advances to the next queued notification IMMEDIATELY
      (no 15s gap).
   5. High-priority notifications (Whale / Treasure / Mayor) jump ahead of
      normal ones in the queue but still never overlap the current one.

  Usage:
    import { notificationQueue } from '../lib/notificationQueue';
    notificationQueue.push({ kind: 'whale', icon: '🐳', text: 'Whale spotted!', priority: 'high' });

  React subscribes via the useNotificationQueue() hook (see below).
*/

export type NotificationPriority = 'high' | 'normal';

export type NotificationKind =
  | 'mayor'
  | 'whale'
  | 'treasure'
  | 'crier'
  | 'badge'
  | 'level'
  | 'rep'
  | 'event'
  | 'district'
  | 'system';

export interface NotificationInput {
  kind: NotificationKind;
  /** Short body text. */
  text: string;
  /** Optional emoji/glyph shown at the leading edge. */
  icon?: string;
  /** Optional bold heading above the text. */
  title?: string;
  /** 'high' notifications jump the FIFO queue (but never the current one). */
  priority?: NotificationPriority;
  /** How long it stays on screen, ms. Defaults to DEFAULT_DURATION. */
  duration?: number;
}

export interface ActiveNotification extends Required<Omit<NotificationInput, 'duration'>> {
  id: number;
  duration: number;
}

/** Gap after a notification finishes naturally before the next appears. */
export const NOTIFICATION_GAP_MS = 15_000;
/** Default time a notification stays visible before auto-finishing. */
export const DEFAULT_DURATION_MS = 6_000;

class NotificationQueue {
  private current: ActiveNotification | null = null;
  private queue: ActiveNotification[] = [];
  private idCounter = 0;
  private subscribers = new Set<() => void>();

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private gapPending = false;

  /** Subscribe to any change (current/queue). Returns an unsubscribe fn. */
  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  getCurrent(): ActiveNotification | null {
    return this.current;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private emit() {
    this.subscribers.forEach(fn => fn());
  }

  /** Enqueue a notification. Returns its id. */
  push(input: NotificationInput): number {
    const item: ActiveNotification = {
      id: ++this.idCounter,
      kind: input.kind,
      text: input.text,
      icon: input.icon ?? '',
      title: input.title ?? '',
      priority: input.priority ?? 'normal',
      duration: input.duration ?? DEFAULT_DURATION_MS,
    };

    if (item.priority === 'high') {
      // Jump ahead of the first normal item, but keep FIFO among high items.
      const idx = this.queue.findIndex(q => q.priority !== 'high');
      if (idx < 0) this.queue.push(item);
      else this.queue.splice(idx, 0, item);
    } else {
      this.queue.push(item);
    }

    this.tryShowNext();
    this.emit();
    return item.id;
  }

  /** Show the next queued item, unless one is visible or we're in the gap. */
  private tryShowNext() {
    if (this.current || this.gapPending) return;
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    this.hideTimer = setTimeout(() => this.finishCurrent(), next.duration);
    this.emit();
  }

  /** Natural end of a notification → start the ~15s gap, then show next. */
  private finishCurrent() {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.current = null;
    this.emit();

    this.gapPending = true;
    this.gapTimer = setTimeout(() => {
      this.gapPending = false;
      this.gapTimer = null;
      this.tryShowNext();
    }, NOTIFICATION_GAP_MS);
  }

  /** User pressed X → drop the current one and advance IMMEDIATELY (no gap). */
  dismissCurrent() {
    if (!this.current) return;
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.gapTimer) { clearTimeout(this.gapTimer); this.gapTimer = null; }
    this.gapPending = false;
    this.current = null;
    this.tryShowNext();
    this.emit();
  }

  /** Wipe everything (e.g. on unmount / sign-out). */
  reset() {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.gapTimer) { clearTimeout(this.gapTimer); this.gapTimer = null; }
    this.gapPending = false;
    this.current = null;
    this.queue = [];
    this.emit();
  }
}

export const notificationQueue = new NotificationQueue();
