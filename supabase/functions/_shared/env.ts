/**
 * _shared/env.ts — server-only environment access for Edge Functions.
 * Never import this into browser code.
 */

// deno-lint-ignore no-explicit-any
declare const Deno: any;

export function getEnv(key: string, fallback?: string): string | undefined {
  try {
    return Deno.env.get(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function requireEnv(key: string): string {
  const v = getEnv(key);
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

export interface SettlementEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  solanaCluster: string;
  rpcEndpoint: string;
  treasuryPublicAddress?: string;
  settlementMode: string;
  minConfirmations: string;
  verificationTimeoutMs: number;
}

export function loadSettlementEnv(): SettlementEnv {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    solanaCluster: getEnv('SOLANA_CLUSTER', 'devnet')!,
    rpcEndpoint: getEnv('SOLANA_RPC_ENDPOINT', 'https://api.devnet.solana.com')!,
    treasuryPublicAddress: getEnv('TREASURY_PUBLIC_ADDRESS'),
    settlementMode: getEnv('SETTLEMENT_MODE', 'disabled')!,
    minConfirmations: getEnv('SETTLEMENT_MIN_CONFIRMATIONS', 'finalized')!,
    verificationTimeoutMs: Number(getEnv('SETTLEMENT_VERIFICATION_TIMEOUT_MS', '15000')),
  };
}

/** Pump.fun token integration — disabled until mint configured by operator. */
export interface TokenIntegrationEnv {
  enabled: boolean;
  mintAddress: string | null;
  cluster: string;
  featureVersion: number;
  balanceCacheSeconds: number;
}

export function loadTokenIntegrationEnv(): TokenIntegrationEnv {
  const enabled = getEnv('RUGTOWN_TOKEN_ENABLED', 'false') === 'true';
  const mint = getEnv('RUGTOWN_TOKEN_MINT_ADDRESS')?.trim() || null;
  return {
    enabled: enabled && !!mint,
    mintAddress: enabled ? mint : null,
    cluster: getEnv('RUGTOWN_TOKEN_CLUSTER', 'mainnet-beta')!,
    featureVersion: Number(getEnv('RUGTOWN_TOKEN_FEATURE_VERSION', '1')) || 1,
    balanceCacheSeconds: Number(getEnv('RUGTOWN_TOKEN_BALANCE_CACHE_SECONDS', '60')) || 60,
  };
}
