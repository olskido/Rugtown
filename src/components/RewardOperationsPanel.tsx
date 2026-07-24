/**
 * RewardOperationsPanel.tsx — Phase 10H protected operator console.
 *
 * Only renders for server-validated operators (reward_operators row). All values
 * are validated server-side; this UI only invokes authorized RPCs / Edge Functions.
 * There is NO client `isAdmin` boolean gate — authorization is enforced by the
 * database and Edge Functions regardless of what the client renders.
 */

import { useCallback, useEffect, useState } from 'react';
import { rewardService } from '../game/rewards';
import { supabase } from '../lib/supabase';

export interface RewardOperationsPanelProps {
  open: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

interface PendingClaim {
  id: string;
  player_id: string;
  reward_asset: string;
  amount: string;
  claim_state: string;
  review_status: string | null;
  risk_score: number | null;
}

interface OpsDashboard {
  pendingEvaluations?: number;
  failedEvaluations?: number;
  openAlerts?: number;
  activeSeasonPass?: string | null;
  achievementUnlocksToday?: number;
  passPlayers?: number;
}

interface Phase10LOps {
  activeWorldEvents?: number;
  openWorldEventAlerts?: number;
  activeTournaments?: number;
  openTournamentDisputes?: number;
  activeGuilds?: number;
  openGuildReports?: number;
}

export function RewardOperationsPanel({ open, onClose, onToast }: RewardOperationsPanelProps) {
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [dashboard, setDashboard] = useState<OpsDashboard | null>(null);
  const [phase10l, setPhase10l] = useState<Phase10LOps | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await rewardService.listPendingClaims();
    setClaims(list as unknown as PendingClaim[]);
    if (supabase) {
      const { data } = await supabase.rpc('get_progression_ops_dashboard');
      if (data) setDashboard(data as OpsDashboard);
      const { data: l10 } = await supabase.rpc('get_phase10l_ops_dashboard');
      if (l10) setPhase10l(l10 as Phase10LOps);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      const op = await rewardService.isOperator();
      if (!active) return;
      setAuthorized(op.operator);
      setRole(op.role);
      if (op.operator) await refresh();
    })();
    return () => {
      active = false;
    };
  }, [open, refresh]);

  if (!open) return null;

  const act = async (id: string, action: 'approve' | 'reject' | 'hold' | 'release') => {
    setBusy(true);
    const res = await rewardService.reviewClaim(id, action);
    setBusy(false);
    onToast?.(res.message);
    await refresh();
  };

  const prepare = async (id: string) => {
    setBusy(true);
    const res = await rewardService.prepareSettlement(id);
    setBusy(false);
    onToast?.(res.message);
    await refresh();
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Reward Operations">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>⚙</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Reward Operations</span>
            <span className="modal-header__sub">{authorized ? `Operator · ${role}` : 'Restricted'}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          {!authorized ? (
            <p className="reward-centre__alert">
              This console is restricted to authorized reward operators. Access is enforced
              server-side; your account has no operator role.
            </p>
          ) : (
            <>
              <p className="reward-centre__meta">
                All values are validated server-side. Real-value approvals enter the manual
                settlement flow — no automatic transfers occur.
              </p>

              {dashboard && (
                <>
                  <h3 className="profile-section-title">Progression health</h3>
                  <div className="reward-centre__stats">
                    <div><em>Pending evals</em><strong>{dashboard.pendingEvaluations ?? 0}</strong></div>
                    <div><em>Failed evals</em><strong>{dashboard.failedEvaluations ?? 0}</strong></div>
                    <div><em>Open alerts</em><strong>{dashboard.openAlerts ?? 0}</strong></div>
                    <div><em>Unlocks today</em><strong>{dashboard.achievementUnlocksToday ?? 0}</strong></div>
                  </div>
                  <p className="reward-centre__meta">
                    Season pass: {dashboard.activeSeasonPass ?? 'none'} · Pass players: {dashboard.passPlayers ?? 0}
                  </p>
                  <button
                    type="button"
                    className="profile-action-btn"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      if (supabase) {
                        const { error } = await supabase.rpc('run_progression_maintenance');
                        onToast?.(error ? error.message : 'Progression maintenance ran');
                      }
                      setBusy(false);
                      await refresh();
                    }}
                  >
                    Run progression maintenance
                  </button>
                </>
              )}

              {phase10l && (
                <>
                  <h3 className="profile-section-title">Phase 10L · Characters / Events / Tournaments / Guilds</h3>
                  <div className="reward-centre__stats">
                    <div><em>Active events</em><strong>{phase10l.activeWorldEvents ?? 0}</strong></div>
                    <div><em>Event alerts</em><strong>{phase10l.openWorldEventAlerts ?? 0}</strong></div>
                    <div><em>Tournaments</em><strong>{phase10l.activeTournaments ?? 0}</strong></div>
                    <div><em>Disputes</em><strong>{phase10l.openTournamentDisputes ?? 0}</strong></div>
                    <div><em>Guilds</em><strong>{phase10l.activeGuilds ?? 0}</strong></div>
                    <div><em>Guild reports</em><strong>{phase10l.openGuildReports ?? 0}</strong></div>
                  </div>
                  <button
                    type="button"
                    className="profile-action-btn"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      if (supabase) {
                        const { error } = await supabase.rpc('run_phase10l_maintenance');
                        onToast?.(error ? error.message : 'Phase 10L maintenance ran');
                      }
                      setBusy(false);
                      await refresh();
                    }}
                  >
                    Run Phase 10L maintenance
                  </button>
                </>
              )}

              <h3 className="profile-section-title">Pending claims</h3>
              {claims.length === 0 && <p className="profile-empty">No pending claims.</p>}
              <ul className="reward-mission-list">
                {claims.map((c) => (
                  <li key={c.id}>
                    <div className="reward-mission-list__main">
                      <strong>{c.reward_asset} · {c.amount}</strong>
                      <span>state: {c.claim_state} · review: {c.review_status ?? 'none'}</span>
                      {c.risk_score != null && c.risk_score > 0 && (
                        <span className="reward-centre__meta">Risk score: {c.risk_score}</span>
                      )}
                    </div>
                    <div className="reward-op-actions">
                      <button type="button" className="profile-action-btn" disabled={busy} onClick={() => act(c.id, 'approve')}>Approve</button>
                      <button type="button" className="profile-action-btn" disabled={busy} onClick={() => act(c.id, 'reject')}>Reject</button>
                      <button type="button" className="profile-action-btn" disabled={busy} onClick={() => act(c.id, 'hold')}>Hold</button>
                      {c.claim_state === 'approved' && (
                        <button type="button" className="profile-action-btn profile-action-btn--primary" disabled={busy} onClick={() => prepare(c.id)}>
                          Prepare settlement
                        </button>
                      )}
                    </div>
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
