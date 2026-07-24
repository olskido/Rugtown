/**
 * PartyPanel — Phase 10K party membership, chat, invites, TEST mission/queue.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  partyService,
  type PartyChatMessage,
  type PartyInvitationView,
  type PartyMemberView,
  type PartyPermissions,
  type PartyView,
} from '../../lib/party';

export interface PartyPanelProps {
  open: boolean;
  isGuest: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

type Tab = 'party' | 'chat' | 'invites' | 'mission';

function clientMsgId(): string {
  return `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function PartyPanel({ open, isGuest, onClose, onToast }: PartyPanelProps) {
  const toast = (text?: string) => {
    if (text) toast(text);
  };
  const [tab, setTab] = useState<Tab>('party');
  const [party, setParty] = useState<PartyView | null>(null);
  const [members, setMembers] = useState<PartyMemberView[]>([]);
  const [perms, setPerms] = useState<PartyPermissions>({});
  const [incoming, setIncoming] = useState<PartyInvitationView[]>([]);
  const [outgoing, setOutgoing] = useState<PartyInvitationView[]>([]);
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [createName, setCreateName] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [missionId, setMissionId] = useState<string | null>(null);
  const [missionProgress, setMissionProgress] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    setParty(partyService.getParty());
    setMembers(partyService.getMembers());
    setPerms(partyService.getPermissions());
    setIncoming(partyService.getIncomingInvitations());
    setOutgoing(partyService.getOutgoingInvitations());
    setUnread(partyService.getUnreadChatCount());
  }, []);

  const refresh = useCallback(async () => {
    if (isGuest) return;
    await Promise.all([
      partyService.refreshParty(),
      partyService.refreshInvitations(),
      partyService.refreshUnread(),
    ]);
    sync();
    const state = await partyService.getMissionState();
    const mid = state?.mission ? String((state.mission as { id?: string }).id ?? '') : '';
    setMissionId(mid || null);
    if (state?.mission) {
      const m = state.mission as { progress_value?: number; progress_target?: number; status?: string };
      setMissionProgress(`${m.status ?? '?'} · ${m.progress_value ?? 0}/${m.progress_target ?? '?'}`);
    } else {
      setMissionProgress('');
    }
  }, [isGuest, sync]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    return partyService.subscribe(sync);
  }, [open, refresh, sync]);

  useEffect(() => {
    if (!open || tab !== 'chat' || !party) return;
    void (async () => {
      const msgs = await partyService.getChatMessages();
      setMessages(msgs);
      const last = msgs[msgs.length - 1];
      await partyService.markChatRead(last?.id);
      sync();
    })();
  }, [open, tab, party, sync]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Party">
      <div className="modal-panel reward-centre party-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>⚔</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Party</span>
            <span className="modal-header__sub">
              {party ? `${party.name} · ${members.length}/${party.maxMembers ?? 4}` : 'No active party'}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body reward-centre__body">
          {isGuest ? (
            <p className="reward-centre__alert">
              Sign in to create or join parties. Guests can still explore the city.
            </p>
          ) : (
            <>
              <div className="social-hub__tabs" role="tablist">
                {([
                  ['party', 'Party'],
                  ['chat', `Chat${unread ? ` (${unread})` : ''}`],
                  ['invites', `Invites${incoming.length ? ` (${incoming.length})` : ''}`],
                  ['mission', 'Mission'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className={`profile-action-btn${tab === id ? ' profile-action-btn--followed' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'party' && !party && (
                <>
                  <p className="reward-centre__meta">Create a private invite-only party (max 4).</p>
                  <div className="dm-panel__composer">
                    <input
                      className="dm-panel__input"
                      value={createName}
                      maxLength={32}
                      placeholder="Party name"
                      onChange={(e) => setCreateName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="profile-action-btn profile-action-btn--primary"
                      disabled={busy || createName.trim().length < 3}
                      onClick={async () => {
                        setBusy(true);
                        const res = await partyService.createParty(createName.trim());
                        toast(res.message ?? '');
                        setBusy(false);
                        await refresh();
                      }}
                    >
                      Create
                    </button>
                  </div>
                </>
              )}

              {tab === 'party' && party && (
                <>
                  <ul className="reward-mission-list">
                    {members.map((m) => (
                      <li key={m.playerId}>
                        <div className="reward-mission-list__main">
                          <strong>{m.username ?? m.playerId.slice(0, 8)}</strong>
                          <span className="reward-centre__meta">
                            {m.role} · {m.readyState === 'ready' ? 'ready' : 'not ready'}
                          </span>
                        </div>
                        <div className="reward-op-actions">
                          {perms.canManage && m.role !== 'leader' && (
                            <button
                              type="button"
                              className="profile-action-btn"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                toast((await partyService.removeMember(m.playerId)).message);
                                setBusy(false);
                                await refresh();
                              }}
                            >
                              Remove
                            </button>
                          )}
                          {perms.canDisband && m.role !== 'leader' && (
                            <button
                              type="button"
                              className="profile-action-btn"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                toast((await partyService.transferLeadership(m.playerId)).message);
                                setBusy(false);
                                await refresh();
                              }}
                            >
                              Make leader
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {(perms.invite || perms.canManage) && (
                    <div className="dm-panel__composer">
                      <input
                        className="dm-panel__input"
                        value={inviteId}
                        placeholder="Invite player UUID"
                        onChange={(e) => setInviteId(e.target.value)}
                      />
                      <button
                        type="button"
                        className="profile-action-btn profile-action-btn--primary"
                        disabled={busy || !inviteId.trim()}
                        onClick={async () => {
                          setBusy(true);
                          toast((await partyService.invitePlayer(inviteId.trim())).message);
                          setBusy(false);
                          setInviteId('');
                          await refresh();
                        }}
                      >
                        Invite
                      </button>
                    </div>
                  )}

                  <div className="reward-op-actions">
                    <button
                      type="button"
                      className="profile-action-btn profile-action-btn--primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        const me = members.find((m) => m.readyState);
                        const ready = me?.readyState !== 'ready';
                        toast((await partyService.setReady(ready)).message);
                        setBusy(false);
                        await refresh();
                      }}
                    >
                      Toggle ready
                    </button>
                    <button
                      type="button"
                      className="profile-action-btn"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        toast((await partyService.leaveParty()).message);
                        setBusy(false);
                        await refresh();
                      }}
                    >
                      Leave
                    </button>
                    {perms.canDisband && (
                      <button
                        type="button"
                        className="profile-action-btn"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          toast((await partyService.disbandParty()).message);
                          setBusy(false);
                          await refresh();
                        }}
                      >
                        Disband
                      </button>
                    )}
                  </div>
                </>
              )}

              {tab === 'chat' && (
                <>
                  {!party && <p className="profile-empty">Join a party to use party chat.</p>}
                  {party && (
                    <>
                      <div className="dm-panel__messages" ref={chatRef} role="log">
                        {messages.length === 0 && <p className="dm-panel__placeholder">No party messages yet.</p>}
                        {messages.map((m) => (
                          <div key={m.id} className="dm-bubble dm-bubble--theirs">
                            <p className="dm-bubble__body">{m.safe_body ?? m.body}</p>
                            <div className="dm-bubble__meta">{new Date(m.created_at).toLocaleTimeString()}</div>
                          </div>
                        ))}
                      </div>
                      <div className="dm-panel__composer">
                        <input
                          className="dm-panel__input"
                          value={draft}
                          maxLength={500}
                          placeholder="Party message…"
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void (async () => {
                                if (!draft.trim()) return;
                                setBusy(true);
                                const res = await partyService.sendChat(draft.trim(), clientMsgId());
                                toast(res.message ?? '');
                                setDraft('');
                                setMessages(await partyService.getChatMessages());
                                setBusy(false);
                              })();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="profile-action-btn profile-action-btn--primary"
                          disabled={busy || !draft.trim()}
                          onClick={async () => {
                            setBusy(true);
                            const res = await partyService.sendChat(draft.trim(), clientMsgId());
                            toast(res.message ?? '');
                            setDraft('');
                            setMessages(await partyService.getChatMessages());
                            setBusy(false);
                          }}
                        >
                          Send
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {tab === 'invites' && (
                <>
                  <h3 className="profile-section-title">Incoming</h3>
                  <ul className="reward-mission-list">
                    {incoming.length === 0 && <li className="profile-empty">No invitations.</li>}
                    {incoming.map((i) => (
                      <li key={i.id}>
                        <div className="reward-mission-list__main">
                          <strong>{i.partyName ?? 'Party'}</strong>
                          <span className="reward-centre__meta">from {i.senderUsername ?? 'player'}</span>
                        </div>
                        <div className="reward-op-actions">
                          <button
                            type="button"
                            className="profile-action-btn profile-action-btn--primary"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              toast((await partyService.respondToInvitation(i.id, true)).message);
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
                              toast((await partyService.respondToInvitation(i.id, false)).message);
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
                    {outgoing.length === 0 && <li className="profile-empty">No outgoing invites.</li>}
                    {outgoing.map((i) => (
                      <li key={i.id}>
                        <strong>{i.recipientUsername ?? i.recipientId}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === 'mission' && (
                <>
                  <p className="reward-centre__meta">
                    TEST Town Tour is draft/inactive by default. Activate in DB, then start from here.
                    Rewards are in-game XP/REP only — no SOL/SPL.
                  </p>
                  {missionProgress && <p className="reward-centre__meta">Active: {missionProgress}</p>}
                  <div className="reward-op-actions">
                    <button
                      type="button"
                      className="profile-action-btn profile-action-btn--primary"
                      disabled={busy || !party || !perms.canManage}
                      onClick={async () => {
                        setBusy(true);
                        const res = await partyService.startTestMission();
                        toast(res.message ?? '');
                        if (res.missionId) setMissionId(String(res.missionId));
                        setBusy(false);
                        await refresh();
                      }}
                    >
                      Start TEST mission
                    </button>
                    {(['fountain', 'market', 'bridge', 'fame'] as const).map((lm) => (
                      <button
                        key={lm}
                        type="button"
                        className="profile-action-btn"
                        disabled={busy || !missionId}
                        onClick={async () => {
                          setBusy(true);
                          toast((await partyService.recordContribution(missionId!, lm)).message);
                          setBusy(false);
                          await refresh();
                        }}
                      >
                        Contribute {lm}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="profile-action-btn"
                      disabled={busy || !missionId || !perms.canManage}
                      onClick={async () => {
                        setBusy(true);
                        toast(JSON.stringify(await partyService.completeMission(missionId!)));
                        setBusy(false);
                        await refresh();
                      }}
                    >
                      Complete mission
                    </button>
                    <button
                      type="button"
                      className="profile-action-btn"
                      disabled={busy || !perms.canManage}
                      onClick={async () => {
                        setBusy(true);
                        toast((await partyService.queueParty()).message);
                        setBusy(false);
                      }}
                    >
                      Queue TEST
                    </button>
                    <button
                      type="button"
                      className="profile-action-btn"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        toast((await partyService.cancelQueue()).message);
                        setBusy(false);
                      }}
                    >
                      Cancel queue
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
