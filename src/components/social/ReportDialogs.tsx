/**
 * ReportPlayerDialog / ReportMessageDialog — Phase 10J reporting UI.
 */

import { useState } from 'react';
import { REPORT_CATEGORIES, socialService, type ReportCategory } from '../../lib/social/index';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

export function ReportPlayerDialog({
  open,
  playerId,
  username,
  onClose,
  onToast,
}: BaseProps & { playerId: string; username: string }) {
  const [category, setCategory] = useState<ReportCategory>('spam');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>⚑</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Report player</span>
            <span className="modal-header__sub">{username}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="reward-centre__meta">
            Reports are reviewed by moderators. The reported player will not see your identity.
          </p>
          <label className="settings-panel__row">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <textarea
            className="dm-panel__input"
            rows={3}
            maxLength={500}
            placeholder="Optional details"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="player-profile-actions">
            <button
              type="button"
              className="profile-action-btn profile-action-btn--primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await socialService.reportPlayer(playerId, category, description || undefined);
                onToast?.(res.message ?? '');
                setBusy(false);
                if (res.ok) onClose();
              }}
            >
              Submit report
            </button>
            <button type="button" className="profile-action-btn profile-action-btn--close" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportMessageDialog({
  open,
  messageId,
  onClose,
  onToast,
}: BaseProps & { messageId: string }) {
  const [category, setCategory] = useState<ReportCategory>('spam');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>⚑</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Report message</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label className="settings-panel__row">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <textarea
            className="dm-panel__input"
            rows={3}
            maxLength={500}
            placeholder="Optional details"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="player-profile-actions">
            <button
              type="button"
              className="profile-action-btn profile-action-btn--primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await socialService.reportMessage(messageId, category, description || undefined);
                onToast?.(res.message ?? '');
                setBusy(false);
                if (res.ok) onClose();
              }}
            >
              Submit report
            </button>
            <button type="button" className="profile-action-btn profile-action-btn--close" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
