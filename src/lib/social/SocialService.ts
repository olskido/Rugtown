/**
 * SocialService — Phase 10J client boundary for profiles, friends, DMs,
 * blocks, presence heartbeats, reports, and moderation dashboards.
 *
 * Authenticated users: server RPCs are authoritative. Guests get no
 * persistent social mutations (friends/DM/report/block).
 */

import { supabase, isSupabaseConfigured } from '../supabase';
import type {
  BlockRow,
  ConversationSummary,
  DirectMessageView,
  FriendRequestIncoming,
  FriendRequestOutgoing,
  FriendRow,
  FriendshipState,
  ModerationCaseRow,
  ModerationDashboard,
  PrivacySettingsPatch,
  PublicPlayerProfile,
  ReportCategory,
  SearchPlayerHit,
  SocialOk,
} from './types';

function errMsg(error: { message?: string } | null, fallback: string): string {
  return error?.message?.trim() || fallback;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

class SocialService {
  private userId: string | null = null;
  private friends: FriendRow[] = [];
  private incoming: FriendRequestIncoming[] = [];
  private outgoing: FriendRequestOutgoing[] = [];
  private blocks: BlockRow[] = [];
  private conversations: ConversationSummary[] = [];
  private unreadDmCount = 0;
  private listeners = new Set<() => void>();
  private realtime: { unsubscribe?: () => void } | null = null;
  private lastHeartbeatAt = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getFriends(): FriendRow[] { return this.friends; }
  getIncomingRequests(): FriendRequestIncoming[] { return this.incoming; }
  getOutgoingRequests(): FriendRequestOutgoing[] { return this.outgoing; }
  getBlocks(): BlockRow[] { return this.blocks; }
  getConversations(): ConversationSummary[] { return this.conversations; }
  getUnreadDmCount(): number { return this.unreadDmCount; }
  isAuthenticated(): boolean { return !!this.userId; }

  async initForAuthenticatedUser(userId: string): Promise<void> {
    this.userId = userId;
    if (!isSupabaseConfigured || !supabase) return;
    await Promise.all([
      this.refreshFriends(),
      this.refreshFriendRequests(),
      this.refreshBlocks(),
      this.refreshConversations(),
      this.refreshUnreadCount(),
    ]);
    this.subscribeRealtime(userId);
    this.notify();
  }

  clear(): void {
    this.userId = null;
    this.friends = [];
    this.incoming = [];
    this.outgoing = [];
    this.blocks = [];
    this.conversations = [];
    this.unreadDmCount = 0;
    this.realtime?.unsubscribe?.();
    this.realtime = null;
    this.notify();
  }

  private subscribeRealtime(userId: string): void {
    if (!supabase) return;
    this.realtime?.unsubscribe?.();
    const channel = supabase
      .channel(`social:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages' },
        () => {
          void this.refreshConversations();
          void this.refreshUnreadCount();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => { void this.refreshFriendRequests(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => { void this.refreshFriends(); },
      )
      .subscribe();
    const client = supabase;
    this.realtime = { unsubscribe: () => { void client.removeChannel(channel); } };
  }

  private requireAuth(): SocialOk | null {
    if (!this.userId || !isSupabaseConfigured || !supabase) {
      return { ok: false, message: 'Sign in required for social features.' };
    }
    return null;
  }

  async checkUsernameAvailability(username: string): Promise<{ available: boolean; reason?: string }> {
    if (!supabase) return { available: false, reason: 'unavailable' };
    const { data, error } = await supabase.rpc('check_username_availability', { p_username: username });
    if (error) return { available: false, reason: error.message };
    const r = asRecord(data);
    return { available: Boolean(r.available), reason: r.reason as string | undefined };
  }

  async updateUsername(username: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('update_player_username', { p_username: username });
    if (error) return { ok: false, message: errMsg(error, 'Username update failed') };
    const r = asRecord(data);
    return { ok: Boolean(r.ok ?? true), message: (r.reason as string) || 'Username updated' };
  }

  async getPublicProfile(playerId: string): Promise<PublicPlayerProfile | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_public_player_profile', { p_player_id: playerId });
    if (error || !data) return null;
    const r = asRecord(data);
    return {
      ok: Boolean(r.ok),
      restricted: Boolean(r.restricted),
      playerId: r.playerId as string | undefined,
      username: String(r.username ?? 'Unknown'),
      displayName: (r.displayName ?? null) as string | null,
      bio: (r.bio ?? null) as string | null,
      level: (r.level ?? null) as number | null,
      equippedTitle: (r.equippedTitle ?? null) as string | null,
      joinedMonth: (r.joinedMonth ?? null) as string | null,
      relationship: r.relationship as string | undefined,
      onlineStatus: (r.onlineStatus ?? null) as string | null,
    };
  }

  async searchPlayers(query: string, limit = 20): Promise<SearchPlayerHit[]> {
    const gate = this.requireAuth();
    if (gate || !supabase) return [];
    const { data, error } = await supabase.rpc('search_public_players', {
      p_query: query,
      p_limit: limit,
    });
    if (error || !data) return [];
    const rows = (asRecord(data).players as Record<string, unknown>[] | undefined) ?? [];
    return rows.map((r) => ({
      playerId: String(r.playerId),
      username: String(r.username),
      displayName: (r.displayName ?? null) as string | null,
    }));
  }

  async getFriendshipState(otherId: string): Promise<FriendshipState | null> {
    const gate = this.requireAuth();
    if (gate || !supabase) return null;
    const { data, error } = await supabase.rpc('get_friendship_state', { p_other_id: otherId });
    if (error || !data) return null;
    const r = asRecord(data);
    return {
      friends: Boolean(r.friends),
      blocked: Boolean(r.blocked),
      pendingOutgoing: Boolean(r.pendingOutgoing),
      pendingIncoming: Boolean(r.pendingIncoming),
    };
  }

  async refreshFriends(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_friends');
    if (error || !data) return;
    const rows = (asRecord(data).friends as Record<string, unknown>[] | undefined) ?? [];
    this.friends = rows.map((r) => ({
      friendshipId: String(r.friendshipId),
      playerId: String(r.playerId),
      username: String(r.username),
      displayName: (r.displayName ?? null) as string | null,
      since: String(r.since),
    }));
    this.notify();
  }

  async refreshFriendRequests(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_friend_requests');
    if (error || !data) return;
    const r = asRecord(data);
    const inc = (r.incoming as Record<string, unknown>[] | undefined) ?? [];
    const out = (r.outgoing as Record<string, unknown>[] | undefined) ?? [];
    this.incoming = inc.map((row) => ({
      id: String(row.id),
      senderId: String(row.senderId),
      username: String(row.username),
      message: (row.message ?? null) as string | null,
      createdAt: String(row.createdAt),
    }));
    this.outgoing = out.map((row) => ({
      id: String(row.id),
      recipientId: String(row.recipientId),
      username: String(row.username),
      createdAt: String(row.createdAt),
    }));
    this.notify();
  }

  async refreshBlocks(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_blocks');
    if (error || !data) return;
    const rows = (asRecord(data).blocks as Record<string, unknown>[] | undefined) ?? [];
    this.blocks = rows.map((r) => ({
      blockedId: String(r.playerId ?? r.blockedId),
      username: String(r.username),
      createdAt: String(r.createdAt),
    }));
    this.notify();
  }

  async refreshConversations(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_conversations');
    if (error || !data) return;
    const rows = (asRecord(data).conversations as Record<string, unknown>[] | undefined) ?? [];
    this.conversations = rows.map((r) => ({
      conversationId: String(r.conversationId),
      otherPlayerId: String(r.otherPlayerId),
      username: String(r.username),
      lastMessageAt: (r.lastMessageAt ?? null) as string | null,
      isMuted: Boolean(r.isMuted),
      isArchived: Boolean(r.isArchived),
      unread: Number(r.unread ?? 0),
    }));
    this.notify();
  }

  async refreshUnreadCount(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_unread_dm_count');
    if (error) return;
    this.unreadDmCount = Number(data ?? 0);
    this.notify();
  }

  async sendFriendRequest(recipientId: string, message?: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('send_friend_request', {
      p_recipient_id: recipientId,
      p_message: message ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Friend request failed') };
    await this.refreshFriendRequests();
    const r = asRecord(data);
    return { ok: Boolean(r.ok ?? true), message: r.idempotent ? 'Request already pending' : 'Friend request sent' };
  }

  async respondToFriendRequest(requestId: string, accept: boolean): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('respond_to_friend_request', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (error) return { ok: false, message: errMsg(error, 'Could not respond') };
    await Promise.all([this.refreshFriendRequests(), this.refreshFriends()]);
    const r = asRecord(data);
    return { ok: Boolean(r.ok ?? true), message: accept ? 'Friend added' : 'Request declined' };
  }

  async cancelFriendRequest(requestId: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('cancel_friend_request', { p_request_id: requestId });
    if (error) return { ok: false, message: errMsg(error, 'Cancel failed') };
    await this.refreshFriendRequests();
    return { ok: true, message: 'Request cancelled' };
  }

  async removeFriend(friendId: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('remove_friend', { p_friend_id: friendId });
    if (error) return { ok: false, message: errMsg(error, 'Remove failed') };
    await this.refreshFriends();
    return { ok: true, message: 'Friend removed' };
  }

  async blockPlayer(playerId: string, reason?: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('block_player', {
      p_blocked_id: playerId,
      p_reason: reason ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Block failed') };
    await Promise.all([this.refreshBlocks(), this.refreshFriends(), this.refreshConversations()]);
    return { ok: true, message: 'Player blocked' };
  }

  async unblockPlayer(playerId: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('unblock_player', { p_blocked_id: playerId });
    if (error) return { ok: false, message: errMsg(error, 'Unblock failed') };
    await this.refreshBlocks();
    return { ok: true, message: 'Player unblocked (friendship not restored)' };
  }

  async getOrCreateConversation(otherId: string): Promise<{ ok: boolean; conversationId?: string; message?: string; messagePolicy?: string }> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('get_or_create_direct_conversation', { p_other_id: otherId });
    if (error) return { ok: false, message: errMsg(error, 'Could not open conversation') };
    const r = asRecord(data);
    return {
      ok: Boolean(r.ok),
      conversationId: r.conversationId as string | undefined,
      messagePolicy: r.messagePolicy as string | undefined,
    };
  }

  async getMessages(conversationId: string, limit = 50, before?: string): Promise<DirectMessageView[]> {
    const gate = this.requireAuth();
    if (gate || !supabase) return [];
    const { data, error } = await supabase.rpc('get_conversation_messages', {
      p_conversation_id: conversationId,
      p_limit: limit,
      p_before: before ?? null,
    });
    if (error || !data) return [];
    const rows = (asRecord(data).messages as Record<string, unknown>[] | undefined) ?? [];
    return rows.map((r) => ({
      id: String(r.id),
      senderId: String(r.senderId),
      body: String(r.body ?? ''),
      status: String(r.status ?? 'sent'),
      moderationState: r.moderationState as string | undefined,
      editedAt: (r.editedAt ?? null) as string | null,
      createdAt: String(r.createdAt),
      clientMessageId: r.clientMessageId as string | undefined,
      messageType: r.messageType as string | undefined,
    }));
  }

  async sendDirectMessage(
    conversationId: string,
    body: string,
    clientMessageId: string,
    replyTo?: string,
  ): Promise<SocialOk & { messageId?: string; state?: string; notice?: string }> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('send_direct_message', {
      p_conversation_id: conversationId,
      p_client_message_id: clientMessageId,
      p_body: body,
      p_reply_to: replyTo ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Send failed') };
    const r = asRecord(data);
    if (r.ok === false) {
      return {
        ok: false,
        message: String(r.reason ?? 'Message rejected'),
        state: r.state as string | undefined,
      };
    }
    await Promise.all([this.refreshConversations(), this.refreshUnreadCount()]);
    return {
      ok: true,
      messageId: r.messageId as string | undefined,
      state: r.state as string | undefined,
      notice: r.notice as string | undefined,
      message: r.state === 'held' ? String(r.notice ?? 'Held for review') : 'Sent',
    };
  }

  async markRead(conversationId: string, messageId?: string): Promise<void> {
    if (!supabase || !this.userId) return;
    await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_message_id: messageId ?? null,
    });
    await this.refreshUnreadCount();
    await this.refreshConversations();
  }

  async deleteMessage(messageId: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('delete_direct_message', { p_message_id: messageId });
    if (error) return { ok: false, message: errMsg(error, 'Delete failed') };
    return { ok: true, message: 'Message deleted' };
  }

  async createMessageRequest(recipientId: string, body: string, clientMessageId: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('create_message_request', {
      p_recipient_id: recipientId,
      p_body: body,
      p_client_message_id: clientMessageId,
    });
    if (error) return { ok: false, message: errMsg(error, 'Message request failed') };
    const r = asRecord(data);
    return { ok: Boolean(r.ok ?? true), message: 'Message request sent' };
  }

  async updatePrivacySettings(settings: PrivacySettingsPatch): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('update_privacy_settings', { p_settings: settings });
    if (error) return { ok: false, message: errMsg(error, 'Privacy update failed') };
    return { ok: true, message: 'Privacy settings saved' };
  }

  async loadPrivacySettings(): Promise<PrivacySettingsPatch | null> {
    if (!supabase || !this.userId) return null;
    const { data, error } = await supabase
      .from('player_profile_settings')
      .select('*')
      .eq('player_id', this.userId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return {
      profile_visibility: r.profile_visibility as PrivacySettingsPatch['profile_visibility'],
      friend_request_policy: r.friend_request_policy as PrivacySettingsPatch['friend_request_policy'],
      message_policy: r.message_policy as PrivacySettingsPatch['message_policy'],
      presence_visibility: r.presence_visibility as PrivacySettingsPatch['presence_visibility'],
      show_level: Boolean(r.show_level),
      show_rank: Boolean(r.show_rank),
      show_equipped_title: Boolean(r.show_equipped_title),
      show_online_status: Boolean(r.show_online_status),
      allow_profile_search: Boolean(r.allow_profile_search),
    };
  }

  async reportPlayer(playerId: string, category: ReportCategory, description?: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('report_player', {
      p_player_id: playerId,
      p_category: category,
      p_description: description ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Report failed') };
    return { ok: true, message: 'Report submitted' };
  }

  async reportMessage(messageId: string, category: ReportCategory, description?: string): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('report_message', {
      p_message_id: messageId,
      p_category: category,
      p_description: description ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Report failed') };
    return { ok: true, message: 'Message reported' };
  }

  /** Debounced presence heartbeat — never exposes coordinates to profile APIs. */
  async heartbeatPresence(opts?: {
    status?: string;
    activity?: string;
    districtId?: string;
  }): Promise<void> {
    if (!supabase || !this.userId) return;
    const now = Date.now();
    if (now - this.lastHeartbeatAt < 25_000) return;
    this.lastHeartbeatAt = now;
    await supabase.rpc('heartbeat_presence', {
      p_status: opts?.status ?? 'online',
      p_activity: opts?.activity ?? null,
      p_district_id: opts?.districtId ?? null,
      p_session_id: null,
    });
  }

  async getVisiblePresence(playerIds: string[]): Promise<Record<string, string>> {
    if (!supabase || playerIds.length === 0) return {};
    const uuids = playerIds.filter((id) => !id.startsWith('guest_'));
    if (uuids.length === 0) return {};
    const { data, error } = await supabase.rpc('get_visible_presence', { p_player_ids: uuids });
    if (error || !data) return {};
    const rows = (asRecord(data).presence as Record<string, unknown>[] | undefined) ?? [];
    const out: Record<string, string> = {};
    for (const r of rows) {
      out[String(r.playerId)] = String(r.status ?? 'offline');
    }
    return out;
  }

  async isSocialOperator(): Promise<{ operator: boolean; role: string | null }> {
    if (!supabase || !this.userId) return { operator: false, role: null };
    const { data, error } = await supabase
      .from('social_operators')
      .select('role, active')
      .eq('player_id', this.userId)
      .eq('active', true)
      .maybeSingle();
    if (error || !data) return { operator: false, role: null };
    return { operator: true, role: String((data as { role: string }).role) };
  }

  async getModerationDashboard(): Promise<ModerationDashboard | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_moderation_dashboard');
    if (error || !data) return null;
    return asRecord(data) as ModerationDashboard;
  }

  async listOpenCases(limit = 50): Promise<ModerationCaseRow[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('list_open_moderation_cases', { p_limit: limit });
    if (error || !data) return [];
    const rows = (asRecord(data).cases as Record<string, unknown>[] | undefined) ?? [];
    return rows.map((r) => ({
      id: String(r.id),
      subjectPlayerId: String(r.subjectPlayerId ?? r.subject_player_id),
      category: String(r.category ?? ''),
      priority: String(r.priority ?? 'normal'),
      status: String(r.status ?? 'open'),
      openedAt: String(r.openedAt ?? r.opened_at ?? ''),
    }));
  }

  async applyModerationAction(opts: {
    target: string;
    actionType: string;
    reasonCode: string;
    reasonSafe: string;
    caseId?: string;
    durationHours?: number;
  }): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('apply_moderation_action', {
      p_target: opts.target,
      p_action_type: opts.actionType,
      p_reason_code: opts.reasonCode,
      p_reason_safe: opts.reasonSafe,
      p_case_id: opts.caseId ?? null,
      p_duration_hours: opts.durationHours ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Action failed') };
    return { ok: true, message: 'Moderation action applied' };
  }

  async runMaintenance(): Promise<SocialOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('run_social_maintenance');
    if (error) return { ok: false, message: errMsg(error, 'Maintenance failed') };
    return { ok: true, message: 'Social maintenance complete' };
  }
}

export const socialService = new SocialService();
