/**
 * WalletVerificationSection.tsx — Phase 10H wallet ownership verification UI.
 *
 * Uses an injected Solana wallet (e.g. Phantom) to sign a server-issued
 * challenge. The browser signs but NEVER decides verification success — the
 * verify-wallet-signature Edge Function performs signature verification.
 */

import { useState } from 'react';
import { rewardService } from '../../game/rewards';
import type { VerifiedWalletView } from '../../game/rewards/settlement/SettlementTypes';

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
}

function getProvider(): SolanaProvider | null {
  const w = window as unknown as { solana?: SolanaProvider };
  return w.solana ?? null;
}

// Minimal base58 encoder (Bitcoin alphabet) for the signature payload.
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

export interface WalletVerificationSectionProps {
  wallets: VerifiedWalletView[];
  onToast?: (text: string) => void;
}

export function WalletVerificationSection({ wallets, onToast }: WalletVerificationSectionProps) {
  const [busy, setBusy] = useState(false);
  const active = wallets.filter((w) => !w.revokedAt);

  const verify = async () => {
    const provider = getProvider();
    if (!provider) {
      onToast?.('No Solana wallet detected (install Phantom).');
      return;
    }
    setBusy(true);
    try {
      const conn = await provider.connect();
      const address = conn.publicKey.toString();
      const challengeRes = await rewardService.requestWalletChallenge(address);
      if (!challengeRes.ok || !challengeRes.challenge) {
        onToast?.(challengeRes.message);
        return;
      }
      const encoded = new TextEncoder().encode(challengeRes.challenge.message);
      const signed = await provider.signMessage(encoded, 'utf8');
      const sigB58 = base58Encode(signed.signature);
      const verifyRes = await rewardService.verifyWalletSignature(challengeRes.challenge.id, sigB58);
      onToast?.(verifyRes.message);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Wallet verification cancelled');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (walletId: string) => {
    setBusy(true);
    const res = await rewardService.revokeWallet(walletId);
    setBusy(false);
    onToast?.(res.message);
  };

  return (
    <section className="reward-wallet">
      <h3 className="profile-section-title">Wallet</h3>
      <p className="reward-centre__meta">Blockchain claims require a verified wallet.</p>
      {active.length === 0 && <p className="profile-empty">No verified wallet.</p>}
      <ul className="reward-mission-list">
        {active.map((w) => (
          <li key={w.id}>
            <div className="reward-mission-list__main">
              <strong>
                {w.walletAddress.slice(0, 4)}…{w.walletAddress.slice(-4)}
                {w.isPrimary ? ' · primary' : ''}
              </strong>
              <span className="reward-badge reward-badge--ok">Verified {new Date(w.verifiedAt).toLocaleDateString()}</span>
            </div>
            <button type="button" className="profile-action-btn" disabled={busy} onClick={() => revoke(w.id)}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="profile-action-btn profile-action-btn--primary" disabled={busy} onClick={verify}>
        {busy ? 'Verifying…' : 'Verify a wallet'}
      </button>
    </section>
  );
}
