/**
 * SeasonPassPanel.tsx — Phase 10I season-pass UI.
 * Premium disabled by default. No purchase prompts. TEST badge when applicable.
 */

import { useEffect, useState } from 'react';
import { achievementService } from '../../game/achievements';
import { POINT_RELATIONSHIP_DOC } from '../../game/achievements/types';
import { rewardService } from '../../game/rewards';

export interface SeasonPassPanelProps {
  open: boolean;
  onClose: () => void;
  isGuest: boolean;
  onToast?: (text: string) => void;
}

export function SeasonPassPanel({ open, onClose, isGuest, onToast }: SeasonPassPanelProps) {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const unsub = achievementService.subscribe(() => setTick((t) => t + 1));
    void achievementService.refreshSeasonPass();
    return unsub;
  }, [open]);

  if (!open) return null;
  void tick;

  const pass = achievementService.getSeasonPass();
  const tiers = achievementService.getSeasonTiers();
  const player = achievementService.getPlayerPass();

  const claim = async (rewardId: string) => {
    setBusy(true);
    const res = await achievementService.claimSeasonPassReward(rewardId);
    setBusy(false);
    onToast?.(res.message);
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Season Pass">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>▣</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">
              {pass?.name ?? 'Season Pass'}
              {pass?.isTest && <span className="reward-test-badge">TEST</span>}
            </span>
            <span className="modal-header__sub">
              {pass ? `${pass.status} · ends ${new Date(pass.endsAt).toLocaleDateString()}` : 'No active pass'}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          <p className="reward-centre__disclaimer">
            Season-pass points are separate from season leaderboard points, XP, REP, and Rug Points.
            Premium is {pass?.premiumEnabled ? 'enabled for entitled players' : 'disabled'}.
            TEST rewards have no monetary value.
          </p>

          {!pass && <p className="profile-empty">No season pass is scheduled or active.</p>}

          {pass && (
            <>
              <div className="reward-centre__stats">
                <div>
                  <em>Pass points</em>
                  <strong>{player?.seasonPassPoints ?? 0}</strong>
                </div>
                <div>
                  <em>Current tier</em>
                  <strong>{player?.currentTier ?? 0} / {pass.maxTier}</strong>
                </div>
              </div>

              {isGuest && (
                <p className="reward-centre__alert">Sign in to earn and claim season-pass rewards.</p>
              )}

              {!pass.premiumEnabled && (
                <p className="reward-centre__meta">Premium track is disabled. Free track only.</p>
              )}

              <ul className="reward-mission-list">
                {tiers.map((t) => {
                  const reached = (player?.currentTier ?? 0) >= t.tierNumber;
                  const free = t.freeReward;
                  const claimed = free ? achievementService.isRewardClaimed(free.id) : false;
                  return (
                    <li key={t.id}>
                      <div className="reward-mission-list__main">
                        <strong>Tier {t.tierNumber}{t.name ? ` · ${t.name}` : ''}</strong>
                        <span>{t.pointsRequired} points required · {reached ? 'reached' : 'locked'}</span>
                        {free && (
                          <span className="reward-mission-list__rewards">
                            Free: {free.quantity} {free.type}
                            {claimed ? ' · claimed' : ''}
                          </span>
                        )}
                        {pass.premiumEnabled && t.premiumReward && (
                          <span className="reward-centre__meta">
                            Premium: {t.premiumReward.quantity} {t.premiumReward.type}
                            {player?.premiumEntitled ? '' : ' · locked (entitlement required)'}
                          </span>
                        )}
                      </div>
                      {!isGuest && free && reached && !claimed && free.claimMode !== 'disabled' && pass.status !== 'finalized' && (
                        <button
                          type="button"
                          className="profile-action-btn profile-action-btn--primary"
                          disabled={busy}
                          onClick={() => claim(free.id)}
                        >
                          Claim
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <h3 className="profile-section-title">Point relationship</h3>
              <ul className="reward-rules">
                <li>XP — {POINT_RELATIONSHIP_DOC.xp}</li>
                <li>REP — {POINT_RELATIONSHIP_DOC.rep}</li>
                <li>Rug Points — {POINT_RELATIONSHIP_DOC.rugPoints}</li>
                <li>Season points — {POINT_RELATIONSHIP_DOC.seasonPoints}</li>
                <li>Season-pass points — {POINT_RELATIONSHIP_DOC.seasonPassPoints}</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
