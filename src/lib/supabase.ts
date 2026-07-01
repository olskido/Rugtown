/**
 * src/lib/supabase.ts
 * ────────────────────
 * Supabase client singleton for RugTown.
 *
 * If the environment variables are not present (local dev without a
 * Supabase project, CI, or pure guest-only mode) `supabase` is null and
 * `isSupabaseConfigured` is false.  All calling code must guard on
 * `isSupabaseConfigured` so that guest mode keeps working with zero
 * changes to existing gameplay code.
 *
 * Required env vars (copy .env.example → .env.local to set them):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Database types ───────────────────────────────────────────────
// Kept in this file so there is a single source of truth.
// Extend as new tables are added to database/schema.sql.

export interface DbProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  rep: number;
  holder_tier: 'None' | 'Bronze' | 'Silver' | 'Gold';
  created_at: string;
  last_seen_at: string;
}

export interface DbCharacterAppearance {
  user_id: string;
  skin_tone: string;
  hairstyle: string;
  facial_hair: string;
  hat: string;
  glasses: string;
  accessory: string;
  jacket: string;
  pants: string;
  shoes: string;
  backpack: string;
  handheld: string;
  updated_at: string;
}

export interface DbPlayerBadge {
  id: number;
  user_id: string;
  badge_id: string;
  earned_at: string;
}

export interface DbPlayerInventoryItem {
  id: number;
  user_id: string;
  item_id: string;
  quantity: number;
  acquired_at: string;
}

export interface DbDistrictUnlock {
  user_id: string;
  district_id: string;
  unlocked_at: string;
}

export interface DbWalletVerification {
  user_id: string;
  wallet_address: string;
  chain: string;
  verified_at: string | null;
  token_balance: number | null;
  holder_tier: 'None' | 'Bronze' | 'Silver' | 'Gold' | null;
  updated_at: string;
}

// ─── Client ──────────────────────────────────────────────────────

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 *
 * Always check this flag before calling any Supabase API so that
 * unauthenticated / offline guest mode keeps working unchanged:
 *
 * @example
 * if (isSupabaseConfigured && supabase) {
 *   const { data } = await supabase.from('profiles').select('*');
 * }
 */
export const isSupabaseConfigured: boolean =
  Boolean(supabaseUrl) && Boolean(supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Development-only notice — harmless in production where env vars are set.
  console.info(
    '[RugTown] Supabase env vars not configured — running in guest-only mode.\n' +
    'Copy .env.example → .env.local and add your project credentials to enable accounts.'
  );
}

/**
 * Supabase client — null when env vars are not configured.
 * All consumers must check `isSupabaseConfigured` (or null-guard `supabase`)
 * before use so that guest mode is unaffected.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;
