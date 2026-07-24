/**
 * CharacterService — server loadouts & cosmetics (Phase 10L).
 */

import { supabase, isSupabaseConfigured } from '../supabase';
import {
  SAFE_DEFAULT_LOADOUT,
  sanitizeLoadout,
  type CharacterLoadoutV2,
} from '../../game/characters/CharacterAppearanceModel';
import { sanitizePublicCosmeticId } from '../../game/characters/CosmeticIdMapping';
import { listActiveByCategory, type CharacterManifestEntry } from '../../game/characters/CharacterManifest';

export interface OwnedCosmetic {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  grantedAt?: string;
}

class CharacterService {
  private userId: string | null = null;
  private owned: OwnedCosmetic[] = [];
  private loadout: CharacterLoadoutV2 | null = null;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getOwned(): OwnedCosmetic[] { return this.owned; }
  getLoadout(): CharacterLoadoutV2 | null { return this.loadout; }

  async initForAuthenticatedUser(userId: string): Promise<void> {
    this.userId = userId;
    if (!isSupabaseConfigured || !supabase) return;
    await Promise.all([this.refreshCosmetics(), this.refreshLoadout()]);
    // Best-effort one-time welcome cosmetic (server idempotent).
    void supabase.rpc('claim_welcome_citizen_cosmetic').then(() => this.refreshCosmetics());
    this.notify();
  }

  clear(): void {
    this.userId = null;
    this.owned = [];
    this.loadout = null;
    this.notify();
  }

  async refreshCosmetics(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_character_cosmetics');
    if (error || !data) return;
    const rows = ((data as { cosmetics?: Record<string, unknown>[] }).cosmetics) ?? [];
    this.owned = rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slot: String(r.slot),
      rarity: String(r.rarity ?? 'common'),
      grantedAt: r.grantedAt ? String(r.grantedAt) : undefined,
    }));
    this.notify();
  }

  async refreshLoadout(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_character_loadout');
    if (error || data == null || data === 'null') return;
    const row = data as { slots?: Record<string, string> };
    const slots = row.slots ?? {};
    this.loadout = sanitizeLoadout({
      version: 1,
      baseModelId: sanitizePublicCosmeticId(slots.base, 'base'),
      skinToneId: 'default',
      hairStyleId: sanitizePublicCosmeticId(slots.hair, 'hair'),
      hairColorId: 'default',
      outfitId: sanitizePublicCosmeticId(slots.outfit, 'outfit'),
      shoeId: 'default',
      headwearId: sanitizePublicCosmeticId(slots.hat ?? 'none', 'hat'),
      faceAccessoryId: sanitizePublicCosmeticId(slots.glasses ?? 'none', 'glasses'),
      backAccessoryId: 'none',
      heldItemId: 'none',
      auraId: 'none',
      emoteSetId: 'default',
      nameplateStyleId: 'default',
    });
    this.notify();
  }

  async updateLoadout(partial: Partial<CharacterLoadoutV2>): Promise<{ ok: boolean; message: string }> {
    if (!supabase || !this.userId) return { ok: false, message: 'Sign in required' };
    const next = sanitizeLoadout({ ...(this.loadout ?? SAFE_DEFAULT_LOADOUT), ...partial, version: 1 });
    const slots: Record<string, string> = {
      base: next.baseModelId,
      hair: next.hairStyleId,
      outfit: next.outfitId,
    };
    if (next.headwearId && next.headwearId !== 'none') slots.hat = next.headwearId;
    if (next.faceAccessoryId && next.faceAccessoryId !== 'none') slots.glasses = next.faceAccessoryId;

    const { error } = await supabase.rpc('update_character_loadout', {
      p_slots: slots,
      p_name: null,
    });
    if (error) return { ok: false, message: error.message };
    this.loadout = next;
    this.notify();
    return { ok: true, message: 'Loadout saved' };
  }

  async getPublicLoadout(playerId: string): Promise<CharacterLoadoutV2 | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_public_character_loadout', {
      p_player_id: playerId,
    });
    if (error || data == null || data === 'null') return null;
    const slots = ((data as { slots?: Record<string, string> }).slots) ?? {};
    return sanitizeLoadout({
      version: 1,
      baseModelId: sanitizePublicCosmeticId(slots.base, 'base'),
      skinToneId: 'default',
      hairStyleId: sanitizePublicCosmeticId(slots.hair, 'hair'),
      hairColorId: 'default',
      outfitId: sanitizePublicCosmeticId(slots.outfit, 'outfit'),
      shoeId: 'default',
      headwearId: sanitizePublicCosmeticId(slots.hat ?? 'none', 'hat'),
      faceAccessoryId: sanitizePublicCosmeticId(slots.glasses ?? 'none', 'glasses'),
      backAccessoryId: 'none',
      heldItemId: 'none',
      auraId: 'none',
      emoteSetId: 'default',
      nameplateStyleId: 'default',
    });
  }

  catalogPreview(): CharacterManifestEntry[] {
    return [
      ...listActiveByCategory('hair'),
      ...listActiveByCategory('outfit'),
      ...listActiveByCategory('headwear'),
      ...listActiveByCategory('face'),
    ];
  }
}

export const characterService = new CharacterService();
