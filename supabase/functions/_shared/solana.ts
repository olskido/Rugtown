/**
 * _shared/solana.ts — server-side Solana verification helpers.
 *
 * IMPORTANT: This module NEVER holds private keys and NEVER submits transfers.
 * It only READS chain state to independently verify claims. Treasury payout in
 * automated mode is intentionally NOT implemented in this phase.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from 'https://esm.sh/@solana/web3.js@1.95.3';

export interface TxVerificationInput {
  rpcEndpoint: string;
  signature: string;
  expectedDestination: string;
  expectedAmountAtomic: number;
  assetType: 'SOL' | 'SPL';
  expectedMint?: string;
  expectedDecimals?: number;
  minConfirmation: 'processed' | 'confirmed' | 'finalized';
  approvedAtMs: number;
  verificationWindowMs: number;
}

export interface TxVerificationResult {
  verified: boolean;
  reasonCode?: string;
  reasonSafe?: string;
  slot?: number;
  blockTimeMs?: number;
  confirmationStatus?: string;
}

export async function verifyTransaction(input: TxVerificationInput): Promise<TxVerificationResult> {
  const conn = new Connection(input.rpcEndpoint, input.minConfirmation);

  let tx;
  try {
    tx = await conn.getTransaction(input.signature, {
      commitment: input.minConfirmation === 'processed' ? 'confirmed' : input.minConfirmation,
      maxSupportedTransactionVersion: 0,
    });
  } catch (_e) {
    return { verified: false, reasonCode: 'rpc_error', reasonSafe: 'Unable to fetch transaction' };
  }

  if (!tx) return { verified: false, reasonCode: 'not_found', reasonSafe: 'Transaction not found or dropped' };
  if (tx.meta?.err) return { verified: false, reasonCode: 'tx_failed', reasonSafe: 'Transaction failed on-chain' };

  const blockTimeMs = tx.blockTime ? tx.blockTime * 1000 : undefined;
  if (blockTimeMs !== undefined) {
    if (blockTimeMs < input.approvedAtMs) {
      return { verified: false, reasonCode: 'before_approval', reasonSafe: 'Transaction predates claim approval' };
    }
    if (blockTimeMs > input.approvedAtMs + input.verificationWindowMs) {
      return { verified: false, reasonCode: 'window_expired', reasonSafe: 'Transaction outside verification window' };
    }
  }

  if (input.assetType === 'SOL') {
    const ok = verifySolTransfer(tx, input.expectedDestination, input.expectedAmountAtomic);
    if (!ok) return { verified: false, reasonCode: 'sol_mismatch', reasonSafe: 'SOL transfer amount/destination mismatch' };
  } else {
    const ok = verifySplTransfer(tx, input);
    if (!ok) return { verified: false, reasonCode: 'spl_mismatch', reasonSafe: 'SPL transfer amount/mint/destination mismatch' };
  }

  return {
    verified: true,
    slot: tx.slot,
    blockTimeMs,
    confirmationStatus: input.minConfirmation,
  };
}

function verifySolTransfer(
  // deno-lint-ignore no-explicit-any
  tx: any,
  destination: string,
  expectedAtomic: number,
): boolean {
  try {
    const keys: PublicKey[] = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : tx.transaction.message.accountKeys;
    const idx = keys.findIndex((k: PublicKey) => k.toBase58() === destination);
    if (idx < 0) return false;
    const pre = tx.meta.preBalances[idx] as number;
    const post = tx.meta.postBalances[idx] as number;
    const delta = post - pre;
    // Allow exact match (destination gains expected lamports)
    return delta === expectedAtomic && expectedAtomic > 0 && expectedAtomic < 1000 * LAMPORTS_PER_SOL;
  } catch {
    return false;
  }
}

function verifySplTransfer(
  // deno-lint-ignore no-explicit-any
  tx: any,
  input: TxVerificationInput,
): boolean {
  try {
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];
    const matchPost = post.find(
      // deno-lint-ignore no-explicit-any
      (b: any) => b.owner === input.expectedDestination && b.mint === input.expectedMint,
    );
    if (!matchPost) return false;
    if (input.expectedDecimals !== undefined && matchPost.uiTokenAmount.decimals !== input.expectedDecimals) {
      return false;
    }
    const matchPre = pre.find(
      // deno-lint-ignore no-explicit-any
      (b: any) => b.owner === input.expectedDestination && b.mint === input.expectedMint,
    );
    const preAmt = matchPre ? Number(matchPre.uiTokenAmount.amount) : 0;
    const postAmt = Number(matchPost.uiTokenAmount.amount);
    return postAmt - preAmt === input.expectedAmountAtomic;
  } catch {
    return false;
  }
}

/** Read-only balance check for funding verification. */
export async function readBalanceAtomic(
  rpcEndpoint: string,
  address: string,
  mint?: string,
): Promise<{ atomic: number; slot: number } | null> {
  try {
    const conn = new Connection(rpcEndpoint, 'confirmed');
    const slot = await conn.getSlot();
    if (!mint) {
      const lamports = await conn.getBalance(new PublicKey(address));
      return { atomic: lamports, slot };
    }
    const resp = await conn.getParsedTokenAccountsByOwner(new PublicKey(address), {
      mint: new PublicKey(mint),
    });
    let total = 0;
    for (const acc of resp.value) {
      // deno-lint-ignore no-explicit-any
      const info = (acc.account.data as any).parsed.info;
      total += Number(info.tokenAmount.amount);
    }
    return { atomic: total, slot };
  } catch {
    return null;
  }
}
