/**
 * TitleLockerPanel.tsx — Phase 10I title collection + equip UI.
 * Only server-unlocked titles can be equipped. No arbitrary title text.
 */

import { useEffect, useState } from 'react';
import { achievementService } from '../../game/achievements';
import { rewardService } from '../../game/rewards';

export interface TitleLockerPanelProps {
  open: boolean;
  onClose: () => void;
  isGuest: boolean;
  onToast?: (text: string) => void;
}

export function TitleLockerPanel({ open, onClose, isGuest, onToast }: TitleLockerPanelProps) {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const unsub = achievementService.subscribe(() => setTick((t) => t + 1));
    if (rewardService.isServerAuthoritative()) void achievementService.refreshTitles();
    return unsub;
  }, [open]);

  if (!open) return null;
  void tick;

  const titles = achievementService.getTitles().filter((t) => !t.revokedAt);

  const equip = async (titleId: string) => {
    setBusy(true);
    const res = await achievementService.equipTitle(titleId);
    setBusy(false);
    onToast?.(res.message);
  };

  const unequip = async () => {
    setBusy(true);
    const res = await achievementService.unequipTitle();
    setBusy(false);
    onToast?.(res.message);
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Title Locker">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>◆</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Title Locker</span>
            <span className="modal-header__sub">Cosmetic only · does not affect XP or REP</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body reward-centre__body">
          {isGuest && (
            <p className="reward-centre__alert">Title equipping requires an authenticated account with server titles.</p>
          )}
          <ul className="reward-mission-list">
            {titles.map((t) => (
              <li key={t.id}>
                <div className="reward-mission-list__main">
                  <strong>{t.name}{t.isEquipped ? ' · equipped' : ''}</strong>
                  <span>{t.description}</span>
                  <span className="reward-mission-list__progress">{t.rarity} · {t.sourceType}</span>
                </div>
                {!isGuest && (
                  t.isEquipped ? (
                    <button type="button" className="profile-action-btn" disabled={busy} onClick={unequip}>Unequip</button>
                  ) : (
                    <button type="button" className="profile-action-btn profile-action-btn--primary" disabled={busy} onClick={() => equip(t.titleId)}>
                      Equip
                    </button>
                  )
                )}
              </li>
            ))}
            {titles.length === 0 && <li className="profile-empty">No titles unlocked yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
