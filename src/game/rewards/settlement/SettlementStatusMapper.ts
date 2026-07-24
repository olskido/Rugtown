/**
 * SettlementStatusMapper.ts — maps server claim/settlement states to UI labels.
 */

import type { ClaimState, SettlementState, SettlementMode } from './SettlementTypes';

export function claimStateLabel(state: ClaimState | string): string {
  switch (state) {
    case 'created': return 'Created';
    case 'eligibility_pending': return 'Checking eligibility';
    case 'eligible': return 'Eligible';
    case 'ineligible': return 'Not eligible';
    case 'awaiting_wallet': return 'Verify wallet';
    case 'awaiting_review': return 'In review';
    case 'approved': return 'Approved';
    case 'settlement_preparing': return 'Preparing settlement';
    case 'settlement_submitted': return 'Settlement submitted';
    case 'settlement_confirming': return 'Confirming on-chain';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
    case 'expired': return 'Expired';
    default: return String(state);
  }
}

export function settlementStateLabel(state: SettlementState | string): string {
  switch (state) {
    case 'not_started': return 'Not started';
    case 'prepared': return 'Prepared';
    case 'submitted': return 'Submitted';
    case 'processed': return 'Processed';
    case 'confirmed': return 'Confirmed';
    case 'finalized': return 'Finalized';
    case 'failed': return 'Failed';
    case 'reversed': return 'Reversed';
    case 'manual_intervention': return 'Manual intervention';
    default: return String(state);
  }
}

export function settlementModeLabel(mode: SettlementMode | string): string {
  switch (mode) {
    case 'disabled': return 'Settlement disabled';
    case 'manual_review': return 'Manual review';
    case 'multisig': return 'Multisig';
    case 'automated': return 'Automated';
    default: return String(mode);
  }
}

export function isTerminalClaimState(state: ClaimState | string): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled' || state === 'expired';
}

/** Explorer link for a verified transaction (read-only, safe). */
export function explorerTxUrl(signature: string, cluster: string): string {
  const suffix = cluster === 'mainnet-beta' ? '' : `?cluster=${encodeURIComponent(cluster)}`;
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${suffix}`;
}
