/**
 * create-wallet-verification-challenge
 * Issues a short-lived, single-use signing challenge for wallet ownership.
 * The browser signs it; the browser does NOT decide verification success.
 */

import { authenticate } from '../_shared/auth.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, HandledError } from '../_shared/errors.ts';
import { parseJson, requireSolanaAddress } from '../_shared/validation.ts';
import { getEnv } from '../_shared/env.ts';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PENDING = 5;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const ctx = await authenticate(req);
    const body = await parseJson<{ walletAddress: string }>(req);
    const wallet = requireSolanaAddress(body.walletAddress, 'walletAddress');

    // Abuse: cap pending challenges per player
    const { count } = await ctx.admin
      .from('wallet_verification_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', ctx.userId)
      .eq('status', 'pending');
    if ((count ?? 0) >= MAX_PENDING) {
      throw new HandledError('rate_limited', 'Too many pending challenges', 429);
    }

    const nonce = crypto.randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const env = getEnv('SOLANA_CLUSTER', 'devnet');
    const message = [
      'RugTown Wallet Verification',
      `wallet: ${wallet}`,
      `player: ${ctx.userId}`,
      `nonce: ${nonce}`,
      `issued: ${issuedAt.toISOString()}`,
      `expires: ${expiresAt.toISOString()}`,
      `env: ${env}`,
    ].join('\n');

    const { data, error } = await ctx.admin
      .from('wallet_verification_challenges')
      .insert({
        player_id: ctx.userId,
        wallet_address: wallet,
        nonce,
        message,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('id, nonce, message, expires_at')
      .single();
    if (error) throw new HandledError('db_error', 'Could not create challenge', 500);

    return jsonResponse(req, { ok: true, challenge: data });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
