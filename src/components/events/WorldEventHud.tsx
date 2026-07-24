/**
 * Compact event HUD — shows active registration/active events only.
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export interface WorldEventHudProps {
  isGuest: boolean;
  onOpenCentre: () => void;
}

interface EventRow {
  id: string;
  definition_id?: string;
  status?: string;
  ends_at?: string;
}

export function WorldEventHud({ isGuest, onOpenCentre }: WorldEventHudProps) {
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isGuest) return;
    const client = supabase;
    let cancelled = false;
    const tick = async () => {
      const { data } = await client.rpc('get_active_world_events');
      if (cancelled) return;
      const rows = Array.isArray(data) ? (data as EventRow[]) : [];
      setEvents(rows.slice(0, 1));
    };
    void tick();
    const id = window.setInterval(() => void tick(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isGuest]);

  if (isGuest || events.length === 0) return null;
  const ev = events[0];
  const remaining = ev.ends_at
    ? Math.max(0, Math.floor((new Date(ev.ends_at).getTime() - Date.now()) / 1000))
    : null;

  return (
    <button type="button" className="world-event-hud" onClick={onOpenCentre} title="Open World Events">
      <span className="world-event-hud__badge">TEST</span>
      <span className="world-event-hud__name">{ev.definition_id ?? 'Event'}</span>
      <span className="world-event-hud__meta">{ev.status}{remaining != null ? ` · ${remaining}s` : ''}</span>
    </button>
  );
}
