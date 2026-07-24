/**
 * Character appearance service — guest localStorage + Supabase RPC.
 */

import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import {
  decodeCharacterAppearance,
  encodeCharacterAppearance,
  migrateCharacterAppearance,
  normalizeCharacterAppearance,
} from './CharacterAppearanceCodec';
import type { CharacterAppearanceV1 } from './CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance } from './CharacterAppearanceDefaults';
import { assetExists } from '../assets/CharacterAssetRegistry';

const GUEST_KEY = 'rugtown:characterAppearance:v1';

type Listener = (a: CharacterAppearanceV1, revision: number) => void;

class CharacterAppearanceService {
  private appearance: CharacterAppearanceV1 = getDefaultCharacterAppearance();
  private revision = 0;
  private userId: string | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.appearance, this.revision);
  }

  getAppearance(): CharacterAppearanceV1 {
    return this.appearance;
  }

  getRevision(): number {
    return this.revision;
  }

  getCompactPresencePayload(): string {
    return encodeCharacterAppearance(this.appearance);
  }

  loadGuest(): CharacterAppearanceV1 {
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (raw) {
        this.appearance = migrateCharacterAppearance(JSON.parse(raw), assetExists);
        this.revision = 1;
        this.notify();
        return this.appearance;
      }
    } catch { /* ignore */ }
    this.appearance = getDefaultCharacterAppearance();
    this.notify();
    return this.appearance;
  }

  saveGuest(appearance: CharacterAppearanceV1): void {
    this.appearance = normalizeCharacterAppearance(appearance, assetExists);
    this.revision += 1;
    localStorage.setItem(GUEST_KEY, JSON.stringify(this.appearance));
    this.notify();
  }

  async initForUser(userId: string | null): Promise<CharacterAppearanceV1> {
    this.userId = userId;
    if (!userId || !isSupabaseConfigured || !supabase) {
      return this.loadGuest();
    }
    const { data, error } = await supabase.rpc('get_my_character_appearance');
    if (error || data == null || data === 'null') {
      const guest = this.loadGuest();
      await this.saveAuthenticated(guest);
      return this.appearance;
    }
    const row = data as { appearance?: unknown; revision?: number };
    this.appearance = normalizeCharacterAppearance(row.appearance, assetExists);
    this.revision = Number(row.revision ?? 1);
    this.notify();
    return this.appearance;
  }

  async saveAuthenticated(appearance: CharacterAppearanceV1): Promise<{ ok: boolean; message: string }> {
    this.appearance = normalizeCharacterAppearance(appearance, assetExists);
    if (!this.userId || !supabase) {
      this.saveGuest(this.appearance);
      return { ok: true, message: 'Saved locally' };
    }
    const { data, error } = await supabase.rpc('save_my_character_appearance', {
      p_appearance: this.appearance,
      p_expected_revision: this.revision,
    });
    if (error) return { ok: false, message: error.message };
    const row = data as { appearance?: unknown; revision?: number };
    if (row?.appearance) this.appearance = normalizeCharacterAppearance(row.appearance, assetExists);
    if (row?.revision != null) this.revision = Number(row.revision);
    else this.revision += 1;
    localStorage.setItem(GUEST_KEY, JSON.stringify(this.appearance));
    this.notify();
    return { ok: true, message: 'Appearance saved' };
  }

  applyLocal(appearance: CharacterAppearanceV1): void {
    this.appearance = normalizeCharacterAppearance(appearance, assetExists);
    this.revision += 1;
    this.notify();
  }
}

export const characterAppearanceService = new CharacterAppearanceService();
export { decodeCharacterAppearance };
