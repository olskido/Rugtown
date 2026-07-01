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
