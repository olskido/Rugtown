/**
 * SocialPlayerCard.tsx — compact social profile card (Phase 10J).
 */

import type { SocialPlayerSummary } from '../lib/social';
import type { FriendshipState } from '../lib/social/index';

export interface SocialPlayerCardProps {
  player: SocialPlayerSummary;
  closing?: boolean;
  friendship?: FriendshipState | null;
  offlineNotice?: string | null;
  isGuestViewer?: boolean;
  canMessage?: boolean;
  onClose: () => void;
  onWave?: () => void;
  onMessage: () => void;
  onAddFriend?: () => void;
  onAcceptFriend?: () => void;
  onInviteParty?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onViewProfile?: () => void;
}

export function SocialPlayerCard({
  player,
  closing = false,
  friendship = null,
  offlineNotice = null,
  isGuestViewer = false,
  canMessage = true,
  onClose,
  onWave,
  onMessage,
  onAddFriend,
  onAcceptFriend,
  onInviteParty,
  onBlock,
  onReport,
  onViewProfile,
}: SocialPlayerCardProps) {
  const holder = player.holderTier || player.title || 'None';
  const messageDisabled = !canMessage || friendship?.blocked || player.isGuest;

  return (
    <div
      className={`modal-overlay ${closing ? 'modal-overlay--closing' : ''}`}
      onClick={onClose}
      data-ui-block-camera
      role="dialog"
      aria-modal="true"
      aria-label={`Player ${player.username}`}
    >
      <div
        className={`modal-panel player-profile-card ${closing ? 'modal-panel--closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--br" aria-hidden>◆</span>
        <span className="modal-panel__shimmer" aria-hidden />

        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>👤</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">{player.username}</span>
            <span className="modal-header__sub player-real-badge">
              {player.isGuest ? '● GUEST PLAYER' : '● REAL PLAYER'}
              {player.equippedTitle ? ` · ${player.equippedTitle}` : ''}
            </span>
          </div>
          <button className="modal-close modal-close--profile" onClick={onClose} aria-label="Close profile" title="Close">✕</button>
        </div>

        <div className="modal-body">
          {offlineNotice && (
            <p className="social-card__notice" role="status">{offlineNotice}</p>
          )}
          {friendship && (
            <div className="whale-alert-row">
              <span className="whale-alert-row__label">Relation</span>
              <span className="whale-alert-row__value">
                {friendship.blocked
                  ? 'Blocked'
                  : friendship.friends
                    ? 'Friends'
                    : friendship.pendingOutgoing
                      ? 'Request sent'
                      : friendship.pendingIncoming
                        ? 'Request received'
                        : 'None'}
              </span>
            </div>
          )}
          <div className="whale-alert-row">
            <span className="whale-alert-row__label">Status</span>
            <span className={player.online ? 'player-online-badge' : 'player-offline-badge'}>
              {player.online ? 'Online' : 'Offline'}
            </span>
          </div>
          {player.level != null && (
            <div className="whale-alert-row">
              <span className="whale-alert-row__label">Level</span>
              <span className="whale-alert-row__value whale-alert-row__value--gold">{player.level}</span>
            </div>
          )}
          {player.rankLabel && (
            <div className="whale-alert-row">
              <span className="whale-alert-row__label">Rank</span>
              <span className="whale-alert-row__value">{player.rankLabel}</span>
            </div>
          )}
          <div className="whale-alert-row">
            <span className="whale-alert-row__label">REP</span>
            <span className="whale-alert-row__value whale-alert-row__value--gold">
              {player.rep.toLocaleString()}
            </span>
          </div>
          <p className="social-card__notice" style={{ marginTop: 0 }}>
            Level / rank / REP / holder from presence are display hints until server profile loads.
          </p>
          <div className="whale-alert-row">
            <span className="whale-alert-row__label">Holder</span>
            <span className="whale-alert-row__value">
              <span
                className={`qstat__dot qstat__dot--holder-${holder.toLowerCase()}`}
                style={{ display: 'inline-block', marginRight: 5, verticalAlign: 'middle' }}
              />
              {holder}
            </span>
          </div>
          {player.achievementSummary && (
            <div className="whale-alert-row">
              <span className="whale-alert-row__label">Achievements</span>
              <span className="whale-alert-row__value">{player.achievementSummary}</span>
            </div>
          )}
          {isGuestViewer && (
            <p className="social-card__notice">Sign in to add friends, message, block, or report.</p>
          )}
        </div>

        <div className="player-profile-actions">
          <button
            type="button"
            className="profile-action-btn profile-action-btn--primary"
            onClick={onMessage}
            disabled={messageDisabled}
            title={messageDisabled ? 'Messaging unavailable' : 'Direct message'}
          >
            ✉ Message
          </button>
          <button
            type="button"
            className="profile-action-btn"
            onClick={onViewProfile ?? onClose}
          >
            View Profile
          </button>
          {onWave && (
            <button type="button" className="profile-action-btn" onClick={onWave} disabled={!player.online}>
              👋 Wave
            </button>
          )}
          {!isGuestViewer && friendship?.pendingIncoming && onAcceptFriend && (
            <button type="button" className="profile-action-btn profile-action-btn--followed" onClick={onAcceptFriend}>
              Accept friend
            </button>
          )}
          {!isGuestViewer && !friendship?.friends && !friendship?.pendingOutgoing && !friendship?.blocked && onAddFriend && !player.isGuest && (
            <button type="button" className="profile-action-btn" onClick={onAddFriend}>
              + Add friend
            </button>
          )}
          {!isGuestViewer && onInviteParty && !player.isGuest && player.online && (
            <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={onInviteParty}>
              Invite to party
            </button>
          )}
          {!isGuestViewer && onBlock && !player.isGuest && (
            <button type="button" className="profile-action-btn" onClick={onBlock}>
              Block
            </button>
          )}
          {!isGuestViewer && onReport && !player.isGuest && (
            <button type="button" className="profile-action-btn" onClick={onReport}>
              Report
            </button>
          )}
          <button type="button" className="profile-action-btn profile-action-btn--close" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
