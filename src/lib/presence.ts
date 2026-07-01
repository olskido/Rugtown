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
import type { CharacterAppearance } from '../game/world/CharacterAppearance';

/** Payload broadcast by every connected player (real or guest). */
export interface PresencePayload {
  id:         string;    // Supabase user id, or guest_<random> for guests
  username:   string;
  x:          number;    // world pixel x (rounded)
  y:          number;    // world pixel y (rounded)
  appearance: CharacterAppearance;
  rep:        number;
  holderTier: string;    // 'None' | 'Bronze' | 'Silver' | 'Gold'
}

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
export function createCityChannel(): RealtimeChannel | null {
  if (!isSupabaseConfigured || !supabase) return null;
  return supabase.channel('rugtown:city');
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
    channel.unsubscribe();
  };
}
