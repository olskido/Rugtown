/**
 * index.ts — Phase 10G rewards public exports
 */

export * from './types';
export * from './PeriodMissions';
export * from './SettlementAdapter';
export * from './RewardService';
// Settlement subsystem (Phase 10H) — import from './settlement' directly to
// avoid duplicate re-exports of the shared adapter interface.
export * as settlement from './settlement';
