import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/*
  AuthPage.tsx
  ────────────
  Auth gate between LandingPage and OutfitSelectPage when Supabase is
  configured. Always shown after "Enter RugTown" — never auto-skipped.

  Navigation:
  • Logged-in users see a welcome panel + Continue.
  • Email/password and Google advance via onSignInAttempt + App listener.
  • Continue as Guest signs out (if needed) and opens the character creator.
*/

type AuthMode = 'signin' | 'signup';

interface AuthPageProps {
  isLoggedIn: boolean;
  loggedInEmail: string | null;
  loggedInUsername: string | null;
  /** Logged-in user proceeds to nickname / character creator. */
  onContinue: () => void;
  /** Guest path — clears account session and opens character creator. */
  onGuest: () => void;
  /** Called immediately before a sign-in / sign-up / OAuth attempt. */
  onSignInAttempt: () => void;
}

export function AuthPage({
  isLoggedIn,
  loggedInEmail,
  loggedInUsername,
  onContinue,
  onGuest,
  onSignInAttempt,
}: AuthPageProps) {
  const [mode, setMode]         = useState<AuthMode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [notice, setNotice]     = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [localLoggedIn, setLocalLoggedIn] = useState(isLoggedIn);

  const clear = () => { setError(null); setNotice(null); };

  // Sync session state on mount — show logged-in panel without auto-skipping.
  useEffect(() => {
    if (!supabase) {
      setSessionReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLocalLoggedIn(!!session?.user);
      setSessionReady(true);
    });
  }, []);

  useEffect(() => {
    setLocalLoggedIn(isLoggedIn);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isSupabaseConfigured) onGuest();
  }, [onGuest]);

  if (!isSupabaseConfigured) return null;

  const handleSignIn = async () => {
    if (!supabase) return;
    clear();
    onSignInAttempt();
    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      if (!data.user) setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!supabase) return;
    clear();
    onSignInAttempt();
    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signUp({ email, password });
      if (authErr) throw authErr;

      if (data.session) {
        // onAuthStateChange handles navigation.
      } else {
        setNotice('Account created! Check your inbox to confirm, then sign in.');
        setMode('signin');
        setLoading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.');
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!supabase) return;
    clear();
    onSignInAttempt();
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (authErr) throw authErr;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setLoading(false);
    }
  };

  const handleSignOutAndSwitch = async () => {
    if (!supabase) return;
    clear();
    setLoading(true);
    await supabase.auth.signOut();
    setLocalLoggedIn(false);
    setLoading(false);
  };

  const handleSubmit = mode === 'signin' ? handleSignIn : handleSignUp;
  const canSubmit    = email.trim().length > 0 && password.length >= 6 && !loading;

  const displayName = loggedInUsername || loggedInEmail?.split('@')[0] || 'Degen';

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
              <p className="auth-page__subtitle">
                Sign in to save progress, or continue as a guest.
              </p>
            </div>

            {!sessionReady ? (
              <p className="auth-feedback auth-feedback--notice" role="status">
                Checking session…
              </p>
            ) : localLoggedIn ? (
              <div className="auth-logged-in">
                <p className="auth-logged-in__welcome">
                  Welcome back, <strong>{displayName}</strong>
                </p>
                {loggedInEmail && (
                  <p className="auth-logged-in__email">{loggedInEmail}</p>
                )}
                <button
                  className="btn btn--primary auth-btn-submit"
                  onClick={onContinue}
                  disabled={loading}
                >
                  <span className="btn__shimmer" aria-hidden />
                  <span className="btn__label">Continue to Character Creator</span>
                </button>
                <button
                  className="btn btn--ghost auth-btn-switch"
                  onClick={handleSignOutAndSwitch}
                  disabled={loading}
                  type="button"
                >
                  Use a different account
                </button>
              </div>
            ) : (
              <>
                <div className="auth-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={mode === 'signin'}
                    className={`auth-tab ${mode === 'signin' ? 'auth-tab--active' : ''}`}
                    onClick={() => { setMode('signin'); clear(); }}
                  >
                    Sign In
                  </button>
                  <button
                    role="tab"
                    aria-selected={mode === 'signup'}
                    className={`auth-tab ${mode === 'signup' ? 'auth-tab--active' : ''}`}
                    onClick={() => { setMode('signup'); clear(); }}
                  >
                    Create Account
                  </button>
                </div>

                {error  && <p className="auth-feedback auth-feedback--error"  role="alert">{error}</p>}
                {notice && <p className="auth-feedback auth-feedback--notice" role="status">{notice}</p>}

                <div className="auth-form">
                  <input
                    className="guest__input auth-input"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); clear(); }}
                    onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
                    autoComplete="email"
                    aria-label="Email address"
                    disabled={loading}
                    spellCheck={false}
                  />
                  <input
                    className="guest__input auth-input"
                    type="password"
                    placeholder={mode === 'signup' ? 'Choose a password (6+ chars)' : 'Password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); clear(); }}
                    onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    aria-label="Password"
                    disabled={loading}
                  />
                  <button
                    className="btn btn--primary auth-btn-submit"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    aria-busy={loading}
                  >
                    <span className="btn__shimmer" aria-hidden />
                    <span className="btn__label">
                      {loading && mode === 'signin'  ? 'Signing in…'    :
                       loading && mode === 'signup'  ? 'Creating…'      :
                       mode === 'signin'             ? 'Sign In'        :
                                                       'Create Account' }
                    </span>
                  </button>
                </div>

                <div className="card__divider auth-divider">
                  <span className="card__divider-line" />
                  <span className="auth-divider-text">or</span>
                  <span className="card__divider-line" />
                </div>

                <button
                  className="btn auth-btn-google"
                  onClick={handleGoogle}
                  disabled={loading}
                  aria-label="Continue with Google"
                >
                  <span className="auth-google-icon" aria-hidden>G</span>
                  Continue with Google
                </button>
              </>
            )}

            <div className="card__divider auth-divider">
              <span className="card__divider-line" />
              <span className="auth-divider-text">or skip for now</span>
              <span className="card__divider-line" />
            </div>

            <button
              className="btn btn--ghost auth-btn-guest"
              onClick={onGuest}
              disabled={loading}
              aria-label="Continue as guest without an account"
            >
              <span className="btn__icon" aria-hidden>⚡</span>
              Continue as Guest
            </button>

            <p className="auth-disclaimer">
              Guest progress is session-only and resets on refresh.
            </p>

          </div>

          <div className="card__bottom-ornament" aria-hidden>
            <div className="card__top-ornament-line" />
          </div>
        </div>
      </main>
    </div>
  );
}
