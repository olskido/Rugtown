/**
 * src/lib/profile.ts
 * ──────────────────
 * Thin helpers that read and write the user's persistent profile data in
 * Supabase.  All functions check for a null client first and return a safe
 * fallback value, so they're safe to call from guest-mode code paths too.
 *
 * Nothing in this file touches gameplay state directly — callers decide what
 * to do with the returned data.
 */

import { supabase, type DbProfile, type DbCharacterAppearance } from './supabase';
import type { CharacterAppearance } from '../game/world/CharacterAppearance';

/* ─── profile ─────────────────────────────────────────────────── */

/**
 * Fetch the `profiles` row for `userId`.
 * Returns null on any error (user not found, network failure, etc.) so
 * the caller can fall back to a derived/guest name gracefully.
 */
export async function fetchProfile(userId: string): Promise<DbProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data as DbProfile;
}

/** Minimal shape of the authenticated user needed to seed a profile. Matches
 *  the relevant fields of Supabase's `User` (id / email / user_metadata). */
export interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function sanitizeHandle(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function randomSuffix(): string {
  // 4 base-36 chars — matches the "short random suffix" requirement.
  return Math.random().toString(36).slice(2, 6);
}

/**
 * Fetch the user's profile, creating it from their (Google/OAuth) account if
 * it doesn't exist yet.
 *
 * The database trigger (`handle_new_user`) normally creates the row on signup,
 * but we do NOT rely on it alone — this is the frontend fallback so a missing
 * trigger, a stripped OAuth URL, or any race can't leave a signed-in user
 * without a profile (which would silently break every later `.update()` write).
 *
 * Safe under RLS: the `profiles` INSERT policy allows a row where
 * `auth.uid() = id`, so a user can always create their own row. Username is the
 * sanitized email prefix, with a short random suffix only if that handle is
 * already taken (username is UNIQUE). Row conflicts (trigger/other tab won the
 * race) resolve to whatever is already in the database.
 */
export async function fetchOrCreateProfile(user: AuthUserLike): Promise<DbProfile | null> {
  if (!supabase) return null;

  const existing = await fetchProfile(user.id);
  if (existing) return existing;

  const emailPrefix = sanitizeHandle(user.email?.split('@')[0] ?? '') || 'degen';
  const meta = user.user_metadata ?? {};
  const metaFullName = typeof meta.full_name === 'string' ? meta.full_name : '';
  const metaName     = typeof meta.name === 'string' ? meta.name : '';
  const metaAvatar   = typeof meta.avatar_url === 'string' ? meta.avatar_url : '';
  const metaPicture  = typeof meta.picture === 'string' ? meta.picture : '';

  const displayName = metaFullName || metaName || emailPrefix;
  const avatarUrl   = metaAvatar || metaPicture || null;

  // Try the clean handle first; add a random suffix only if it's needed.
  const candidates = [emailPrefix, `${emailPrefix}_${randomSuffix()}`, `${emailPrefix}_${randomSuffix()}`];
  for (const username of candidates) {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username,
        display_name: displayName,
        avatar_url: avatarUrl,
      })
      .select()
      .single();

    if (!error && data) return data as DbProfile;

    // The row may already exist (trigger or another tab created it first) —
    // whatever is stored is authoritative, so prefer it over retrying.
    const now = await fetchProfile(user.id);
    if (now) return now;

    // Otherwise it was most likely a username-unique clash → next candidate.
  }

  return await fetchProfile(user.id);
}

/**
 * Persist the player's chosen display handle to profiles.username.
 * Silently no-ops on conflict or network errors so gameplay is unaffected.
 */
export async function saveUsername(userId: string, username: string): Promise<void> {
  if (!supabase) return;
  const trimmed = username.trim();
  if (!trimmed) return;
  await supabase
    .from('profiles')
    .update({ username: trimmed, display_name: trimmed })
    .eq('id', userId);
}

/* ─── character_appearance ────────────────────────────────────── */

/**
 * Fetch the saved character appearance for `userId`.
 * Returns null if the user has no saved appearance yet (first login) or
 * on any error — caller uses DEFAULT_APPEARANCE in that case.
 */
export async function fetchSavedAppearance(
  userId: string,
): Promise<CharacterAppearance | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('character_appearance')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;

  const row = data as DbCharacterAppearance;
  return {
    skinTone:   row.skin_tone,
    hairstyle:  row.hairstyle,
    facialHair: row.facial_hair,
    hat:        row.hat,
    glasses:    row.glasses,
    accessory:  row.accessory,
    jacket:     row.jacket,
    pants:      row.pants,
    shoes:      row.shoes,
    backpack:   row.backpack,
    handheld:   row.handheld,
  };
}

/**
 * Upsert the player's character appearance.
 * Uses `user_id` as the conflict target (it's the PK).
 */
export async function saveAppearance(
  userId: string,
  appearance: CharacterAppearance,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('character_appearance')
    .upsert(
      {
        user_id:     userId,
        skin_tone:   appearance.skinTone,
        hairstyle:   appearance.hairstyle,
        facial_hair: appearance.facialHair,
        hat:         appearance.hat,
        glasses:     appearance.glasses,
        accessory:   appearance.accessory,
        jacket:      appearance.jacket,
        pants:       appearance.pants,
        shoes:       appearance.shoes,
        backpack:    appearance.backpack,
        handheld:    appearance.handheld,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

/* ─── badges ──────────────────────────────────────────────────── */

/**
 * Fetch the IDs of every badge the user has earned.
 * Returns an empty array on any error — caller stays in default state.
 */
export async function fetchUserBadgeIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('player_badges')
    .select('badge_id')
    .eq('user_id', userId);
  if (error || !data) return [];
  return (data as { badge_id: string }[]).map(row => row.badge_id);
}

/**
 * Upsert a single earned badge.
 * The UNIQUE(user_id, badge_id) constraint means this is idempotent.
 */
export async function saveBadge(userId: string, badgeId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('player_badges')
    .upsert(
      { user_id: userId, badge_id: badgeId },
      { onConflict: 'user_id,badge_id' },
    );
}

/* ─── inventory ───────────────────────────────────────────────── */

/**
 * Fetch all item IDs the user has in player_inventory.
 * Returns [] on any error — caller treats unloaded items as not-yet-saved.
 */
export async function fetchInventoryItemIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('player_inventory')
    .select('item_id')
    .eq('user_id', userId);
  if (error || !data) return [];
  return (data as { item_id: string }[]).map(row => row.item_id);
}

/**
 * Upsert a single owned item into player_inventory.
 * UNIQUE(user_id, item_id) constraint makes this idempotent.
 */
export async function saveInventoryItem(
  userId: string,
  itemId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('player_inventory')
    .upsert(
      { user_id: userId, item_id: itemId },
      { onConflict: 'user_id,item_id' },
    );
}

/* ─── district_unlocks ─────────────────────────────────────────── */

/**
 * Fetch all district IDs the user has unlocked.
 * Returns [] on any error — caller initialises districts to local defaults.
 */
export async function fetchDistrictUnlockIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('district_unlocks')
    .select('district_id')
    .eq('user_id', userId);
  if (error || !data) return [];
  return (data as { district_id: string }[]).map(row => row.district_id);
}

/**
 * Upsert a single unlocked district.
 * UNIQUE(user_id, district_id) constraint makes this idempotent.
 */
export async function saveDistrictUnlock(
  userId: string,
  districtId: string,
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('district_unlocks')
    .upsert(
      { user_id: userId, district_id: districtId },
      { onConflict: 'user_id,district_id' },
    );
}

/* ─── rep ─────────────────────────────────────────────────────── */

/**
 * Persist the player's current REP score to profiles.rep.
 * Called debounced from GamePage so writes are batched on inactivity.
 */
export async function saveRep(userId: string, rep: number): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('profiles')
    .update({ rep })
    .eq('id', userId);
}

/**
 * Stamp profiles.last_seen_at to now().
 * Called when the Realtime presence channel subscribes successfully.
 */
export async function updateLastSeen(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}
