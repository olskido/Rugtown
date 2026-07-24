/**
 * TournamentCentrePanel — discovery + standings (Phase 10N).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export interface TournamentCentrePanelProps {
  open: boolean;
  isGuest: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

interface OpenTournament {
  instanceId: string;
  definitionId?: string;
  name?: string;
  status?: string;
  isTest?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export function TournamentCentrePanel({ open, isGuest, onClose, onToast }: TournamentCentrePanelProps) {
  const [list, setList] = useState<OpenTournament[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [standings, setStandings] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) return;
    const { data, error } = await supabase.rpc('get_open_tournaments');
    if (error) {
      onToast?.(error.message);
      setList([]);
      return;
    }
    const rows = Array.isArray(data) ? (data as OpenTournament[]) : [];
    setList(rows);
    if (!selected && rows[0]?.instanceId) setSelected(rows[0].instanceId);
  }, [onToast, selected]);

  useEffect(() => {
    if (!open || isGuest) return;
    void refresh();
  }, [open, isGuest, refresh]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>🏆</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Tournament Hall</span>
            <span className="modal-header__sub">Leaderboard tournaments · no combat · no paid entry</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body reward-centre__body">
          {isGuest ? (
            <p className="reward-centre__alert">Sign in to browse and register for tournaments.</p>
          ) : (
            <>
              <ul className="reward-mission-list">
                {list.length === 0 && (
                  <li className="profile-empty">No open tournaments. Operators must open registration on a draft instance.</li>
                )}
                {list.map((t) => (
                  <li key={t.instanceId}>
                    <div className="reward-mission-list__main">
                      <strong>{t.name ?? t.definitionId ?? 'Tournament'}</strong>
                      <span className="reward-centre__meta">
                        {t.isTest ? 'TEST · ' : ''}{t.status}
                        {t.startsAt ? ` · starts ${new Date(t.startsAt).toLocaleString()}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`profile-action-btn${selected === t.instanceId ? ' profile-action-btn--followed' : ''}`}
                      onClick={() => setSelected(t.instanceId)}
                    >
                      Select
                    </button>
                  </li>
                ))}
              </ul>
              {selected && (
                <div className="dm-panel__composer">
                  <button
                    type="button"
                    className="profile-action-btn profile-action-btn--primary"
                    disabled={busy}
                    onClick={async () => {
                      if (!supabase) return;
                      setBusy(true);
                      const { error } = await supabase.rpc('register_for_tournament', { p_instance: selected });
                      onToast?.(error ? error.message : 'Registered');
                      setBusy(false);
                    }}
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    className="profile-action-btn"
                    disabled={busy}
                    onClick={async () => {
                      if (!supabase) return;
                      setBusy(true);
                      const { data, error } = await supabase.rpc('get_tournament_standings', { p_instance: selected });
                      if (error) onToast?.(error.message);
                      else setStandings(((data as { standings?: Record<string, unknown>[] })?.standings) ?? []);
                      setBusy(false);
                    }}
                  >
                    Standings
                  </button>
                </div>
              )}
              <ul className="reward-mission-list">
                {standings.map((s, i) => (
                  <li key={i}>
                    <strong>#{String(s.rank ?? '?')}</strong>{' '}
                    {String(s.player_id ?? '').slice(0, 8)} · {String(s.score ?? 0)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
