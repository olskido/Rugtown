/**
 * SocialHubPanel — friends, requests, search, blocks, privacy (Phase 10J).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  socialService,
  type FriendRequestIncoming,
  type FriendRequestOutgoing,
  type FriendRow,
  type BlockRow,
  type SearchPlayerHit,
  type PrivacySettingsPatch,
  type ConversationSummary,
} from '../../lib/social/index';

export interface SocialHubPanelProps {
  open: boolean;
  isGuest: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
  onOpenConversation?: (playerId: string, username: string) => void;
  onOpenModeration?: () => void;
  onOpenGuild?: () => void;
  unreadDmCount?: number;
}

type Tab = 'friends' | 'requests' | 'messages' | 'search' | 'blocks' | 'privacy';

export function SocialHubPanel({
  open,
  isGuest,
  onClose,
  onToast,
  onOpenConversation,
  onOpenModeration,
  onOpenGuild,
  unreadDmCount = 0,
}: SocialHubPanelProps) {
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestOutgoing[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchPlayerHit[]>([]);
  const [privacy, setPrivacy] = useState<PrivacySettingsPatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [isOperator, setIsOperator] = useState(false);

  const refresh = useCallback(async () => {
    if (isGuest) return;
    await Promise.all([
      socialService.refreshFriends(),
      socialService.refreshFriendRequests(),
      socialService.refreshBlocks(),
      socialService.refreshConversations(),
      socialService.refreshUnreadCount(),
    ]);
    setFriends(socialService.getFriends());
    setIncoming(socialService.getIncomingRequests());
    setOutgoing(socialService.getOutgoingRequests());
    setBlocks(socialService.getBlocks());
    setConversations(socialService.getConversations());
    const p = await socialService.loadPrivacySettings();
    setPrivacy(p);
    const op = await socialService.isSocialOperator();
    setIsOperator(op.operator);
  }, [isGuest]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const unsub = socialService.subscribe(() => {
      setFriends(socialService.getFriends());
      setIncoming(socialService.getIncomingRequests());
      setOutgoing(socialService.getOutgoingRequests());
      setBlocks(socialService.getBlocks());
      setConversations(socialService.getConversations());
    });
    return unsub;
  }, [open, refresh]);

  if (!open) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'friends', label: 'Friends' },
    { id: 'requests', label: `Requests${incoming.length ? ` (${incoming.length})` : ''}` },
    { id: 'messages', label: `Messages${unreadDmCount ? ` (${unreadDmCount})` : ''}` },
    { id: 'search', label: 'Search' },
    { id: 'blocks', label: 'Blocks' },
    { id: 'privacy', label: 'Privacy' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Social">
      <div className="modal-panel reward-centre social-hub" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>👥</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Social</span>
            <span className="modal-header__sub">Friends · Messages · Privacy</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          {isGuest ? (
            <p className="reward-centre__alert">
              Sign in to use friends, direct messages, blocking, and privacy settings.
              Guest play remains available in the city.
            </p>
          ) : (
            <>
              <div className="social-hub__tabs" role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`profile-action-btn${tab === t.id ? ' profile-action-btn--followed' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'friends' && (
                <ul className="reward-mission-list">
                  {friends.length === 0 && <li className="profile-empty">No friends yet.</li>}
                  {friends.map((f) => (
                    <li key={f.friendshipId}>
                      <div className="reward-mission-list__main">
                        <strong>{f.username}</strong>
                        <span className="reward-centre__meta">{f.displayName ?? ''}</span>
                      </div>
                      <div className="reward-op-actions">
                        <button
                          type="button"
                          className="profile-action-btn profile-action-btn--primary"
                          onClick={() => onOpenConversation?.(f.playerId, f.username)}
                        >
                          Message
                        </button>
                        <button
                          type="button"
                          className="profile-action-btn"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const res = await socialService.removeFriend(f.playerId);
                            onToast?.(res.message ?? '');
                            setBusy(false);
                            await refresh();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'requests' && (
                <>
                  <h3 className="profile-section-title">Incoming</h3>
                  <ul className="reward-mission-list">
                    {incoming.length === 0 && <li className="profile-empty">No incoming requests.</li>}
                    {incoming.map((r) => (
                      <li key={r.id}>
                        <div className="reward-mission-list__main">
                          <strong>{r.username}</strong>
                          {r.message && <span className="reward-centre__meta">{r.message}</span>}
                        </div>
                        <div className="reward-op-actions">
                          <button
                            type="button"
                            className="profile-action-btn profile-action-btn--primary"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              const res = await socialService.respondToFriendRequest(r.id, true);
                              onToast?.(res.message ?? '');
                              setBusy(false);
                              await refresh();
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="profile-action-btn"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              const res = await socialService.respondToFriendRequest(r.id, false);
                              onToast?.(res.message ?? '');
                              setBusy(false);
                              await refresh();
                            }}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <h3 className="profile-section-title">Outgoing</h3>
                  <ul className="reward-mission-list">
                    {outgoing.length === 0 && <li className="profile-empty">No outgoing requests.</li>}
                    {outgoing.map((r) => (
                      <li key={r.id}>
                        <div className="reward-mission-list__main">
                          <strong>{r.username}</strong>
                        </div>
                        <button
                          type="button"
                          className="profile-action-btn"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const res = await socialService.cancelFriendRequest(r.id);
                            onToast?.(res.message ?? '');
                            setBusy(false);
                            await refresh();
                          }}
                        >
                          Cancel
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === 'messages' && (
                <ul className="reward-mission-list">
                  {conversations.length === 0 && <li className="profile-empty">No conversations yet.</li>}
                  {conversations.map((c) => (
                    <li key={c.conversationId}>
                      <div className="reward-mission-list__main">
                        <strong>{c.username}</strong>
                        {c.unread > 0 && <span className="social-unread-badge">{c.unread}</span>}
                        <span className="reward-centre__meta">
                          {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : 'No messages'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="profile-action-btn profile-action-btn--primary"
                        onClick={() => onOpenConversation?.(c.otherPlayerId, c.username)}
                      >
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'search' && (
                <>
                  <div className="dm-panel__composer">
                    <input
                      className="dm-panel__input"
                      value={query}
                      placeholder="Search username (min 2 chars)"
                      onChange={(e) => setQuery(e.target.value)}
                      maxLength={32}
                    />
                    <button
                      type="button"
                      className="profile-action-btn profile-action-btn--primary"
                      disabled={busy || query.trim().length < 2}
                      onClick={async () => {
                        setBusy(true);
                        setHits(await socialService.searchPlayers(query.trim()));
                        setBusy(false);
                      }}
                    >
                      Search
                    </button>
                  </div>
                  <ul className="reward-mission-list">
                    {hits.map((h) => (
                      <li key={h.playerId}>
                        <div className="reward-mission-list__main">
                          <strong>{h.username}</strong>
                        </div>
                        <div className="reward-op-actions">
                          <button
                            type="button"
                            className="profile-action-btn profile-action-btn--primary"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              const res = await socialService.sendFriendRequest(h.playerId);
                              onToast?.(res.message ?? '');
                              setBusy(false);
                              await refresh();
                            }}
                          >
                            Add friend
                          </button>
                          <button
                            type="button"
                            className="profile-action-btn"
                            onClick={() => onOpenConversation?.(h.playerId, h.username)}
                          >
                            Message
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === 'blocks' && (
                <ul className="reward-mission-list">
                  {blocks.length === 0 && <li className="profile-empty">No blocked players.</li>}
                  {blocks.map((b) => (
                    <li key={b.blockedId}>
                      <div className="reward-mission-list__main">
                        <strong>{b.username}</strong>
                      </div>
                      <button
                        type="button"
                        className="profile-action-btn"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const res = await socialService.unblockPlayer(b.blockedId);
                          onToast?.(res.message ?? '');
                          setBusy(false);
                          await refresh();
                        }}
                      >
                        Unblock
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'privacy' && privacy && (
                <div className="social-privacy-form">
                  {(
                    [
                      ['profile_visibility', 'Profile visibility', ['public', 'friends_only', 'private']],
                      ['friend_request_policy', 'Friend requests', ['everyone', 'friends_of_friends', 'nobody']],
                      ['message_policy', 'Messages', ['everyone', 'friends_only', 'requests', 'nobody']],
                      ['presence_visibility', 'Presence', ['everyone', 'friends', 'nobody']],
                    ] as const
                  ).map(([key, label, options]) => (
                    <label key={key} className="settings-panel__row">
                      <span>{label}</span>
                      <select
                        value={String(privacy[key] ?? '')}
                        onChange={(e) => setPrivacy({ ...privacy, [key]: e.target.value as never })}
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {(
                    [
                      ['show_level', 'Show level'],
                      ['show_rank', 'Show rank'],
                      ['show_equipped_title', 'Show equipped title'],
                      ['show_online_status', 'Show online status'],
                      ['allow_profile_search', 'Allow profile search'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="settings-panel__row">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(privacy[key])}
                        onChange={(e) => setPrivacy({ ...privacy, [key]: e.target.checked })}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="profile-action-btn profile-action-btn--primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const res = await socialService.updatePrivacySettings(privacy);
                      onToast?.(res.message ?? '');
                      setBusy(false);
                    }}
                  >
                    Save privacy
                  </button>
                </div>
              )}

              {onOpenGuild && (
                <button
                  type="button"
                  className="profile-action-btn profile-action-btn--primary"
                  onClick={onOpenGuild}
                >
                  Open Guild Centre
                </button>
              )}

              {isOperator && onOpenModeration && (
                <button
                  type="button"
                  className="profile-action-btn"
                  onClick={onOpenModeration}
                >
                  Open moderation console
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
