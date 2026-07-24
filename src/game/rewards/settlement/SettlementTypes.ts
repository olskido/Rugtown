/**
 * SettlementTypes.ts — Phase 10H settlement + claim/wallet client types.
 * Mirrors server enums. No secrets, no key material.
 */

export type SettlementMode = 'disabled' | 'manual_review' | 'multisig' | 'automated';

export type ClaimState =
  | 'created'
  | 'eligibility_pending'
  | 'eligible'
  | 'ineligible'
  | 'awaiting_wallet'
  | 'awaiting_review'
  | 'approved'
  | 'settlement_preparing'
  | 'settlement_submitted'
  | 'settlement_confirming'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type SettlementState =
  | 'not_started'
  | 'prepared'
  | 'submitted'
  | 'processed'
  | 'confirmed'
  | 'finalized'
  | 'failed'
  | 'reversed'
  | 'manual_intervention';

export type FundingState =
  | 'unfunded'
  | 'verification_pending'
  | 'verified'
  | 'partially_funded'
  | 'insufficient'
  | 'expired'
  | 'test_only';

export interface VerifiedWalletView {
  id: string;
  walletAddress: string;
  verifiedAt: string;
  isPrimary: boolean;
  revokedAt: string | null;
}

export interface WalletChallengeView {
  id: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface RewardSettlementView {
  id: string;
  claimId: string;
  assetType: string;
  amountAtomic: number;
  decimals: number;
  network: string;
  settlementMode: SettlementMode;
  status: SettlementState;
  transactionSignature: string | null;
  errorMessageSafe: string | null;
  updatedAt: string;
}

export interface PlayerNotificationView {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface RewardSystemHealth {
  tables: Record<string, boolean>;
  rpcs: Record<string, boolean>;
  hasActiveSeason: boolean;
  rewardDefinitions: number;
  missionDefinitions: number;
  ledgerRows: number;
  pendingClaims: number;
  failedClaims: number;
  settlementMode: SettlementMode;
  settlementConfigured: boolean;
  lastSettlementAt: string | null;
}
