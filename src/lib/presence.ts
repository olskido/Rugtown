/**
 * src/lib/presence.ts
 * ───────────────────
 * Supabase Realtime presence helpers for the RugTown city channel.
 *
 * All exports are no-ops when Supabase is not configured so the game
 * runs identically for guests and in environments without env vars.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import type { PresenceAppearance, PresencePayload } from './presenceTypes';

export type { PresenceAppearance, PresencePayload };

/** Live online-count state for landing page / HUD. */
export type PresenceCountState =
  | { status: 'unavailable' }
  | { status: 'connecting' }
  | { status: 'connected'; count: number };

/**
 * Create the Supabase Realtime channel for city-wide presence.
 * Returns null if Supabase is not configured — callers must guard on null.
 *
 * The caller owns subscribe / track / unsubscribe lifecycle.
 */
const CITY_TOPIC = 'rugtown:city';

/**
 * Remove any Realtime channel already registered on the city topic.
 * Prevents a duplicate-join `CHANNEL_ERROR` when a stale channel is still
 * registered — e.g. the landing-page counter, or a React StrictMode
 * double-mount in development.
 */
function removeStaleCityChannels(): void {
  if (!supabase) return;
  for (const ch of supabase.getChannels()) {
    if (ch.topic === CITY_TOPIC || ch.topic.endsWith(`:${CITY_TOPIC}`)) {
      supabase.removeChannel(ch);
    }
  }
}

export function createCityChannel(): RealtimeChannel | null {
  if (!isSupabaseConfigured || !supabase) return null;
  removeStaleCityChannels();
  return supabase.channel(CITY_TOPIC);
}

/**
 * Fully remove a city channel from the client registry (not just unsubscribe).
 * `unsubscribe()` alone leaves the channel registered, which causes the next
 * subscribe on the same topic to collide.
 */
export function removeCityChannel(channel: RealtimeChannel | null): void {
  if (!supabase || !channel) return;
  supabase.removeChannel(channel);
}

/**
 * Subscribe to the city presence channel and report the live player count.
 * Does not track a player — read-only listener for landing page stats.
 * Returns an unsubscribe function.
 */
export function subscribeCityPresenceCount(
  onUpdate: (state: PresenceCountState) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    onUpdate({ status: 'unavailable' });
    return () => {};
  }

  const channel = createCityChannel();
  if (!channel) {
    onUpdate({ status: 'unavailable' });
    return () => {};
  }

  onUpdate({ status: 'connecting' });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresencePayload>();
      const all = Object.values(state).flat() as PresencePayload[];
      onUpdate({ status: 'connected', count: all.length });
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onUpdate({ status: 'unavailable' });
      }
    });

  return () => {
    removeCityChannel(channel);
  };
}
