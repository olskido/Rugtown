/**
 * Phase 10J social types — server RPC shapes only.
 * Private fields (email, wallet, auth provider) are never represented here.
 */

export type SocialOk = { ok: boolean; message?: string; reason?: string };

export interface FriendshipState {
  friends: boolean;
  blocked: boolean;
  pendingOutgoing: boolean;
  pendingIncoming: boolean;
}

export interface PublicPlayerProfile {
  ok: boolean;
  restricted?: boolean;
  playerId?: string;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  level?: number | null;
  equippedTitle?: string | null;
  joinedMonth?: string | null;
  relationship?: string;
  onlineStatus?: string | null;
}

export interface FriendRow {
  friendshipId: string;
  playerId: string;
  username: string;
  displayName?: string | null;
  since: string;
}

export interface FriendRequestIncoming {
  id: string;
  senderId: string;
  username: string;
  message?: string | null;
  createdAt: string;
}

export interface FriendRequestOutgoing {
  id: string;
  recipientId: string;
  username: string;
  createdAt: string;
}

export interface BlockRow {
  blockedId: string;
  username: string;
  createdAt: string;
}

export interface ConversationSummary {
  conversationId: string;
  otherPlayerId: string;
  username: string;
  lastMessageAt: string | null;
  isMuted: boolean;
  isArchived: boolean;
  unread: number;
}

export interface DirectMessageView {
  id: string;
  senderId: string;
  body: string;
  status: string;
  moderationState?: string;
  editedAt?: string | null;
  createdAt: string;
  clientMessageId?: string;
  messageType?: string;
}

export interface PrivacySettingsPatch {
  profile_visibility?: 'public' | 'friends_only' | 'private';
  friend_request_policy?: 'everyone' | 'friends_of_friends' | 'nobody';
  message_policy?: 'everyone' | 'friends_only' | 'requests' | 'nobody';
  presence_visibility?: 'everyone' | 'friends' | 'nobody';
  show_level?: boolean;
  show_rank?: boolean;
  show_equipped_title?: boolean;
  show_online_status?: boolean;
  allow_profile_search?: boolean;
}

export interface SearchPlayerHit {
  playerId: string;
  username: string;
  displayName?: string | null;
}

export interface ModerationCaseRow {
  id: string;
  subjectPlayerId: string;
  category: string;
  priority: string;
  status: string;
  openedAt: string;
}

export interface ModerationDashboard {
  openCases?: number;
  openReports?: number;
  heldMessages?: number;
  messagesToday?: number;
  reportsToday?: number;
  blocksToday?: number;
}

export const REPORT_CATEGORIES = [
  'spam',
  'scam',
  'harassment',
  'hate',
  'impersonation',
  'inappropriate_username',
  'inappropriate_profile',
  'cheating',
  'exploit_abuse',
  'suspicious_wallet_request',
  'other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
