/**
 * PeriodMissions.ts — client catalog mirroring server mission_definitions.
 * Server remains authoritative for assignment + rewards when RPCs are available.
 */

import type { MissionObjectiveType, MissionPeriodType } from './types';

export interface PeriodMissionDef {
  id: string;
  periodType: MissionPeriodType;
  title: string;
  description: string;
  objectiveType: MissionObjectiveType;
  target: number;
  objectiveRef?: string;
  xpReward: number;
  repReward: number;
  seasonPoints: number;
  rugPoints: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const DAILY_MISSION_CATALOG: PeriodMissionDef[] = [
  {
    id: 'daily_visit_spring',
    periodType: 'daily',
    title: 'Spring Visit',
    description: 'Enter Spring Water Core.',
    objectiveType: 'visit_district',
    target: 1,
    objectiveRef: 'spring_core',
    xpReward: 40,
    repReward: 5,
    seasonPoints: 8,
    rugPoints: 10,
    difficulty: 'easy',
  },
  {
    id: 'daily_visit_bridge',
    periodType: 'daily',
    title: 'Bridge Walk',
    description: 'Discover the Main Bridge.',
    objectiveType: 'visit_landmark',
    target: 1,
    objectiveRef: 'bridge',
    xpReward: 40,
    repReward: 5,
    seasonPoints: 8,
    rugPoints: 10,
    difficulty: 'easy',
  },
  {
    id: 'daily_three_landmarks',
    periodType: 'daily',
    title: 'Three Stops',
    description: 'Discover 3 landmarks today.',
    objectiveType: 'discover_landmarks',
    target: 3,
    xpReward: 55,
    repReward: 8,
    seasonPoints: 12,
    rugPoints: 15,
    difficulty: 'medium',
  },
  {
    id: 'daily_enter_interior',
    periodType: 'daily',
    title: 'Step Inside',
    description: 'Enter any available interior.',
    objectiveType: 'enter_interior',
    target: 1,
    xpReward: 45,
    repReward: 5,
    seasonPoints: 10,
    rugPoints: 12,
    difficulty: 'easy',
  },
  {
    id: 'daily_meet_player',
    periodType: 'daily',
    title: 'City Hello',
    description: 'Interact with one unique real player.',
    objectiveType: 'meet_player',
    target: 1,
    xpReward: 50,
    repReward: 5,
    seasonPoints: 12,
    rugPoints: 15,
    difficulty: 'medium',
  },
  {
    id: 'daily_wave',
    periodType: 'daily',
    title: 'Friendly Wave',
    description: 'Wave at a real player.',
    objectiveType: 'wave_player',
    target: 1,
    xpReward: 30,
    repReward: 2,
    seasonPoints: 6,
    rugPoints: 8,
    difficulty: 'easy',
  },
  {
    id: 'daily_city_event',
    periodType: 'daily',
    title: 'Event Curious',
    description: 'Join one city event.',
    objectiveType: 'join_event',
    target: 1,
    xpReward: 50,
    repReward: 5,
    seasonPoints: 12,
    rugPoints: 15,
    difficulty: 'medium',
  },
];

export const WEEKLY_MISSION_CATALOG: PeriodMissionDef[] = [
  {
    id: 'weekly_ten_missions',
    periodType: 'weekly',
    title: 'Mission Week',
    description: 'Complete 10 missions this week.',
    objectiveType: 'complete_missions',
    target: 10,
    xpReward: 150,
    repReward: 25,
    seasonPoints: 50,
    rugPoints: 60,
    difficulty: 'hard',
  },
  {
    id: 'weekly_five_players',
    periodType: 'weekly',
    title: 'Social Circuit',
    description: 'Meet 5 unique real players.',
    objectiveType: 'meet_players',
    target: 5,
    xpReward: 140,
    repReward: 20,
    seasonPoints: 45,
    rugPoints: 55,
    difficulty: 'hard',
  },
  {
    id: 'weekly_all_districts',
    periodType: 'weekly',
    title: 'Full Tour',
    description: 'Visit all five districts.',
    objectiveType: 'visit_districts',
    target: 5,
    xpReward: 160,
    repReward: 25,
    seasonPoints: 55,
    rugPoints: 65,
    difficulty: 'hard',
  },
  {
    id: 'weekly_three_events',
    periodType: 'weekly',
    title: 'Event Regular',
    description: 'Join 3 city events.',
    objectiveType: 'join_events',
    target: 3,
    xpReward: 130,
    repReward: 20,
    seasonPoints: 40,
    rugPoints: 50,
    difficulty: 'medium',
  },
  {
    id: 'weekly_five_interiors',
    periodType: 'weekly',
    title: 'Door Opener',
    description: 'Enter 5 different interiors.',
    objectiveType: 'enter_interiors',
    target: 5,
    xpReward: 140,
    repReward: 20,
    seasonPoints: 45,
    rugPoints: 55,
    difficulty: 'medium',
  },
];

export function getMissionDef(id: string): PeriodMissionDef | undefined {
  return [...DAILY_MISSION_CATALOG, ...WEEKLY_MISSION_CATALOG].find((m) => m.id === id);
}

/** Deterministic local fallback assignment (UTC period). */
export function utcDailyKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function utcWeeklyKey(d = new Date()): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hashPick(seed: string, catalog: PeriodMissionDef[], count: number): PeriodMissionDef[] {
  const scored = catalog.map((m) => ({
    m,
    score: Array.from(seed + m.id).reduce((a, c) => a + c.charCodeAt(0), 0),
  }));
  scored.sort((a, b) => a.score - b.score || a.m.id.localeCompare(b.m.id));
  return scored.slice(0, count).map((s) => s.m);
}

export function pickLocalDaily(playerId: string, periodKey = utcDailyKey()): PeriodMissionDef[] {
  return hashPick(`${playerId}:${periodKey}:daily`, DAILY_MISSION_CATALOG, 4);
}

export function pickLocalWeekly(playerId: string, periodKey = utcWeeklyKey()): PeriodMissionDef[] {
  return hashPick(`${playerId}:${periodKey}:weekly`, WEEKLY_MISSION_CATALOG, 3);
}
