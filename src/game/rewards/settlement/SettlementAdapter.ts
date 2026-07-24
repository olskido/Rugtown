/**
 * SettlementAdapter.ts — Phase 10H settlement adapter interface (settlement/).
 * Re-exports the Phase 10G boundary types and defines the production interface.
 */

export type {
  RewardSettlementAdapter,
  PrepareClaimResult,
  SubmitClaimResult,
  VerifySettlementResult,
} from '../SettlementAdapter';

export type SettlementAdapterKind = 'noop' | 'supabase';
