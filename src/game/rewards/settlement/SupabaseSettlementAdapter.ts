/**
 * SupabaseSettlementAdapter.ts — production settlement client.
 * Calls Supabase Edge Functions for wallet verification and settlement.
 * The browser NEVER decides success; all verification is server-side.
 */

import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import type { ClaimableReward } from '../types';
import type {
  PrepareClaimResult,
  SubmitClaimResult,
  VerifySettlementResult,
  RewardSettlementAdapter,
} from './SettlementAdapter';
import type { VerifiedWalletView, WalletChallengeView } from './SettlementTypes';

interface EdgeResult<T> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<EdgeResult<T>> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Supabase not configured', code: 'not_configured' };
  }
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) return { ok: false, error: error.message, code: 'invoke_error' };
  const payload = data as Record<string, unknown>;
  if (payload && payload.ok === false) {
    return { ok: false, error: String(payload.error ?? 'error'), code: String(payload.code ?? 'error') };
  }
  return { ok: true, data: payload as T };
}

export class SupabaseSettlementAdapter implements RewardSettlementAdapter {
  async requestWalletChallenge(
    walletAddress: string,
  ): Promise<{ ok: boolean; challenge?: WalletChallengeView; message: string }> {
    const res = await invoke<{ challenge: Record<string, unknown> }>(
      'create-wallet-verification-challenge',
      { walletAddress },
    );
    if (!res.ok || !res.data) return { ok: false, message: res.error ?? 'Challenge failed' };
    const c = res.data.challenge;
    return {
      ok: true,
      message: 'Challenge issued',
      challenge: {
        id: String(c.id),
        nonce: String(c.nonce),
        message: String(c.message),
        expiresAt: String(c.expires_at),
      },
    };
  }

  async verifyWalletSignature(
    challengeId: string,
    signatureBase58: string,
  ): Promise<{ ok: boolean; wallet?: VerifiedWalletView; message: string }> {
    const res = await invoke<{ wallet: Record<string, unknown> }>('verify-wallet-signature', {
      challengeId,
      signatureBase58,
    });
    if (!res.ok || !res.data) return { ok: false, message: res.error ?? 'Verification failed' };
    const w = res.data.wallet;
    return {
      ok: true,
      message: 'Wallet verified',
      wallet: {
        id: String(w.id),
        walletAddress: String(w.wallet_address),
        verifiedAt: String(w.verified_at),
        isPrimary: Boolean(w.is_primary),
        revokedAt: null,
      },
    };
  }

  async revokeWallet(walletId: string): Promise<{ ok: boolean; message: string }> {
    const res = await invoke('revoke-verified-wallet', { walletId });
    return { ok: res.ok, message: res.ok ? 'Wallet revoked' : (res.error ?? 'Revoke failed') };
  }

  // ─── RewardSettlementAdapter (production, operator-driven) ─────────
  async prepareClaim(claim: ClaimableReward): Promise<PrepareClaimResult> {
    const res = await invoke('prepare-reward-settlement', { claimId: claim.id });
    return {
      ok: res.ok,
      claimId: claim.id,
      nextStatus: res.ok ? 'reserved' : claim.status,
      message: res.ok ? 'Settlement prepared (server).' : (res.error ?? 'Preparation failed'),
    };
  }

  async submitClaim(claim: ClaimableReward): Promise<SubmitClaimResult> {
    // Real submission is operator-driven (out-of-band tx + submit-reward-settlement).
    return {
      ok: false,
      claimId: claim.id,
      nextStatus: claim.status,
      message: 'Real-asset submission requires operator settlement flow.',
    };
  }

  async verifySettlement(claim: ClaimableReward): Promise<VerifySettlementResult> {
    return {
      verified: false,
      status: claim.status,
      message: 'Verification handled server-side via verify-reward-settlement.',
    };
  }

  async getTransactionStatus(_signature: string) {
    return 'unknown' as const;
  }
}

export const supabaseSettlementAdapter = new SupabaseSettlementAdapter();
