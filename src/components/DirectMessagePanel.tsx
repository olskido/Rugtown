/**
 * DirectMessagePanel — Phase 10J server-backed direct messages.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirectMessageRecipient } from '../lib/social';
import { socialService, type DirectMessageView } from '../lib/social/index';

export interface DirectMessagePanelProps {
  recipient: DirectMessageRecipient;
  closing?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  onClose: () => void;
  onToast?: (text: string) => void;
  onReportMessage?: (messageId: string) => void;
  onBlock?: (playerId: string) => void;
}

function newClientId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function DirectMessagePanel({
  recipient,
  closing = false,
  isGuest = false,
  userId = null,
  onClose,
  onToast,
  onReportMessage,
  onBlock,
}: DirectMessagePanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyHint, setPolicyHint] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const load = useCallback(async () => {
    if (isGuest || recipient.isGuest || !userId) {
      setError('Sign in required. Guests cannot send persistent direct messages.');
      return;
    }
    setBusy(true);
    setError(null);
    const opened = await socialService.getOrCreateConversation(recipient.playerId);
    if (!opened.ok || !opened.conversationId) {
      setError(opened.message ?? 'Cannot open conversation');
      setBusy(false);
      if (opened.message?.toLowerCase().includes('friends only')) {
        setPolicyHint('This player only accepts messages from friends. Send a friend request first, or a message request if their policy allows it.');
      }
      return;
    }
    setConversationId(opened.conversationId);
    if (opened.messagePolicy === 'requests') {
      setPolicyHint('Message requests may apply until accepted.');
    }
    const msgs = await socialService.getMessages(opened.conversationId);
    setMessages(msgs);
    const last = msgs[msgs.length - 1];
    await socialService.markRead(opened.conversationId, last?.id);
    setBusy(false);
  }, [isGuest, recipient.isGuest, recipient.playerId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!conversationId || sendingRef.current) return;
    const body = draft.trim();
    if (!body) return;
    sendingRef.current = true;
    setBusy(true);
    const clientId = newClientId();
    const res = await socialService.sendDirectMessage(conversationId, body, clientId);
    sendingRef.current = false;
    setBusy(false);
    if (!res.ok) {
      onToast?.(res.message ?? 'Send failed');
      // friends_only after open — try message request path
      if (/friends only|message request/i.test(res.message ?? '')) {
        const req = await socialService.createMessageRequest(recipient.playerId, body, clientId);
        onToast?.(req.message ?? 'Message request attempted');
      }
      return;
    }
    setDraft('');
    if (res.notice) onToast?.(res.notice);
    const msgs = await socialService.getMessages(conversationId);
    setMessages(msgs);
  };

  return (
    <div
      className={`modal-overlay ${closing ? 'modal-overlay--closing' : ''}`}
      onClick={onClose}
      data-ui-block-camera
      role="dialog"
      aria-modal="true"
      aria-label={`Message ${recipient.username}`}
    >
      <div
        className={`modal-panel dm-panel dm-panel--live ${closing ? 'modal-panel--closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
        <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

        <div className="panel-header">
          <span className="panel-header__logo">DIRECT MESSAGE</span>
          <button type="button" className="chat-panel__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body dm-panel__body">
          <p className="modal-text">
            To <strong>{recipient.username}</strong>
            {recipient.isGuest ? ' (guest)' : ''}
          </p>

          {error && <p className="reward-centre__alert" role="alert">{error}</p>}
          {policyHint && !error && <p className="reward-centre__meta">{policyHint}</p>}

          <div className="dm-panel__messages" ref={listRef} role="log" aria-live="polite">
            {messages.length === 0 && !error && (
              <p className="dm-panel__placeholder">No messages yet.</p>
            )}
            {messages.map((m) => {
              const mine = userId && m.senderId === userId;
              const deleted = m.status === 'deleted';
              return (
                <div
                  key={m.id}
                  className={`dm-bubble ${mine ? 'dm-bubble--mine' : 'dm-bubble--theirs'}${deleted ? ' dm-bubble--deleted' : ''}`}
                >
                  <p className="dm-bubble__body">{m.body}</p>
                  <div className="dm-bubble__meta">
                    {m.editedAt ? 'edited · ' : ''}
                    {m.moderationState === 'held' ? 'held · ' : ''}
                    {new Date(m.createdAt).toLocaleTimeString()}
                    {!mine && onReportMessage && !deleted && (
                      <button
                        type="button"
                        className="dm-bubble__report"
                        onClick={() => onReportMessage(m.id)}
                      >
                        Report
                      </button>
                    )}
                    {mine && !deleted && (
                      <button
                        type="button"
                        className="dm-bubble__report"
                        disabled={busy}
                        onClick={async () => {
                          const res = await socialService.deleteMessage(m.id);
                          onToast?.(res.message ?? '');
                          if (conversationId) setMessages(await socialService.getMessages(conversationId));
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!error && conversationId && (
            <div className="dm-panel__composer">
              <input
                type="text"
                className="dm-panel__input"
                value={draft}
                maxLength={2000}
                placeholder="Write a message…"
                disabled={busy || isGuest}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send();
                }}
              />
              <button
                type="button"
                className="profile-action-btn profile-action-btn--primary"
                disabled={busy || !draft.trim() || isGuest}
                onClick={() => void send()}
              >
                Send
              </button>
            </div>
          )}
        </div>

        <div className="player-profile-actions">
          {onBlock && !recipient.isGuest && (
            <button
              type="button"
              className="profile-action-btn"
              onClick={() => onBlock(recipient.playerId)}
            >
              Block
            </button>
          )}
          <button type="button" className="profile-action-btn profile-action-btn--close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
