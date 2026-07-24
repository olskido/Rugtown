/**
 * GuildPanel — practical guild centre (Phase 10N).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export interface GuildPanelProps {
  open: boolean;
  isGuest: boolean;
  onClose: () => void;
  onToast?: (text: string) => void;
}

export function GuildPanel({ open, isGuest, onClose, onToast }: GuildPanelProps) {
  const [guild, setGuild] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [chat, setChat] = useState('');
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [inviteId, setInviteId] = useState('');
  const [discover, setDiscover] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || isGuest) return;
    const { data } = await supabase.rpc('get_my_guild');
    setGuild(data && data !== 'null' ? (data as Record<string, unknown>) : null);
    if (data && data !== 'null') {
      const { data: chatData } = await supabase.rpc('get_guild_chat_messages', { p_limit: 30 });
      const msgs = ((chatData as { messages?: Record<string, unknown>[] })?.messages) ?? [];
      setMessages(msgs);
    } else {
      setMessages([]);
      const { data: d } = await supabase.rpc('search_discoverable_guilds', { p_query: '', p_limit: 10 });
      setDiscover(((d as { guilds?: Record<string, unknown>[] })?.guilds) ?? []);
    }
  }, [isGuest]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const g = guild?.guild as Record<string, unknown> | undefined;
  const members = (guild?.members as Record<string, unknown>[]) ?? [];

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true">
      <div className="modal-panel reward-centre" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>⚑</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Guild Centre</span>
            <span className="modal-header__sub">Invite-only by default · no treasury</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body reward-centre__body">
          {isGuest ? (
            <p className="reward-centre__alert">Sign in to create or join a guild.</p>
          ) : !g ? (
            <>
              <p className="reward-centre__meta">Create a guild (max 20). No fees.</p>
              <div className="dm-panel__composer">
                <input className="dm-panel__input" placeholder="Name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
                <input className="dm-panel__input" placeholder="TAG" value={tag} maxLength={6} onChange={(e) => setTag(e.target.value)} />
                <button
                  type="button"
                  className="profile-action-btn profile-action-btn--primary"
                  disabled={busy || name.trim().length < 3 || tag.trim().length < 2 || !isSupabaseConfigured}
                  onClick={async () => {
                    if (!supabase) return;
                    setBusy(true);
                    const { error } = await supabase.rpc('create_guild', {
                      p_name: name.trim(),
                      p_tag: tag.trim().toUpperCase(),
                      p_description: null,
                    });
                    onToast?.(error ? error.message : 'Guild created');
                    setBusy(false);
                    await refresh();
                  }}
                >
                  Create
                </button>
              </div>
              <h3 className="profile-section-title">Discoverable</h3>
              <ul className="reward-mission-list">
                {discover.length === 0 && <li className="profile-empty">None discoverable yet (default is invite-only).</li>}
                {discover.map((d) => (
                  <li key={String(d.id)}>
                    <strong>{String(d.name)}</strong> [{String(d.tag)}]
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="reward-centre__meta">
                <strong>{String(g.name)}</strong> [{String(g.tag)}] · {members.length} members
              </p>
              <ul className="reward-mission-list">
                {members.slice(0, 12).map((m) => (
                  <li key={String(m.player_id)}>
                    {String(m.player_id).slice(0, 8)} · {String(m.role)}
                  </li>
                ))}
              </ul>
              <div className="dm-panel__composer">
                <input
                  className="dm-panel__input"
                  placeholder="Invite player UUID"
                  value={inviteId}
                  onChange={(e) => setInviteId(e.target.value)}
                />
                <button
                  type="button"
                  className="profile-action-btn"
                  disabled={busy || !inviteId.trim()}
                  onClick={async () => {
                    if (!supabase) return;
                    setBusy(true);
                    const { error } = await supabase.rpc('invite_to_guild', { p_player: inviteId.trim() });
                    onToast?.(error ? error.message : 'Invite sent');
                    setBusy(false);
                  }}
                >
                  Invite
                </button>
              </div>
              <div className="dm-panel__composer">
                <input className="dm-panel__input" value={chat} placeholder="Guild chat…" onChange={(e) => setChat(e.target.value)} />
                <button
                  type="button"
                  className="profile-action-btn profile-action-btn--primary"
                  disabled={busy || !chat.trim()}
                  onClick={async () => {
                    if (!supabase) return;
                    setBusy(true);
                    const { error } = await supabase.rpc('send_guild_chat_message', {
                      p_client_id: `g_${Date.now()}`,
                      p_body: chat.trim(),
                    });
                    onToast?.(error ? error.message : 'Sent');
                    setChat('');
                    setBusy(false);
                    await refresh();
                  }}
                >
                  Send
                </button>
              </div>
              <ul className="reward-mission-list">
                {messages.slice(0, 8).map((m) => (
                  <li key={String(m.id)}>
                    <span className="reward-centre__meta">{String(m.safe_body ?? m.body ?? '')}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="profile-action-btn"
                disabled={busy}
                onClick={async () => {
                  if (!supabase) return;
                  setBusy(true);
                  const { error } = await supabase.rpc('leave_guild');
                  onToast?.(error ? error.message : 'Left guild');
                  setBusy(false);
                  await refresh();
                }}
              >
                Leave guild
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
