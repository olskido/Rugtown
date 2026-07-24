/**
 * _shared/idempotency.ts — idempotency helpers for settlement operations.
 */

export function settlementIdempotencyKey(claimId: string, attempt: number): string {
  return `settle:${claimId}:${attempt}`;
}

/** Deterministic hash for evidence / dedupe. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
