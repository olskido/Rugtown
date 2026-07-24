/**
 * RewardCentrePanel.tsx — Daily/Weekly missions, Rug Points, claims, season.
 */

import { useEffect, useState } from 'react';
import {
  rewardService,
  RUG_POINTS_DISCLAIMER,
  type MissionAssignmentView,
  type ClaimableReward,
} from '../game/rewards';
import { WalletVerificationSection } from './rewards/WalletVerificationSection';
import { NotificationsSection } from './rewards/NotificationsSection';

function authorityLabel(mode: string): { text: string; tone: 'ok' | 'warn' | 'info' } {
  switch (mode) {
    case 'server': return { text: 'Server connected', tone: 'ok' };
    case 'local': return { text: 'Local (guest)', tone: 'info' };
    case 'migration_required': return { text: 'Migration required', tone: 'warn' };
    case 'server_unavailable': return { text: 'Server unavailable', tone: 'warn' };
    default: return { text: 'Initialising', tone: 'info' };
  }
}

export interface RewardCentrePanelProps {
  open: boolean;
  onClose: () => void;
  isGuest: boolean;
  onToast?: (text: string) => void;
  onOpenOps?: () => void;
  onOpenAchievements?: () => void;
}

export function RewardCentrePanel({ open, onClose, isGuest, onToast, onOpenOps, onOpenAchievements }: RewardCentrePanelProps) {
  const [tick, setTick] = useState(0);
  const [, setBusy] = useState(false);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    if (!open) return;
    const unsub = rewardService.subscribe(() => setTick((t) => t + 1));
    // Refresh operational data when the panel opens (realtime keeps it live after).
    if (rewardService.isServerAuthoritative()) {
      void rewardService.refreshHealth();
      void rewardService.refreshNotifications();
      void rewardService.refreshWallets();
      void rewardService.refreshClaims();
      void rewardService.isOperator().then((op) => setIsOperator(op.operator));
    }
    return unsub;
  }, [open]);

  if (!open) return null;
  void tick;

  const mode = rewardService.getAuthorityMode();
  const daily = rewardService.getDailyMissions();
  const weekly = rewardService.getWeeklyMissions();
  const claims = rewardService.getClaims();
  const seasonId = rewardService.getSeasonId();
  const seasonPoints = rewardService.getSeasonPoints();
  const rugPoints = rewardService.getRugPoints();
  const health = rewardService.getHealth();
  const wallets = rewardService.getWallets();
  const notifications = rewardService.getNotifications();
  const unread = rewardService.getUnreadCount();
  const authority = authorityLabel(mode);
  const isTestSeason = !!seasonId && /test/i.test(seasonId);
  const settlementMode = health?.settlementMode ?? 'disabled';

  const claimMission = async (m: MissionAssignmentView) => {
    setBusy(true);
    const res = await rewardService.claimMission(m.id);
    setBusy(false);
    onToast?.(res.message);
  };

  const advance = async (c: ClaimableReward, next: ClaimableReward['status']) => {
    setBusy(true);
    const res = await rewardService.advanceClaim(c.id, next);
    setBusy(false);
    onToast?.(res.message);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      data-ui-block-camera
      role="dialog"
      aria-modal="true"
      aria-label="Reward Centre"
    >
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>◆</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Reward Centre</span>
            <span className="modal-header__sub">
              Authority: {mode}
              {isGuest ? ' · Guest (local)' : ''}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          <div className={`reward-authority reward-authority--${authority.tone}`}>
            <span className="reward-authority__dot" aria-hidden>●</span>
            <span className="reward-authority__text">Authority: {authority.text}</span>
            {!isGuest && (
              <span className="reward-authority__settlement">Settlement: {settlementMode}</span>
            )}
          </div>

          {mode === 'migration_required' && (
            <p className="reward-centre__alert">
              This account needs the Phase 10G/10H database migration applied before server rewards
              are available. Progression is paused — no local rewards are granted for accounts.
            </p>
          )}
          {mode === 'server_unavailable' && (
            <p className="reward-centre__alert">
              The reward server is temporarily unavailable. To protect your ledger, rewards are not
              granted locally for authenticated accounts. Reopen when connection is restored.
            </p>
          )}

          <p className="reward-centre__disclaimer">{RUG_POINTS_DISCLAIMER}</p>

          <div className="reward-centre__stats">
            <div><em>Rug Points</em><strong>{rugPoints}</strong></div>
            <div>
              <em>Season</em>
              <strong>
                {seasonId ? `${seasonPoints} pts` : 'None active'}
                {isTestSeason && <span className="reward-test-badge">TEST</span>}
              </strong>
            </div>
          </div>

          {!isGuest && rewardService.isServerAuthoritative() && (
            <>
              <NotificationsSection notifications={notifications} unreadCount={unread} onToast={onToast} />
              <WalletVerificationSection wallets={wallets} onToast={onToast} />
            </>
          )}

          <h3 className="profile-section-title">Daily Missions</h3>
          <p className="reward-centre__meta">Resets 00:00 UTC · Complete then claim</p>
          <ul className="reward-mission-list">
            {daily.map((m) => (
              <li key={m.id}>
                <div className="reward-mission-list__main">
                  <strong>{m.title}</strong>
                  <span>{m.description}</span>
                  <span className="reward-mission-list__progress">
                    {m.progress}/{m.target} · {m.status}
                  </span>
                  <span className="reward-mission-list__rewards">
                    +{m.xpReward} XP · +{m.repReward} REP · +{m.rugPoints} Rug Points
                    {seasonId ? ` · +${m.seasonPoints} Season` : ''}
                  </span>
                </div>
                {m.status === 'completed' && (
                  <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={() => claimMission(m)}>
                    Claim
                  </button>
                )}
              </li>
            ))}
            {daily.length === 0 && <li className="profile-empty">No daily missions assigned.</li>}
          </ul>

          <h3 className="profile-section-title">Weekly Missions</h3>
          <p className="reward-centre__meta">UTC week key · Broader objectives</p>
          <ul className="reward-mission-list">
            {weekly.map((m) => (
              <li key={m.id}>
                <div className="reward-mission-list__main">
                  <strong>{m.title}</strong>
                  <span>{m.description}</span>
                  <span className="reward-mission-list__progress">
                    {m.progress}/{m.target} · {m.status}
                  </span>
                </div>
                {m.status === 'completed' && (
                  <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={() => claimMission(m)}>
                    Claim
                  </button>
                )}
              </li>
            ))}
          </ul>

          <h3 className="profile-section-title">Eligible Claims</h3>
          {isGuest && (
            <p className="profile-guest-warn">
              Monetary and campaign claims require an authenticated account. Guest progress stays local.
            </p>
          )}
          <ul className="reward-mission-list">
            {claims.map((c) => (
              <li key={c.id}>
                <div className="reward-mission-list__main">
                  <strong>{c.rewardAsset} · {c.amount}</strong>
                  <span>{c.source} · {c.status}</span>
                  <span>Created {new Date(c.createdAt).toLocaleString()}</span>
                  {c.expiresAt && <span>Expires {new Date(c.expiresAt).toLocaleString()}</span>}
                  {c.transactionSignature && (
                    <a
                      className="reward-tx-link"
                      href={`https://explorer.solana.com/tx/${encodeURIComponent(c.transactionSignature)}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View transaction ↗
                    </a>
                  )}
                  {(c.rewardAsset === 'SOL' || c.rewardAsset === 'SPL') && (
                    <span className="reward-centre__meta">A submitted claim is not a completed payout until verified on-chain.</span>
                  )}
                </div>
                {c.status === 'eligible' && (
                  <button type="button" className="profile-action-btn" onClick={() => advance(c, 'reserved')}>
                    Reserve
                  </button>
                )}
                {c.status === 'reserved' && (
                  <button type="button" className="profile-action-btn" onClick={() => advance(c, 'processing')}>
                    Process
                  </button>
                )}
                {c.status === 'processing' && c.rewardAsset !== 'SOL' && c.rewardAsset !== 'SPL' && (
                  <button type="button" className="profile-action-btn" onClick={() => advance(c, 'completed')}>
                    Complete (dev)
                  </button>
                )}
              </li>
            ))}
            {claims.length === 0 && <li className="profile-empty">No claims yet.</li>}
          </ul>

          <h3 className="profile-section-title">Sponsored Campaigns</h3>
          <p className="profile-empty">
            No funded sponsored campaigns are active. Campaigns require a verified funding reference.
          </p>

          <h3 className="profile-section-title">Rules &amp; disclaimers</h3>
          <ul className="reward-rules">
            <li>Rug Points are not automatically SOL.</li>
            <li>In-game points do not guarantee cash value.</li>
            <li>Rewards depend on campaign rules and eligibility.</li>
            <li>Blockchain claims require a verified wallet.</li>
            <li>A submitted claim is not necessarily a completed payout.</li>
            <li>TEST rewards have no monetary value.</li>
            <li>Server ledger is authoritative for accounts once the migration is applied.</li>
            <li>Duplicate idempotency keys cannot grant twice.</li>
          </ul>

          {!isGuest && (
            <button
              type="button"
              className="profile-action-btn"
              onClick={async () => {
                const prog = (await import('../game/progression')).progressionService.get();
                if (!prog) {
                  onToast?.('No local progression to merge');
                  return;
                }
                const res = await rewardService.migrateGuestProgress({
                  guestIdentity: prog.playerId.startsWith('guest_') ? prog.playerId : `legacy:${prog.playerId}`,
                  localProgression: {
                    lifetimeXp: prog.lifetimeXp,
                    rep: prog.rep,
                    claimedRewardKeys: prog.claimedRewardKeys,
                    unlockedTitleIds: prog.unlockedTitleIds,
                    discoveries: {
                      districts: prog.discoveredDistrictIds,
                      landmarks: prog.discoveredLandmarkIds,
                      interiors: prog.discoveredInteriorIds,
                    },
                    achievementProgress: prog.achievementProgress,
                  },
                });
                onToast?.(res.message);
              }}
            >
              Merge local / guest progress (once)
            </button>
          )}

          {onOpenAchievements && (
            <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={onOpenAchievements}>
              Achievement Centre
            </button>
          )}

          {isOperator && onOpenOps && (
            <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={onOpenOps}>
              Open operator console
            </button>
          )}

          {!isGuest && import.meta.env.DEV && (
            <button
              type="button"
              className="profile-action-btn"
              onClick={async () => {
                const res = await rewardService.createDevClaim();
                onToast?.(res.message);
              }}
            >
              Dev: Create mock claim
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
