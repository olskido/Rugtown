/**
 * retry-reward-settlement
 * Safely re-drives a failed settlement. Never blindly retries a transfer:
 * if a signature already exists it re-verifies rather than re-submitting.
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
    await requireOperator(ctx, 'admin');
    const body = await parseJson<{ settlementId: string }>(req);
    const settlementId = requireString(body.settlementId, 'settlementId', 64);

    const { data: settlement, error } = await ctx.admin
      .from('reward_settlements')
      .select('*')
      .eq('id', settlementId)
      .maybeSingle();
    if (error || !settlement) throw new HandledError('not_found', 'Settlement not found', 404);

    if (settlement.status === 'finalized' || settlement.status === 'confirmed') {
      return jsonResponse(req, { ok: true, idempotent: true, action: 'already_settled', settlement });
    }

    // If a signature exists, the correct action is re-verification, not resubmit.
    if (settlement.transaction_signature) {
      await ctx.admin
        .from('reward_settlements')
        .update({ status: 'submitted', error_code: null, error_message_safe: null, updated_at: new Date().toISOString() })
        .eq('id', settlementId);
      return jsonResponse(req, {
        ok: true,
        action: 'reverify_required',
        note: 'Signature exists; call verify-reward-settlement to re-check chain state.',
      });
    }

    // No signature: reset to prepared for a fresh manual submission.
    await ctx.admin
      .from('reward_settlements')
      .update({
        status: 'prepared',
        error_code: null,
        error_message_safe: null,
        attempt_count: (settlement.attempt_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId);
    await ctx.admin.from('claimable_rewards').update({ claim_state: 'settlement_preparing' }).eq('id', settlement.claim_id);
    await auditClaim(ctx.admin, settlement.claim_id, 'failed', 'settlement_preparing', 'reconciler', ctx.userId, 'retry reset');

    return jsonResponse(req, { ok: true, action: 'reset_to_prepared' });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
