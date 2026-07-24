import React, { useEffect, useState } from 'react';
import { handleAuthCallback } from '../lib/authRedirect';

/*
  AuthCallbackPage
  ────────────────
  Landing target for Supabase email-confirmation (and future OAuth) links.
  Path: /auth/callback

  Exchanges the returned code/tokens for a persisted session, then hands
  control back to App → AuthPage (signed-in Continue panel).
*/

interface AuthCallbackPageProps {
  /** Called after a successful session exchange. */
  onSuccess: () => void;
  /** Called when exchange fails — still open Auth so the user can sign in. */
  onFailure: (message: string) => void;
}

export function AuthCallbackPage({ onSuccess, onFailure }: AuthCallbackPageProps) {
  const [status, setStatus] = useState('Confirming your email…');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await handleAuthCallback();
      if (cancelled) return;

      if (result.ok) {
        setStatus('Email confirmed. Taking you in…');
        onSuccess();
      } else {
        setStatus(result.error);
        onFailure(result.error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onSuccess, onFailure]);

  return (
    <div className="landing auth-page landing--mounted screen-enter">
      <div className="landing__bg" aria-hidden>
        <div className="landing__bg-city" />
        <div className="landing__vignette-warm" />
        <div className="landing__overlay" />
      </div>

      <main className="auth-page__content">
        <div className="landing__card auth-page__card" role="main">
          <div className="card__top-ornament" aria-hidden>
            <div className="card__top-ornament-line" />
          </div>
          <span className="card__corner card__corner--tl" aria-hidden>◆</span>
          <span className="card__corner card__corner--tr" aria-hidden>◆</span>
          <span className="card__corner card__corner--bl" aria-hidden>◆</span>
          <span className="card__corner card__corner--br" aria-hidden>◆</span>

          <div className="card__inner auth-page__inner">
            <div className="auth-page__header">
              <div className="auth-page__logo">RUGTOWN</div>
              <p className="auth-page__subtitle" role="status">
                {status}
              </p>
            </div>
          </div>

          <div className="card__bottom-ornament" aria-hidden>
            <div className="card__top-ornament-line" />
          </div>
        </div>
      </main>
    </div>
  );
}
