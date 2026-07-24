/**
 * WorldEventCentrePanel — Phase 10L event list (server-backed).
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export interface WorldEventCentrePanelProps {
  open: boolean;
  isGuest: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

interface EventRow {
  id: string;
  definition_id?: string;
  status?: string;
  starts_at?: string;
  ends_at?: string;
}

export function WorldEventCentrePanel({ open, isGuest, onClose, onToast }: WorldEventCentrePanelProps) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !isSupabaseConfigured || !supabase || isGuest) return;
    void (async () => {
      const { data } = await supabase.rpc('get_active_world_events');
      const rows = Array.isArray(data) ? data : [];
      setEvents(rows as EventRow[]);
    })();
  }, [open, isGuest]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>⏱</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">World Events</span>
            <span className="modal-header__sub">TEST events stay draft until activated</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body reward-centre__body">
          {isGuest ? (
            <p className="reward-centre__alert">Sign in to register for world events.</p>
          ) : (
            <ul className="reward-mission-list">
              {events.length === 0 && (
                <li className="profile-empty">No active events. Activate TEST definitions via operator tools.</li>
              )}
              {events.map((ev) => (
                <li key={ev.id}>
                  <div className="reward-mission-list__main">
                    <strong>{ev.definition_id ?? 'Event'}</strong>
                    <span className="reward-centre__meta">{ev.status}</span>
                  </div>
                  <button
                    type="button"
                    className="profile-action-btn profile-action-btn--primary"
                    disabled={busy}
                    onClick={async () => {
                      if (!supabase) return;
                      setBusy(true);
                      const { error } = await supabase.rpc('register_for_world_event', { p_instance: ev.id });
                      onToast?.(error ? error.message : 'Registered');
                      setBusy(false);
                    }}
                  >
                    Register
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
