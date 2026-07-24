/**
 * prepare-reward-settlement
 * Server-side preparation of a settlement record for an approved claim.
 * Creates a reward_settlements row in `prepared` state. Never moves funds.
 */

import { authenticate, requireOperator } from '../_shared/auth.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, HandledError } from '../_shared/errors.ts';
import { parseJson, requireString } from '../_shared/validation.ts';
import { loadSettlementConfig, auditClaim } from '../_shared/settlement.ts';
import { settlementIdempotencyKey } from '../_shared/idempotency.ts';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const ctx = await authenticate(req);
    await requireOperator(ctx, 'reviewer');
    const body = await parseJson<{ claimId: string }>(req);
    const claimId = requireString(body.claimId, 'claimId', 64);

    const { data: claim, error: cErr } = await ctx.admin
      .from('claimable_rewards')
      .select('*')
      .eq('id', claimId)
      .maybeSingle();
    if (cErr || !claim) throw new HandledError('not_found', 'Claim not found', 404);
    if (claim.claim_state !== 'approved') {
      throw new HandledError('invalid_state', 'Claim must be approved before preparation', 400);
    }

    const config = await loadSettlementConfig(ctx.admin);
    if (config.mode === 'disabled') {
      throw new HandledError('settlement_disabled', 'Settlement is disabled', 400);
    }

    // Resolve verified wallet at claim time for real assets
    let walletAddress: string | null = null;
    if (claim.reward_asset === 'SOL' || claim.reward_asset === 'SPL') {
      const { data: wallet } = await ctx.admin
        .from('verified_wallets')
        .select('wallet_address')
        .eq('id', claim.verified_wallet_id)
        .is('revoked_at', null)
        .maybeSingle();
      if (!wallet) throw new HandledError('no_wallet', 'Claim has no verified wallet', 400);
      walletAddress = wallet.wallet_address;
    }

    const attempt = 0;
    const idempotencyKey = settlementIdempotencyKey(claimId, attempt);
    const { data: settlement, error: sErr } = await ctx.admin
      .from('reward_settlements')
      .upsert(
        {
          claim_id: claimId,
          player_id: claim.player_id,
          wallet_address: walletAddress,
          asset_type: claim.reward_asset ?? 'NONE',
          amount_atomic: claim.amount_atomic ?? 0,
          decimals: claim.decimals ?? 0,
          network: config.network,
          settlement_mode: config.mode,
          status: 'prepared',
          idempotency_key: idempotencyKey,
          prepared_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'idempotency_key' },
      )
      .select('*')
      .single();
    if (sErr) throw new HandledError('db_error', 'Could not prepare settlement', 500);

    await ctx.admin
      .from('claimable_rewards')
      .update({ claim_state: 'settlement_preparing' })
      .eq('id', claimId);
    await auditClaim(ctx.admin, claimId, 'approved', 'settlement_preparing', 'operator', ctx.userId, 'prepared');

    return jsonResponse(req, { ok: true, settlement });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
