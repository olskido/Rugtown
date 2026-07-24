/**
 * Unified event presentation — server events are authoritative for rewards;
 * Living City ambience remains visual-only.
 */

export type EventAuthority = 'server' | 'ambience';

export interface PresentedWorldEvent {
  authority: EventAuthority;
  id: string;
  name: string;
  status: string;
  isTest: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  definitionId?: string;
}

export function presentServerEvent(row: Record<string, unknown>): PresentedWorldEvent {
  return {
    authority: 'server',
    id: String(row.id ?? ''),
    name: String(row.definition_id ?? row.name ?? 'Event'),
    status: String(row.status ?? 'unknown'),
    isTest: true,
    startsAt: row.starts_at ? String(row.starts_at) : null,
    endsAt: row.ends_at ? String(row.ends_at) : null,
    definitionId: row.definition_id ? String(row.definition_id) : undefined,
  };
}

export function remainingSeconds(endsAt: string | null | undefined, nowMs = Date.now()): number | null {
  if (!endsAt) return null;
  const t = new Date(endsAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - nowMs) / 1000));
}

/** Living City events never grant rewards — presentation helper only. */
export function presentAmbienceEvent(title: string, description: string): PresentedWorldEvent {
  return {
    authority: 'ambience',
    id: `ambience:${title}`,
    name: title,
    status: 'ambience',
    isTest: false,
  };
}

void presentAmbienceEvent;
