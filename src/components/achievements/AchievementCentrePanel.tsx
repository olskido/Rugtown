/**
 * AchievementCentrePanel.tsx — Phase 10I player-facing achievement UI.
 * Server decides unlocks. Secret conditions are never revealed.
 */

import { useEffect, useMemo, useState } from 'react';
import { achievementService } from '../../game/achievements';
import type { AchievementCatalogItem, AchievementCategory, AchievementRarity } from '../../game/achievements';
import { rewardService } from '../../game/rewards';

export interface AchievementCentrePanelProps {
  open: boolean;
  onClose: () => void;
  isGuest: boolean;
  onToast?: (text: string) => void;
  onOpenTitles?: () => void;
  onOpenSeasonPass?: () => void;
}

const CATEGORIES: Array<AchievementCategory | 'all'> = [
  'all', 'exploration', 'missions', 'progression', 'social', 'events', 'seasons', 'collectibles', 'consistency',
];

export function AchievementCentrePanel({
  open, onClose, isGuest, onToast, onOpenTitles, onOpenSeasonPass,
}: AchievementCentrePanelProps) {
  const [tick, setTick] = useState(0);
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all');
  const [rarity, setRarity] = useState<AchievementRarity | 'all'>('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const unsub = achievementService.subscribe(() => setTick((t) => t + 1));
    if (rewardService.isServerAuthoritative()) {
      void achievementService.refreshCatalog();
      void achievementService.refreshProgress();
      void achievementService.refreshUnlocks();
    }
    return unsub;
  }, [open]);

  const catalog = achievementService.getCatalog();
  const progress = achievementService.getProgress();
  const unlocks = new Set(achievementService.getUnlocks().map((u) => u.achievementId));
  const progressMap = new Map(progress.map((p) => [p.achievementId, p]));
  const mode = rewardService.getAuthorityMode();
  const pct = achievementService.completionPercent();

  const filtered = useMemo(() => {
    return catalog.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (rarity !== 'all' && a.rarity !== rarity) return false;
      return true;
    });
  }, [catalog, category, rarity, tick]);

  if (!open) return null;

  const refresh = async () => {
    setBusy(true);
    const res = await achievementService.requestEvaluation('full');
    setBusy(false);
    onToast?.(res.message);
  };

  const renderItem = (a: AchievementCatalogItem) => {
    const unlocked = unlocks.has(a.id);
    const prog = progressMap.get(a.id);
    const current = unlocked ? a.target : (prog?.currentValue ?? 0);
    return (
      <li key={a.id} className={unlocked ? 'ach-item ach-item--unlocked' : 'ach-item'}>
        <div className="reward-mission-list__main">
          <strong>{a.name}</strong>
          <span>{a.description}</span>
          <span className="reward-mission-list__progress">
            {a.rarity} · {a.category} · {current}/{a.target}
            {unlocked ? ' · unlocked' : prog?.status === 'under_review' ? ' · under review' : ''}
          </span>
          <span className="reward-mission-list__rewards">
            +{a.rewardXp} XP · +{a.rewardRep} REP
            {a.titleUnlockId ? ` · title` : ''}
          </span>
          <div className="ach-progress-bar" aria-hidden>
            <div style={{ width: `${Math.min(100, Math.round((current / Math.max(1, a.target)) * 100))}%` }} />
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Achievement Centre">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>★</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Achievement Centre</span>
            <span className="modal-header__sub">
              {isGuest ? 'Guest preview · local only' : `Authority: ${mode} · ${pct}% complete`}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          {isGuest && (
            <p className="reward-centre__alert">
              Guests can preview achievements. Server unlocks, titles, and season-pass rewards require an account.
            </p>
          )}
          {mode === 'migration_required' || mode === 'server_unavailable' ? (
            <p className="reward-centre__alert">
              Achievement evaluation is unavailable until server authority is restored.
            </p>
          ) : null}

          <div className="ach-filters">
            <select value={category} onChange={(e) => setCategory(e.target.value as AchievementCategory | 'all')} aria-label="Category">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={rarity} onChange={(e) => setRarity(e.target.value as AchievementRarity | 'all')} aria-label="Rarity">
              {['all', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {!isGuest && (
              <button type="button" className="profile-action-btn" disabled={busy} onClick={refresh}>
                {busy ? 'Evaluating…' : 'Refresh / evaluate'}
              </button>
            )}
          </div>

          <ul className="reward-mission-list">
            {filtered.map(renderItem)}
            {filtered.length === 0 && <li className="profile-empty">No achievements in this filter.</li>}
          </ul>

          <p className="reward-centre__meta">Secret achievements stay hidden until unlocked.</p>

          <div className="reward-op-actions">
            {onOpenTitles && (
              <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={onOpenTitles}>
                Title Locker
              </button>
            )}
            {onOpenSeasonPass && (
              <button type="button" className="profile-action-btn" onClick={onOpenSeasonPass}>
                Season Pass
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
