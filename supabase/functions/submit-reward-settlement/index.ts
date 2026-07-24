/**
 * submit-reward-settlement
 * Records an externally/manually submitted transaction signature against a
 * prepared settlement. In manual_review/multisig modes the signature comes from
 * an operator who executed the transfer out-of-band. This function DOES NOT sign
 * or broadcast transactions and never holds keys.
 */

import { authenticate, requireOperator } from '../_shared/auth.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, HandledError } from '../_shared/errors.ts';
import { parseJson, requireString } from '../_shared/validation.ts';
import { auditClaim } from '../_shared/settlement.ts';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const ctx = await authenticate(req);
    await requireOperator(ctx, 'reviewer');
    const body = await parseJson<{ settlementId: string; transactionSignature: string }>(req);
    const settlementId = requireString(body.settlementId, 'settlementId', 64);
    const signature = requireString(body.transactionSignature, 'transactionSignature', 128);

    const { data: settlement, error } = await ctx.admin
      .from('reward_settlements')
      .select('*')
      .eq('id', settlementId)
      .maybeSingle();
    if (error || !settlement) throw new HandledError('not_found', 'Settlement not found', 404);
    if (settlement.status !== 'prepared') {
      throw new HandledError('invalid_state', 'Settlement must be prepared', 400);
    }

    // Reject a signature already used by another settlement
    const { data: dupe } = await ctx.admin
      .from('reward_settlements')
      .select('id')
      .eq('transaction_signature', signature)
      .neq('id', settlementId)
      .maybeSingle();
    if (dupe) throw new HandledError('duplicate_signature', 'Signature already used', 409);

    const { data: updated, error: uErr } = await ctx.admin
      .from('reward_settlements')
      .update({
        status: 'submitted',
        transaction_signature: signature,
        submitted_at: new Date().toISOString(),
        attempt_count: (settlement.attempt_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId)
      .select('*')
      .single();
    if (uErr) throw new HandledError('db_error', 'Could not record submission', 500);

    await ctx.admin
      .from('claimable_rewards')
      .update({ claim_state: 'settlement_submitted' })
      .eq('id', settlement.claim_id);
    await auditClaim(
      ctx.admin, settlement.claim_id, 'settlement_preparing', 'settlement_submitted',
      'operator', ctx.userId, 'signature recorded',
    );

    return jsonResponse(req, { ok: true, settlement: updated });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
