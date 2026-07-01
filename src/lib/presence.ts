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
