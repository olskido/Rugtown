/**
 * SettlementAdapter.ts — Phase 10G boundary for future Solana settlement.
 * No real transfers. No treasury keys. No fake signatures.
 */

import type { ClaimableReward, ClaimStatus } from './types';

export interface PrepareClaimResult {
  ok: boolean;
  claimId: string;
  nextStatus: ClaimStatus;
  message: string;
}

export interface SubmitClaimResult {
  ok: boolean;
  claimId: string;
  nextStatus: ClaimStatus;
  message: string;
  /** Never fabricated for real assets. */
  transactionSignature?: string;
}

export interface VerifySettlementResult {
  verified: boolean;
  status: ClaimStatus;
  message: string;
}

/**
 * Future Solana / SPL settlement adapter.
 *
 * Required before real payouts (Phase 11+):
 * - treasury custody / multisig
 * - rate limits + emergency pause
 * - transaction simulation
 * - RPC reliability + confirmation handling
 * - replay prevention + failure reconciliation
 * - audit logs
 * - never store treasury private keys in the frontend
 */
export interface RewardSettlementAdapter {
  prepareClaim(claim: ClaimableReward): Promise<PrepareClaimResult>;
  submitClaim(claim: ClaimableReward): Promise<SubmitClaimResult>;
  verifySettlement(claim: ClaimableReward): Promise<VerifySettlementResult>;
  getTransactionStatus(signature: string): Promise<'unknown' | 'pending' | 'confirmed' | 'failed'>;
}

/** Development / Phase 10G no-op adapter — never marks SOL/SPL completed. */
export class NoopSettlementAdapter implements RewardSettlementAdapter {
  async prepareClaim(claim: ClaimableReward): Promise<PrepareClaimResult> {
    if (claim.rewardAsset === 'SOL' || claim.rewardAsset === 'SPL') {
      return {
        ok: false,
        claimId: claim.id,
        nextStatus: claim.status,
        message: 'Real asset settlement is not enabled in Phase 10G.',
      };
    }
    return {
      ok: true,
      claimId: claim.id,
      nextStatus: 'reserved',
      message: 'Development claim reserved (no chain transfer).',
    };
  }

  async submitClaim(claim: ClaimableReward): Promise<SubmitClaimResult> {
    if (claim.rewardAsset === 'SOL' || claim.rewardAsset === 'SPL') {
      return {
        ok: false,
        claimId: claim.id,
        nextStatus: claim.status,
        message: 'Cannot submit real asset claim without settlement backend.',
      };
    }
    return {
      ok: true,
      claimId: claim.id,
      nextStatus: 'processing',
      message: 'Development processing — no transaction signature issued.',
    };
  }

  async verifySettlement(claim: ClaimableReward): Promise<VerifySettlementResult> {
    if (claim.rewardAsset === 'SOL' || claim.rewardAsset === 'SPL') {
      return {
        verified: false,
        status: 'failed',
        message: 'Settlement verification requires on-chain evidence.',
      };
    }
    return {
      verified: true,
      status: 'completed',
      message: 'Development non-chain reward completed locally via RPC.',
    };
  }

  async getTransactionStatus(_signature: string) {
    return 'unknown' as const;
  }
}

export const settlementAdapter: RewardSettlementAdapter = new NoopSettlementAdapter();
