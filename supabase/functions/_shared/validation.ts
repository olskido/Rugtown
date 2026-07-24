/**
 * _shared/validation.ts — input validation helpers.
 */

import { HandledError } from './errors.ts';

export async function parseJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HandledError('bad_request', 'Invalid JSON body', 400);
  }
}

export function requireString(v: unknown, field: string, max = 512): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    throw new HandledError('bad_request', `Invalid field: ${field}`, 400);
  }
  return v;
}

/** Base58 charset used by Solana addresses / signatures. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isValidSolanaAddress(addr: string): boolean {
  return typeof addr === 'string' && addr.length >= 32 && addr.length <= 44 && BASE58.test(addr);
}

export function requireSolanaAddress(v: unknown, field: string): string {
  const s = requireString(v, field, 64);
  if (!isValidSolanaAddress(s)) throw new HandledError('bad_request', `Invalid Solana address: ${field}`, 400);
  return s;
}
