/**
 * verify-reward-settlement
 * Independently verifies a submitted transaction on-chain and, only on success,
 * advances the settlement to confirmed/finalized and the claim to completed.
 */

import { authenticate, requireOperator } from '../_shared/auth.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, HandledError } from '../_shared/errors.ts';
import { parseJson, requireString } from '../_shared/validation.ts';
import { loadSettlementEnv } from '../_shared/env.ts';
import { loadSettlementConfig, auditClaim } from '../_shared/settlement.ts';
import { verifyTransaction } from '../_shared/solana.ts';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const ctx = await authenticate(req);
    await requireOperator(ctx, 'reviewer');
    const env = loadSettlementEnv();
    const body = await parseJson<{ settlementId: string }>(req);
    const settlementId = requireString(body.settlementId, 'settlementId', 64);

    const { data: settlement, error } = await ctx.admin
      .from('reward_settlements')
      .select('*')
      .eq('id', settlementId)
      .maybeSingle();
    if (error || !settlement) throw new HandledError('not_found', 'Settlement not found', 404);
    if (!settlement.transaction_signature) {
      throw new HandledError('no_signature', 'No transaction signature to verify', 400);
    }
    if (settlement.status === 'finalized' || settlement.status === 'confirmed') {
      return jsonResponse(req, { ok: true, idempotent: true, settlement });
    }

    // Non-chain assets are verified/delivered by the RPC layer, not here.
    if (settlement.asset_type !== 'SOL' && settlement.asset_type !== 'SPL') {
      throw new HandledError('not_applicable', 'On-chain verification only for SOL/SPL', 400);
    }

    const config = await loadSettlementConfig(ctx.admin);
    const { data: claim } = await ctx.admin
      .from('claimable_rewards')
      .select('id, created_at, reward_asset')
      .eq('id', settlement.claim_id)
      .maybeSingle();
    const approvedAtMs = claim ? new Date(claim.created_at).getTime() : Date.now() - 3600_000;

    const result = await verifyTransaction({
      rpcEndpoint: env.rpcEndpoint,
      signature: settlement.transaction_signature,
      expectedDestination: settlement.wallet_address,
      expectedAmountAtomic: Number(settlement.amount_atomic),
      assetType: settlement.asset_type,
      expectedMint: settlement.mint_address ?? undefined,
      expectedDecimals: settlement.decimals,
      minConfirmation: (config.min_confirmations ?? 'finalized') as 'processed' | 'confirmed' | 'finalized',
      approvedAtMs,
      verificationWindowMs: (config.verification_window_s ?? 3600) * 1000,
    });

    if (!result.verified) {
      await ctx.admin
        .from('reward_settlements')
        .update({
          status: 'failed',
          error_code: result.reasonCode,
          error_message_safe: result.reasonSafe,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settlementId);
      await ctx.admin.from('claimable_rewards').update({ claim_state: 'failed', status: 'failed' }).eq('id', settlement.claim_id);
      await auditClaim(ctx.admin, settlement.claim_id, 'settlement_confirming', 'failed', 'reconciler', ctx.userId, result.reasonSafe);
      throw new HandledError('verification_failed', result.reasonSafe ?? 'Verification failed', 400);
    }

    const { data: updated } = await ctx.admin
      .from('reward_settlements')
      .update({
        status: 'finalized',
        transaction_slot: result.slot ?? null,
        block_time: result.blockTimeMs ? new Date(result.blockTimeMs).toISOString() : null,
        confirmation_status: result.confirmationStatus,
        confirmed_at: new Date().toISOString(),
        finalized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId)
      .select('*')
      .single();

    await ctx.admin
      .from('claimable_rewards')
      .update({ claim_state: 'completed', status: 'completed', claimed_at: new Date().toISOString() })
      .eq('id', settlement.claim_id);
    await auditClaim(ctx.admin, settlement.claim_id, 'settlement_confirming', 'completed', 'reconciler', ctx.userId, 'verified on-chain');

    await ctx.admin.rpc('rt_notify', {
      p_player: settlement.player_id,
      p_type: 'settlement_completed',
      p_title: 'Reward settled',
      p_message: 'Your reward transaction has been verified on-chain.',
      p_icon: 'check',
      p_metadata: { signature: settlement.transaction_signature },
    });

    return jsonResponse(req, { ok: true, settlement: updated });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
