/**
 * verify-wallet-signature
 * Verifies an ed25519 signature over the challenge message server-side.
 * On success, records a verified_wallets row (server-only write).
 */

import { authenticate } from '../_shared/auth.ts';
import { handlePreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse, HandledError } from '../_shared/errors.ts';
import { parseJson, requireString } from '../_shared/validation.ts';
import { PublicKey } from 'https://esm.sh/@solana/web3.js@1.95.3';
import nacl from 'https://esm.sh/tweetnacl@1.0.3';
import bs58 from 'https://esm.sh/bs58@5.0.0';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const ctx = await authenticate(req);
    const body = await parseJson<{ challengeId: string; signatureBase58: string }>(req);
    const challengeId = requireString(body.challengeId, 'challengeId', 64);
    const signatureB58 = requireString(body.signatureBase58, 'signatureBase58', 200);

    const { data: challenge, error: cErr } = await ctx.admin
      .from('wallet_verification_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('player_id', ctx.userId)
      .maybeSingle();
    if (cErr || !challenge) throw new HandledError('not_found', 'Challenge not found', 404);

    // Track attempts
    await ctx.admin
      .from('wallet_verification_challenges')
      .update({ attempt_count: (challenge.attempt_count ?? 0) + 1 })
      .eq('id', challengeId);

    if (challenge.status !== 'pending') throw new HandledError('invalid_challenge', 'Challenge not usable', 400);
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await ctx.admin.from('wallet_verification_challenges').update({ status: 'expired' }).eq('id', challengeId);
      throw new HandledError('expired', 'Challenge expired', 400);
    }

    // Verify signature server-side
    let valid = false;
    try {
      const pubkey = new PublicKey(challenge.wallet_address);
      const msgBytes = new TextEncoder().encode(challenge.message);
      const sigBytes = bs58.decode(signatureB58);
      valid = nacl.sign.detached.verify(msgBytes, sigBytes, pubkey.toBytes());
    } catch {
      valid = false;
    }

    if (!valid) {
      await ctx.admin.from('wallet_verification_challenges').update({ status: 'failed' }).eq('id', challengeId);
      throw new HandledError('bad_signature', 'Signature verification failed', 400);
    }

    // Enforce wallet not already attached to another active account
    const { data: existing } = await ctx.admin
      .from('verified_wallets')
      .select('player_id')
      .eq('wallet_address', challenge.wallet_address)
      .is('revoked_at', null)
      .maybeSingle();
    if (existing && existing.player_id !== ctx.userId) {
      throw new HandledError('wallet_conflict', 'Wallet already verified on another account', 409);
    }

    await ctx.admin
      .from('wallet_verification_challenges')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', challengeId);

    const isPrimary = !existing;
    const { data: wallet, error: wErr } = await ctx.admin
      .from('verified_wallets')
      .upsert(
        {
          player_id: ctx.userId,
          wallet_address: challenge.wallet_address,
          verification_method: 'signature',
          is_primary: isPrimary,
          verified_at: new Date().toISOString(),
          revoked_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,wallet_address' },
      )
      .select('id, wallet_address, verified_at, is_primary')
      .single();
    if (wErr) throw new HandledError('db_error', 'Could not record verified wallet', 500);

    await ctx.admin.rpc('rt_notify', {
      p_player: ctx.userId,
      p_type: 'wallet_verified',
      p_title: 'Wallet verified',
      p_message: 'Your wallet is now verified for reward claims.',
      p_icon: 'wallet',
      p_metadata: { walletAddress: wallet.wallet_address },
    });

    return jsonResponse(req, { ok: true, wallet });
  } catch (e) {
    if (e instanceof HandledError) return errorResponse(req, e.code, e.message, e.status);
    return errorResponse(req, 'internal', 'Unexpected error', 500);
  }
});
