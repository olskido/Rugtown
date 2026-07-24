import { getEnterableBuilding, getEnterableBuildingByWorldObjectId } from '../world/EnterableBuildings';
import { CHAPTER_ONE_MISSIONS } from '../missions/ChapterOneMissions';

export type MissionObjectiveType = 'enter_building' | 'talk_town_crier' | 'visit_landmark';

export interface MissionDefinition {
  id: string;
  title: string;
  description: string;
  chapterTitle: string;
  objectiveType: MissionObjectiveType;
  targetId?: string;
  objectiveHint?: string;
  rewardXp: number;
  /** REP granted when this mission is completed. */
  rewardRep: number;
  /** The next linear Chapter One mission, or null for the finale. */
  unlocksNext: string | null;
}

export interface MissionProgress {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  chapterTitle: string;
  objectiveHint?: string;
  rewardXp: number;
  rewardRep: number;
}

export class MissionSystem {
  private readonly definitions: MissionDefinition[];
  private readonly completed = new Set<string>();

  constructor(definitions: MissionDefinition[] = CHAPTER_ONE_MISSIONS) {
    this.definitions = definitions;
  }

  getMissions(): MissionProgress[] {
    return this.definitions.map(def => ({
      id: def.id,
      title: def.title,
      description: def.description,
      completed: this.completed.has(def.id),
      chapterTitle: def.chapterTitle,
      objectiveHint: def.objectiveHint,
      rewardXp: def.rewardXp,
      rewardRep: def.rewardRep,
    }));
  }

  /** Rehydrate completed missions from a saved list (localStorage). */
  restoreCompleted(ids: string[]): void {
    // Old starter IDs are intentionally discarded. Only this chapter's known
    // IDs are restored, preserving sequential unlock semantics after migration.
    const knownIds = new Set(this.definitions.map(def => def.id));
    this.completed.clear();
    for (const id of ids) if (knownIds.has(id)) this.completed.add(id);
  }

  /** Ids of every completed mission — for persistence. */
  getCompletedIds(): string[] {
    return this.definitions.filter(def => this.completed.has(def.id)).map(def => def.id);
  }

  /** The next incomplete mission (the one the HUD tracks), or null if all done. */
  getActiveMission(): MissionProgress | null {
    const def = this.definitions.find(d => !this.completed.has(d.id));
    if (!def) return null;
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      completed: false,
      chapterTitle: def.chapterTitle,
      objectiveHint: def.objectiveHint,
      rewardXp: def.rewardXp,
      rewardRep: def.rewardRep,
    };
  }

  getActiveMissionId(): string | null {
    return this.getActiveMission()?.id ?? null;
  }

  markBuildingEntered(buildingId: string): boolean {
    const active = this.getActiveDefinition();
    return !!active && active.objectiveType === 'enter_building' && active.targetId === buildingId
      && this.complete(active.id);
  }

  markZoneVisited(zoneId: string): boolean {
    const active = this.getActiveDefinition();
    if (!active) return false;
    if (active.objectiveType === 'visit_landmark' && active.targetId === zoneId) {
      return this.complete(active.id);
    }
    const building = getEnterableBuildingByWorldObjectId(zoneId);
    return building ? this.markBuildingEntered(building.id) : false;
  }

  markTownCrierTalked(): boolean {
    const active = this.getActiveDefinition();
    return !!active && active.objectiveType === 'talk_town_crier' && this.complete(active.id);
  }

  getHighlightedZoneId(): string | null {
    const next = this.getActiveDefinition();
    if (!next) return null;
    if (next.objectiveType === 'talk_town_crier') return null;
    if (!next.targetId) return null;
    const buildingId = next.objectiveType === 'enter_building'
      ? next.targetId
      : null;
    return buildingId
      ? (getEnterableBuilding(buildingId)?.worldObjectId ?? null)
      : next.targetId;
  }

  isComplete(): boolean {
    return this.completed.size >= this.definitions.length;
  }

  private complete(id: string): boolean {
    if (this.completed.has(id)) return false;
    if (this.getActiveDefinition()?.id !== id) return false;
    this.completed.add(id);
    return true;
  }

  private getActiveDefinition(): MissionDefinition | undefined {
    return this.definitions.find(def => !this.completed.has(def.id));
  }
}

export function createStarterMissionSystem(): MissionSystem {
  return new MissionSystem(CHAPTER_ONE_MISSIONS);
}
