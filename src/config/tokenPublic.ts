/**
 * Public token / Pump.fun readiness config (client-safe only).
 * Private RPC keys and mint activation live server-side.
 * Token features stay disabled until the owner enables them after launch.
 */

export interface PublicTokenConfig {
  enabled: boolean;
  mintAddress: string | null;
  cluster: 'devnet' | 'testnet' | 'mainnet-beta';
  featureVersion: number;
  holderFeaturesAvailable: boolean;
}

/**
 * Browser-visible token state. Mint address is only exposed when enabled
 * via optional public Vite flags — never private keys.
 */
export function getPublicTokenConfig(): PublicTokenConfig {
  const enabled = String(import.meta.env.VITE_RUGTOWN_TOKEN_ENABLED ?? 'false') === 'true';
  const mint = String(import.meta.env.VITE_RUGTOWN_TOKEN_MINT_ADDRESS ?? '').trim() || null;
  const clusterRaw = String(import.meta.env.VITE_RUGTOWN_TOKEN_CLUSTER ?? 'mainnet-beta');
  const cluster =
    clusterRaw === 'devnet' || clusterRaw === 'testnet' || clusterRaw === 'mainnet-beta'
      ? clusterRaw
      : 'mainnet-beta';

  return {
    enabled: enabled && !!mint,
    mintAddress: enabled ? mint : null,
    cluster,
    featureVersion: Number(import.meta.env.VITE_RUGTOWN_TOKEN_FEATURE_VERSION ?? 1) || 1,
    holderFeaturesAvailable: enabled && !!mint,
  };
}
