/**
 * revoke-verified-wallet
 * Marks a verified wallet as revoked. Historical settlement records preserved.
 */

import { authenticate } from '../_shared/auth.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, HandledError } from '../_shared/errors.ts';
import { parseJson, requireString } from '../_shared/validation.ts';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const ctx = await authenticate(req);
    const body = await parseJson<{ walletId: string }>(req);
    const walletId = requireString(body.walletId, 'walletId', 64);

    const { data, error } = await ctx.admin
      .from('verified_wallets')
      .update({ revoked_at: new Date().toISOString(), is_primary: false, updated_at: new Date().toISOString() })
      .eq('id', walletId)
      .eq('player_id', ctx.userId)
      .is('revoked_at', null)
      .select('id, wallet_address, revoked_at')
      .maybeSingle();
    if (error) throw new HandledError('db_error', 'Could not revoke wallet', 500);
    if (!data) throw new HandledError('not_found', 'Wallet not found or already revoked', 404);

    return jsonResponse(req, { ok: true, wallet: data });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
