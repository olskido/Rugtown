/**
 * _shared/settlement.ts — shared settlement DB helpers (service-role client).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function loadSettlementConfig(admin: SupabaseClient) {
  const { data } = await admin.from('settlement_config').select('*').eq('id', 'default').maybeSingle();
  return (
    data ?? {
      id: 'default',
      mode: 'disabled',
      network: 'devnet',
      min_confirmations: 'finalized',
      verification_window_s: 3600,
      treasury_public_address: null,
    }
  );
}

export async function auditClaim(
  admin: SupabaseClient,
  claimId: string,
  fromState: string | null,
  toState: string,
  actorType: string,
  actorId: string | null,
  noteSafe?: string,
) {
  await admin.from('reward_claim_audit').insert({
    claim_id: claimId,
    from_state: fromState,
    to_state: toState,
    actor_type: actorType,
    actor_id: actorId,
    note_safe: noteSafe ?? null,
  });
}
