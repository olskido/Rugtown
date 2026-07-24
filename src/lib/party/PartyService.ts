/**
 * PartyService — Phase 10K client boundary for parties, party chat,
 * shared missions, and TEST matchmaking. Guests get no mutations.
 */

import { supabase, isSupabaseConfigured } from '../supabase';

export interface PartyPermissions {
  invite?: boolean;
  approve_join?: boolean;
  remove_member?: boolean;
  transfer_leadership?: boolean;
  update_settings?: boolean;
  queue?: boolean;
  disband?: boolean;
  chat?: boolean;
  ready?: boolean;
  canManage?: boolean;
  canDisband?: boolean;
  role?: string;
}

export interface PartyMemberView {
  memberId?: string;
  playerId: string;
  username?: string;
  role: string;
  status: string;
  readyState?: string;
  joinedAt?: string;
}

export interface PartyView {
  id: string;
  name: string;
  status: string;
  visibility?: string;
  joinPolicy?: string;
  maxMembers?: number;
  leaderId?: string;
  memberCount?: number;
  description?: string | null;
}

export interface PartyInvitationView {
  id: string;
  partyId: string;
  partyName?: string;
  senderId?: string;
  senderUsername?: string;
  recipientId?: string;
  recipientUsername?: string;
  message?: string | null;
  createdAt?: string;
  expiresAt?: string;
}

export interface PartyChatMessage {
  id: string;
  party_id?: string;
  sender_id: string;
  body?: string;
  safe_body?: string;
  status: string;
  message_type?: string;
  created_at: string;
  client_message_id?: string;
}

export interface PartyMissionState {
  mission?: Record<string, unknown> | null;
  members?: Record<string, unknown>[];
  progressValue?: number;
  progressTarget?: number;
  status?: string;
}

export type PartyOk = { ok: boolean; message?: string; partyId?: string; [k: string]: unknown };

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

function errMsg(error: { message?: string } | null, fallback: string): string {
  return error?.message?.trim() || fallback;
}

class PartyService {
  private userId: string | null = null;
  private party: PartyView | null = null;
  private members: PartyMemberView[] = [];
  private permissions: PartyPermissions = {};
  private invitationsIncoming: PartyInvitationView[] = [];
  private invitationsOutgoing: PartyInvitationView[] = [];
  private unreadChat = 0;
  private listeners = new Set<() => void>();
  private realtime: { unsubscribe?: () => void } | null = null;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  getParty(): PartyView | null { return this.party; }
  getMembers(): PartyMemberView[] { return this.members; }
  getPermissions(): PartyPermissions { return this.permissions; }
  getIncomingInvitations(): PartyInvitationView[] { return this.invitationsIncoming; }
  getOutgoingInvitations(): PartyInvitationView[] { return this.invitationsOutgoing; }
  getUnreadChatCount(): number { return this.unreadChat; }
  isInParty(): boolean { return !!this.party; }

  private requireAuth(): PartyOk | null {
    if (!this.userId || !isSupabaseConfigured || !supabase) {
      return { ok: false, message: 'Sign in required for parties.' };
    }
    return null;
  }

  async initForAuthenticatedUser(userId: string): Promise<void> {
    this.userId = userId;
    if (!isSupabaseConfigured || !supabase) return;
    await Promise.all([this.refreshParty(), this.refreshInvitations(), this.refreshUnread()]);
    this.subscribeRealtime(userId);
    this.notify();
  }

  clear(): void {
    this.userId = null;
    this.party = null;
    this.members = [];
    this.permissions = {};
    this.invitationsIncoming = [];
    this.invitationsOutgoing = [];
    this.unreadChat = 0;
    this.realtime?.unsubscribe?.();
    this.realtime = null;
    this.notify();
  }

  private subscribeRealtime(userId: string): void {
    if (!supabase) return;
    this.realtime?.unsubscribe?.();
    const client = supabase;
    const channel = client
      .channel(`party:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members' }, () => {
        void this.refreshParty();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_invitations' }, () => {
        void this.refreshInvitations();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_chat_messages' }, () => {
        void this.refreshUnread();
      })
      .subscribe();
    this.realtime = { unsubscribe: () => { void client.removeChannel(channel); } };
  }

  async refreshParty(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_party');
    if (error || data == null || data === 'null') {
      this.party = null;
      this.members = [];
      this.permissions = {};
      this.notify();
      return;
    }
    const r = asRecord(data);
    const partyRaw = r.party;
    if (partyRaw == null) {
      this.party = null;
      this.members = [];
      this.permissions = {};
      this.notify();
      return;
    }
    const partyObj = asRecord(partyRaw);
    if (!partyObj.id) {
      this.party = null;
      this.members = [];
      this.notify();
      return;
    }
    this.party = {
      id: String(partyObj.id),
      name: String(partyObj.name ?? 'Party'),
      status: String(partyObj.status ?? 'active'),
      visibility: partyObj.visibility as string | undefined,
      joinPolicy: (partyObj.joinPolicy ?? partyObj.join_policy) as string | undefined,
      maxMembers: Number(partyObj.maxMembers ?? partyObj.max_members ?? 4),
      leaderId: String(partyObj.leaderId ?? partyObj.leader_id ?? ''),
      memberCount: Number(partyObj.memberCount ?? 0),
      description: (partyObj.description ?? null) as string | null,
    };
    const memberRows = (r.members as Record<string, unknown>[] | undefined) ?? [];
    this.members = memberRows.map((m) => ({
      memberId: m.memberId ? String(m.memberId) : m.id ? String(m.id) : undefined,
      playerId: String(m.playerId ?? m.player_id),
      username: m.username ? String(m.username) : undefined,
      role: String(m.role ?? 'member'),
      status: String(m.status ?? 'active'),
      readyState: String(m.readyState ?? m.ready_state ?? 'not_ready'),
      joinedAt: m.joinedAt ? String(m.joinedAt) : m.joined_at ? String(m.joined_at) : undefined,
    }));
    this.permissions = asRecord(r.permissions ?? {}) as PartyPermissions;
    if (!this.permissions.role) {
      const me = this.members.find((m) => m.playerId === this.userId);
      this.permissions.role = me?.role;
      this.permissions.canManage = me?.role === 'leader' || me?.role === 'officer';
      this.permissions.canDisband = me?.role === 'leader';
      this.permissions.invite = this.permissions.canManage;
      this.permissions.disband = this.permissions.canDisband;
      this.permissions.chat = true;
      this.permissions.ready = true;
      this.permissions.queue = this.permissions.canManage;
    }
    this.notify();
  }

  async refreshInvitations(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_my_party_invitations');
    if (error || !data) return;
    const r = asRecord(data);
    const inc = (r.incoming as Record<string, unknown>[] | undefined) ?? [];
    const out = (r.outgoing as Record<string, unknown>[] | undefined) ?? [];
    this.invitationsIncoming = inc.map((i) => ({
      id: String(i.id),
      partyId: String(i.partyId ?? i.party_id),
      partyName: i.partyName ? String(i.partyName) : undefined,
      senderId: i.senderId ? String(i.senderId) : undefined,
      senderUsername: i.senderUsername ? String(i.senderUsername) : undefined,
      message: (i.message ?? null) as string | null,
      createdAt: i.createdAt ? String(i.createdAt) : undefined,
      expiresAt: i.expiresAt ? String(i.expiresAt) : undefined,
    }));
    this.invitationsOutgoing = out.map((i) => ({
      id: String(i.id),
      partyId: String(i.partyId ?? i.party_id),
      recipientId: i.recipientId ? String(i.recipientId) : undefined,
      recipientUsername: i.recipientUsername ? String(i.recipientUsername) : undefined,
      createdAt: i.createdAt ? String(i.createdAt) : undefined,
    }));
    this.notify();
  }

  async refreshUnread(): Promise<void> {
    if (!supabase || !this.userId) return;
    const { data, error } = await supabase.rpc('get_party_unread_count');
    if (error || !data) return;
    const r = asRecord(data);
    this.unreadChat = Number(r.count ?? data ?? 0);
    this.notify();
  }

  async createParty(name: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('create_party', {
      p_name: name,
      p_idempotency_key: `ui:${Date.now()}`,
    });
    if (error) return { ok: false, message: errMsg(error, 'Create failed') };
    await this.refreshParty();
    const r = asRecord(data);
    return { ok: Boolean(r.ok ?? true), partyId: r.partyId as string | undefined, message: 'Party created' };
  }

  async invitePlayer(recipientId: string, message?: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('invite_player_to_party', {
      p_recipient_id: recipientId,
      p_message: message ?? null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Invite failed') };
    await this.refreshInvitations();
    return { ok: true, message: 'Invitation sent' };
  }

  async respondToInvitation(invitationId: string, accept: boolean): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('respond_to_party_invitation', {
      p_invitation_id: invitationId,
      p_accept: accept,
    });
    if (error) return { ok: false, message: errMsg(error, 'Could not respond') };
    await Promise.all([this.refreshParty(), this.refreshInvitations()]);
    return { ok: true, message: accept ? 'Joined party' : 'Invitation declined' };
  }

  async leaveParty(): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('leave_party');
    if (error) return { ok: false, message: errMsg(error, 'Leave failed') };
    await this.refreshParty();
    return { ok: true, message: 'Left party' };
  }

  async disbandParty(): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('disband_party');
    if (error) return { ok: false, message: errMsg(error, 'Disband failed') };
    await this.refreshParty();
    return { ok: true, message: 'Party disbanded' };
  }

  async removeMember(playerId: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('remove_party_member', { p_member_player_id: playerId });
    if (error) return { ok: false, message: errMsg(error, 'Remove failed') };
    await this.refreshParty();
    return { ok: true, message: 'Member removed' };
  }

  async transferLeadership(playerId: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('transfer_party_leadership', { p_new_leader_id: playerId });
    if (error) return { ok: false, message: errMsg(error, 'Transfer failed') };
    await this.refreshParty();
    return { ok: true, message: 'Leadership transferred' };
  }

  async setReady(ready: boolean): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('set_party_ready_state', { p_ready: ready });
    if (error) return { ok: false, message: errMsg(error, 'Ready update failed') };
    await this.refreshParty();
    return { ok: true, message: ready ? 'Ready' : 'Not ready' };
  }

  async sendChat(body: string, clientMessageId: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    if (!this.party) return { ok: false, message: 'Not in a party' };
    const { data, error } = await supabase!.rpc('send_party_chat_message', {
      p_party_id: this.party.id,
      p_client_message_id: clientMessageId,
      p_body: body,
      p_reply_to: null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Send failed') };
    return { ok: Boolean(asRecord(data).ok ?? true), message: 'Sent' };
  }

  async getChatMessages(limit = 50): Promise<PartyChatMessage[]> {
    if (!supabase || !this.party) return [];
    const { data, error } = await supabase.rpc('get_party_chat_messages', {
      p_party_id: this.party.id,
      p_limit: limit,
      p_before: null,
    });
    if (error || data == null) return [];
    const arr: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [];
    return arr.map((m) => ({
      id: String(m.id),
      sender_id: String(m.sender_id ?? m.senderId),
      body: String(m.safe_body ?? m.body ?? ''),
      safe_body: m.safe_body as string | undefined,
      status: String(m.status ?? 'sent'),
      message_type: m.message_type as string | undefined,
      created_at: String(m.created_at ?? m.createdAt),
      client_message_id: m.client_message_id as string | undefined,
    })).reverse();
  }

  async markChatRead(messageId?: string): Promise<void> {
    if (!supabase || !this.party) return;
    await supabase.rpc('mark_party_chat_read', {
      p_party_id: this.party.id,
      p_message_id: messageId ?? null,
    });
    await this.refreshUnread();
  }

  async heartbeat(districtId?: string): Promise<void> {
    if (!supabase || !this.userId || !this.party) return;
    await supabase.rpc('heartbeat_party_presence', {
      p_district_id: districtId ?? null,
      p_activity_type: null,
    });
  }

  async startTestMission(): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('start_party_shared_mission', {
      p_mission_definition_id: 'test-town-tour-2026',
      p_idempotency_key: `start:${Date.now()}`,
    });
    if (error) return { ok: false, message: errMsg(error, 'Mission start failed (is TEST mission active?)') };
    return { ok: true, message: 'Mission started', ...(asRecord(data) as object) };
  }

  async recordContribution(missionId: string, landmark: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const hash = `landmark:${landmark}:${this.userId}:${missionId}`;
    const { data, error } = await supabase!.rpc('record_party_mission_contribution', {
      p_mission_id: missionId,
      p_contribution_type: landmark,
      p_evidence_hash: hash,
      p_action_receipt_id: null,
      p_value: 1,
    });
    if (error) return { ok: false, message: errMsg(error, 'Contribution failed') };
    return { ok: true, message: 'Contribution recorded', ...(asRecord(data) as object) };
  }

  async completeMission(missionId: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { data, error } = await supabase!.rpc('complete_party_shared_mission', {
      p_mission_id: missionId,
    });
    if (error) return { ok: false, message: errMsg(error, 'Complete failed') };
    return { ok: true, ...(asRecord(data) as object) };
  }

  async getMissionState(): Promise<PartyMissionState | null> {
    if (!supabase || !this.userId) return null;
    const { data, error } = await supabase.rpc('get_party_shared_mission_state');
    if (error || !data) return null;
    return asRecord(data) as PartyMissionState;
  }

  async claimReward(allocationId: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('claim_party_reward', { p_allocation_id: allocationId });
    if (error) return { ok: false, message: errMsg(error, 'Claim failed') };
    return { ok: true, message: 'Reward claimed' };
  }

  async queueParty(): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('queue_party', {
      p_queue_slug: 'test-party-activity-queue',
    });
    if (error) return { ok: false, message: errMsg(error, 'Queue failed (TEST queue must be active)') };
    await this.refreshParty();
    return { ok: true, message: 'Queued (TEST)' };
  }

  async cancelQueue(): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('cancel_party_queue');
    if (error) return { ok: false, message: errMsg(error, 'Cancel failed') };
    return { ok: true, message: 'Queue cancelled' };
  }

  async reportParty(category: string, description?: string, reportedPlayerId?: string): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    if (!this.party) return { ok: false, message: 'Not in a party' };
    const { error } = await supabase!.rpc('report_party', {
      p_party_id: this.party.id,
      p_category: category,
      p_description: description ?? null,
      p_reported_player_id: reportedPlayerId ?? null,
      p_message_id: null,
    });
    if (error) return { ok: false, message: errMsg(error, 'Report failed') };
    return { ok: true, message: 'Report submitted' };
  }

  async getOpsDashboard(): Promise<Record<string, unknown> | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_party_ops_dashboard');
    if (error || !data) return null;
    return asRecord(data);
  }

  async runMaintenance(): Promise<PartyOk> {
    const gate = this.requireAuth();
    if (gate) return gate;
    const { error } = await supabase!.rpc('run_party_maintenance');
    if (error) return { ok: false, message: errMsg(error, 'Maintenance failed') };
    return { ok: true, message: 'Party maintenance complete' };
  }
}

export const partyService = new PartyService();
