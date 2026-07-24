/**
 * AchievementService.ts — client boundary for Phase 10I server achievements,
 * titles, and season pass. Guests stay local (ProgressionService). Authenticated
 * users fail closed: the browser never decides unlocks or thresholds.
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { rewardService } from '../rewards/RewardService';
import type {
  AchievementCatalogItem,
  AchievementProgressView,
  AchievementUnlockView,
  PlayerSeasonPassView,
  SeasonPassTierView,
  SeasonPassView,
  TitleView,
} from './types';

class AchievementService {
  private catalog: AchievementCatalogItem[] = [];
  private progress: AchievementProgressView[] = [];
  private unlocks: AchievementUnlockView[] = [];
  private titles: TitleView[] = [];
  private seasonPass: SeasonPassView | null = null;
  private seasonTiers: SeasonPassTierView[] = [];
  private playerPass: PlayerSeasonPassView | null = null;
  private claimedRewardIds = new Set<string>();
  private listeners = new Set<() => void>();
  private realtimeChannel: { unsubscribe?: () => void } | null = null;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getCatalog(): AchievementCatalogItem[] { return this.catalog; }
  getProgress(): AchievementProgressView[] { return this.progress; }
  getUnlocks(): AchievementUnlockView[] { return this.unlocks; }
  getTitles(): TitleView[] { return this.titles; }
  getEquippedTitle(): TitleView | null { return this.titles.find((t) => t.isEquipped && !t.revokedAt) ?? null; }
  getSeasonPass(): SeasonPassView | null { return this.seasonPass; }
  getSeasonTiers(): SeasonPassTierView[] { return this.seasonTiers; }
  getPlayerPass(): PlayerSeasonPassView | null { return this.playerPass; }
  isRewardClaimed(rewardId: string): boolean { return this.claimedRewardIds.has(rewardId); }

  completionPercent(): number {
    if (this.catalog.length === 0) return 0;
    const unlocked = new Set(this.unlocks.map((u) => u.achievementId));
    return Math.round((unlocked.size / this.catalog.length) * 100);
  }

  async initForAuthenticatedUser(userId: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase || !rewardService.isServerAuthoritative()) {
      this.catalog = [];
      this.notify();
      return;
    }
    await Promise.all([
      this.refreshCatalog(),
      this.refreshProgress(),
      this.refreshUnlocks(),
      this.refreshTitles(),
      this.refreshSeasonPass(),
    ]);
    this.subscribeRealtime(userId);
    // Kick an evaluation after login (idempotent)
    void this.requestEvaluation('login');
    this.notify();
  }

  async refreshCatalog(): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_achievement_catalog');
    if (error || !data) return;
    const rows = ((data as { achievements?: Record<string, unknown>[] }).achievements ?? []);
    this.catalog = rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug ?? ''),
      name: String(r.name),
      description: String(r.description ?? ''),
      category: r.category as AchievementCatalogItem['category'],
      rarity: r.rarity as AchievementCatalogItem['rarity'],
      isSecret: Boolean(r.isSecret),
      titleUnlockId: (r.titleUnlockId ?? null) as string | null,
      sortOrder: Number(r.sortOrder ?? 0),
      target: Number(r.target ?? 1),
      rewardXp: Number(r.rewardXp ?? 0),
      rewardRep: Number(r.rewardRep ?? 0),
    }));
    this.notify();
  }

  async refreshProgress(): Promise<void> {
    if (!supabase || !rewardService.isServerAuthoritative()) return;
    const { data, error } = await supabase.rpc('get_my_achievement_progress');
    if (error || !data) return;
    const rows = ((data as { progress?: Record<string, unknown>[] }).progress ?? []);
    this.progress = rows.map((r) => ({
      achievementId: String(r.achievement_id ?? r.achievementId),
      currentValue: Number(r.current_value ?? r.currentValue ?? 0),
      targetValue: Number(r.target_value ?? r.targetValue ?? 1),
      status: (r.status as AchievementProgressView['status']) ?? 'tracking',
      completedAt: (r.completed_at ?? r.completedAt ?? null) as string | null,
    }));
    this.notify();
  }

  async refreshUnlocks(): Promise<void> {
    if (!supabase || !rewardService.isServerAuthoritative()) return;
    const { data, error } = await supabase.rpc('get_my_achievements');
    if (error || !data) return;
    const rows = ((data as { unlocks?: Record<string, unknown>[] }).unlocks ?? []);
    this.unlocks = rows.map((r) => ({
      id: String(r.id),
      achievementId: String(r.achievement_id ?? r.achievementId),
      unlockedAt: String(r.unlocked_at ?? r.unlockedAt),
      verificationStatus: String(r.verification_status ?? r.verificationStatus ?? 'verified'),
    }));
    this.notify();
  }

  async refreshTitles(): Promise<void> {
    if (!supabase || !rewardService.isServerAuthoritative()) return;
    const { data, error } = await supabase.rpc('get_my_titles');
    if (error || !data) return;
    const rows = ((data as { titles?: Record<string, unknown>[] }).titles ?? []);
    this.titles = rows.map((r) => ({
      id: String(r.id),
      titleId: String(r.titleId ?? r.title_id),
      name: String(r.name),
      description: String(r.description ?? ''),
      rarity: r.rarity as TitleView['rarity'],
      isEquipped: Boolean(r.isEquipped ?? r.is_equipped),
      unlockedAt: String(r.unlockedAt ?? r.unlocked_at),
      sourceType: String(r.sourceType ?? r.source_type ?? ''),
      revokedAt: (r.revokedAt ?? r.revoked_at ?? null) as string | null,
      isHidden: Boolean(r.isHidden ?? r.is_hidden),
    }));
    this.notify();
  }

  async refreshSeasonPass(): Promise<void> {
    if (!supabase) return;
    const { data: catalog } = await supabase.rpc('get_season_pass_catalog');
    if (catalog) {
      const payload = catalog as { pass?: Record<string, unknown> | null; tiers?: Record<string, unknown>[] };
      if (payload.pass) {
        this.seasonPass = {
          id: String(payload.pass.id),
          seasonId: String(payload.pass.seasonId),
          name: String(payload.pass.name),
          description: String(payload.pass.description ?? ''),
          status: String(payload.pass.status),
          startsAt: String(payload.pass.startsAt),
          endsAt: String(payload.pass.endsAt),
          maxTier: Number(payload.pass.maxTier ?? 10),
          pointsPerTier: Number(payload.pass.pointsPerTier ?? 50),
          premiumEnabled: Boolean(payload.pass.premiumEnabled),
          isTest: Boolean(payload.pass.isTest),
        };
        this.seasonTiers = (payload.tiers ?? []).map((t) => ({
          id: String(t.id),
          tierNumber: Number(t.tierNumber),
          pointsRequired: Number(t.pointsRequired),
          name: (t.name ?? null) as string | null,
          freeReward: (t.freeReward ?? null) as SeasonPassTierView['freeReward'],
          premiumReward: (t.premiumReward ?? null) as SeasonPassTierView['premiumReward'],
        }));
      } else {
        this.seasonPass = null;
        this.seasonTiers = [];
      }
    }

    if (rewardService.isServerAuthoritative() && this.seasonPass) {
      const { data: mine } = await supabase.rpc('get_my_season_pass', { p_pass_id: this.seasonPass.id });
      if (mine) {
        const payload = mine as {
          playerPass?: Record<string, unknown>;
          claims?: Record<string, unknown>[];
          premiumEntitled?: boolean;
        };
        const pp = payload.playerPass;
        if (pp) {
          this.playerPass = {
            seasonPassPoints: Number(pp.season_pass_points ?? pp.seasonPassPoints ?? 0),
            currentTier: Number(pp.current_tier ?? pp.currentTier ?? 0),
            premiumEntitled: Boolean(payload.premiumEntitled ?? pp.premium_entitled),
            joinedAt: String(pp.joined_at ?? pp.joinedAt ?? ''),
          };
        }
        this.claimedRewardIds = new Set(
          (payload.claims ?? []).map((c) => String(c.season_pass_reward_id ?? c.seasonPassRewardId ?? '')),
        );
      }
    }
    this.notify();
  }

  /** Request server evaluation. Browser does not decide completion. */
  async requestEvaluation(eventType: string, eventId?: string): Promise<{ ok: boolean; unlocked?: number; message: string }> {
    if (!supabase || !rewardService.isServerAuthoritative()) {
      return { ok: false, message: 'Server achievement authority unavailable' };
    }
    const { data, error } = await supabase.rpc('evaluate_player_achievements', {
      p_player_id: null,
      p_event_type: eventType,
    });
    if (error) return { ok: false, message: error.message };
    await Promise.all([this.refreshProgress(), this.refreshUnlocks(), this.refreshTitles()]);
    const unlocked = Number((data as { unlocked?: number })?.unlocked ?? 0);
    return { ok: true, unlocked, message: unlocked > 0 ? `Unlocked ${unlocked} achievement(s)` : 'Progress updated' };
  }

  async equipTitle(titleId: string): Promise<{ ok: boolean; message: string }> {
    if (!supabase || !rewardService.isServerAuthoritative()) {
      return { ok: false, message: 'Server required to equip titles' };
    }
    const { error } = await supabase.rpc('equip_player_title', { p_title_id: titleId });
    if (error) return { ok: false, message: error.message };
    await this.refreshTitles();
    return { ok: true, message: 'Title equipped' };
  }

  async unequipTitle(): Promise<{ ok: boolean; message: string }> {
    if (!supabase || !rewardService.isServerAuthoritative()) {
      return { ok: false, message: 'Server required' };
    }
    const { error } = await supabase.rpc('unequip_player_title');
    if (error) return { ok: false, message: error.message };
    await this.refreshTitles();
    return { ok: true, message: 'Title unequipped' };
  }

  async claimSeasonPassReward(rewardId: string): Promise<{ ok: boolean; message: string }> {
    if (!supabase || !rewardService.isServerAuthoritative()) {
      return { ok: false, message: 'Server required to claim season-pass rewards' };
    }
    const { data, error } = await supabase.rpc('claim_season_pass_reward', { p_reward_id: rewardId });
    if (error) return { ok: false, message: error.message };
    await this.refreshSeasonPass();
    const payload = data as { idempotent?: boolean };
    return {
      ok: true,
      message: payload.idempotent ? 'Already claimed' : 'Reward claimed',
    };
  }

  private subscribeRealtime(userId: string): void {
    if (!supabase) return;
    this.unsubscribeRealtime();
    const filter = `player_id=eq.${userId}`;
    const channel = supabase
      .channel(`achievements:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_achievements', filter }, () => {
        void this.refreshUnlocks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_achievement_progress', filter }, () => {
        void this.refreshProgress();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_titles', filter }, () => {
        void this.refreshTitles();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_season_pass', filter }, () => {
        void this.refreshSeasonPass();
      })
      .subscribe();
    this.realtimeChannel = channel as unknown as { unsubscribe?: () => void };
  }

  private unsubscribeRealtime(): void {
    if (this.realtimeChannel && supabase) {
      try { supabase.removeChannel(this.realtimeChannel as never); }
      catch { this.realtimeChannel.unsubscribe?.(); }
    }
    this.realtimeChannel = null;
  }

  teardown(): void {
    this.unsubscribeRealtime();
    this.catalog = [];
    this.progress = [];
    this.unlocks = [];
    this.titles = [];
    this.seasonPass = null;
    this.playerPass = null;
    this.notify();
  }
}

export const achievementService = new AchievementService();
