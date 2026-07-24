/**
 * close-season
 * Operator-only: closes scoring and finalizes a season idempotently via the
 * finalize_season RPC (which snapshots standings). No reward transfers here.
 */

import { authenticate, requireOperator } from '../_shared/auth.ts';
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
    await requireOperator(ctx, 'admin');
    const body = await parseJson<{ seasonId: string }>(req);
    const seasonId = requireString(body.seasonId, 'seasonId', 64);

    const { data, error } = await ctx.admin.rpc('finalize_season', { p_season_id: seasonId });
    if (error) throw new HandledError('finalize_failed', error.message, 400);

    return jsonResponse(req, { ok: true, result: data });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
