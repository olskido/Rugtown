/**
 * ChapterMissionService — client boundary for Phase 13 Chapter One RPCs.
 */

import { supabase, isSupabaseConfigured } from '../supabase';
import type { ServerProgressionSnapshot } from '../../game/rewards/types';

export interface ChapterMissionRow {
  missionId: string;
  status: 'locked' | 'active' | 'completed';
  missionVersion: number;
  title: string;
  xpReward: number;
  repReward: number;
  missionOrder: number;
  completedAt?: string | null;
  rewardClaimedAt?: string | null;
}

export interface CompleteChapterMissionResult {
  awarded: boolean;
  duplicate: boolean;
  missionId: string;
  xpAwarded?: number;
  repAwarded?: number;
  progression?: ServerProgressionSnapshot;
  error?: string;
}

function mapRow(raw: Record<string, unknown>): ChapterMissionRow {
  return {
    missionId: String(raw.missionId ?? raw.mission_id ?? ''),
    status: (raw.status as ChapterMissionRow['status']) ?? 'locked',
    missionVersion: Number(raw.missionVersion ?? raw.mission_version ?? 1),
    title: String(raw.title ?? ''),
    xpReward: Number(raw.xpReward ?? raw.xp_reward ?? 0),
    repReward: Number(raw.repReward ?? raw.rep_reward ?? 0),
    missionOrder: Number(raw.missionOrder ?? raw.mission_order ?? 0),
    completedAt: (raw.completedAt ?? raw.completed_at) as string | null | undefined,
    rewardClaimedAt: (raw.rewardClaimedAt ?? raw.reward_claimed_at) as string | null | undefined,
  };
}

export async function ensureChapterMissions(): Promise<ChapterMissionRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc('ensure_chapter_missions');
  if (error || !data) return [];
  const payload = data as { missions?: Record<string, unknown>[] };
  return (payload.missions ?? []).map(mapRow);
}

export async function getChapterMissions(): Promise<ChapterMissionRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc('get_my_chapter_missions');
  if (error || !data) return [];
  const payload = data as { missions?: Record<string, unknown>[] };
  return (payload.missions ?? []).map(mapRow);
}

export async function completeChapterMission(
  missionId: string,
): Promise<CompleteChapterMissionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { awarded: false, duplicate: false, missionId, error: 'supabase_not_configured' };
  }
  const { data, error } = await supabase.rpc('complete_chapter_mission', {
    p_mission_id: missionId,
  });
  if (error) {
    return {
      awarded: false,
      duplicate: false,
      missionId,
      error: error.message,
    };
  }
  const payload = data as {
    awarded?: boolean;
    duplicate?: boolean;
    missionId?: string;
    xpAwarded?: number;
    repAwarded?: number;
    progression?: ServerProgressionSnapshot;
  };
  return {
    awarded: !!payload.awarded,
    duplicate: !!payload.duplicate,
    missionId: String(payload.missionId ?? missionId),
    xpAwarded: payload.xpAwarded,
    repAwarded: payload.repAwarded,
    progression: payload.progression,
  };
}
