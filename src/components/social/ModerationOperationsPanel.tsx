/**
 * ModerationOperationsPanel — Phase 10J operator console.
 * Authorization is enforced server-side via social_operators / RPCs.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  socialService,
  type ModerationCaseRow,
  type ModerationDashboard,
} from '../../lib/social/index';

export interface ModerationOperationsPanelProps {
  open: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

export function ModerationOperationsPanel({
  open,
  onClose,
  onToast,
}: ModerationOperationsPanelProps) {
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ModerationDashboard | null>(null);
  const [cases, setCases] = useState<ModerationCaseRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    setDashboard(await socialService.getModerationDashboard());
    setCases(await socialService.listOpenCases());
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      const op = await socialService.isSocialOperator();
      if (!active) return;
      setAuthorized(op.operator);
      setRole(op.role);
      if (op.operator) await refresh();
    })();
    return () => { active = false; };
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Moderation">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>🛡</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Moderation Operations</span>
            <span className="modal-header__sub">{authorized ? `Operator · ${role}` : 'Restricted'}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          {!authorized ? (
            <p className="reward-centre__alert">
              Restricted to social operators. Access is enforced server-side.
            </p>
          ) : (
            <>
              {dashboard && (
                <div className="reward-centre__stats">
                  <div><em>Open cases</em><strong>{dashboard.openCases ?? 0}</strong></div>
                  <div><em>Open reports</em><strong>{dashboard.openReports ?? 0}</strong></div>
                  <div><em>Held msgs</em><strong>{dashboard.heldMessages ?? 0}</strong></div>
                  <div><em>Msgs today</em><strong>{dashboard.messagesToday ?? 0}</strong></div>
                </div>
              )}

              <h3 className="profile-section-title">Open cases</h3>
              <ul className="reward-mission-list">
                {cases.length === 0 && <li className="profile-empty">No open cases.</li>}
                {cases.map((c) => (
                  <li key={c.id}>
                    <div className="reward-mission-list__main">
                      <strong>{c.category} · {c.priority}</strong>
                      <span className="reward-centre__meta">{c.status} · {c.subjectPlayerId}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <h3 className="profile-section-title">Apply restriction</h3>
              <input
                className="dm-panel__input"
                placeholder="Target player UUID"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
              <input
                className="dm-panel__input"
                placeholder="Safe reason (shown to player)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="reward-op-actions">
                <button
                  type="button"
                  className="profile-action-btn"
                  disabled={busy || !targetId || reason.trim().length < 3}
                  onClick={async () => {
                    setBusy(true);
                    const res = await socialService.applyModerationAction({
                      target: targetId.trim(),
                      actionType: 'warning',
                      reasonCode: 'manual_warning',
                      reasonSafe: reason.trim(),
                    });
                    onToast?.(res.message ?? '');
                    setBusy(false);
                    await refresh();
                  }}
                >
                  Warn
                </button>
                <button
                  type="button"
                  className="profile-action-btn"
                  disabled={busy || !targetId || reason.trim().length < 3}
                  onClick={async () => {
                    setBusy(true);
                    const res = await socialService.applyModerationAction({
                      target: targetId.trim(),
                      actionType: 'direct_message_restriction',
                      reasonCode: 'temp_dm_mute',
                      reasonSafe: reason.trim(),
                      durationHours: 24,
                    });
                    onToast?.(res.message ?? '');
                    setBusy(false);
                    await refresh();
                  }}
                >
                  24h DM restrict
                </button>
                <button
                  type="button"
                  className="profile-action-btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const res = await socialService.runMaintenance();
                    onToast?.(res.message ?? '');
                    setBusy(false);
                    await refresh();
                  }}
                >
                  Run maintenance
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
