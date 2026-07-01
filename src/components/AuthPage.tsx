import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/*
  AuthPage.tsx
  ────────────
  Optional auth gate between LandingPage and OutfitSelectPage.
  Only rendered when Supabase env vars are present; App.tsx skips it
  entirely otherwise so Guest Mode keeps working unchanged.

  Navigation rules:
  • Email/password sign-in and Google OAuth: do NOT call onComplete.
    App.tsx's onAuthStateChange handler loads profile + appearance data
    and then advances the screen itself — this ensures OutfitSelectPage
    always opens with the user's saved look already set.
  • Guest and auto-skip (existing session): call onComplete so App.tsx
    navigates immediately.

  The loading spinner remains visible after a successful sign-in until
  App.tsx unmounts this component — the user never sees the idle form.
*/

type AuthMode = 'signin' | 'signup';

interface AuthPageProps {
  /** Guest name typed on LandingPage — used when "Continue as Guest" is clicked */
  guestName: string;
  /**
   * Called for:
   *   - "Continue as Guest" (name = typed guest name)
   *   - Auto-skip when an existing session is detected (name = '')
   * NOT called after email/password or Google auth — those are handled
   * by App.tsx's onAuthStateChange listener.
   */
  onComplete: (playerName: string) => void;
}

export function AuthPage({ guestName, onComplete }: AuthPageProps) {
  const [mode, setMode]       = useState<AuthMode>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);

  const clear = () => { setError(null); setNotice(null); };

  // If the user already has a valid session (returning visitor, or
  // after an OAuth redirect), skip the auth screen immediately.
  // Profile data was already loaded in App.tsx's getSession() call,
  // so we just signal "navigate now" with an empty name.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) onComplete('');
    });
  // onComplete is stable (useCallback in App.tsx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Sign in ─────────────────────────────────────────────────── */
  const handleSignIn = async () => {
    if (!supabase) return;
    clear();
    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authErr) throw authErr;
      if (!data.user) {
        // Unexpected — should always have a user on success
        setLoading(false);
      }
      // Success: keep loading=true — App.tsx's onAuthStateChange will load
      // profile data and then unmount this component by navigating away.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  /* ── Sign up ─────────────────────────────────────────────────── */
  const handleSignUp = async () => {
    if (!supabase) return;
    clear();
    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signUp({ email, password });
      if (authErr) throw authErr;

      if (data.session) {
        // Email confirmation disabled — user is immediately signed in.
        // Keep loading=true; onAuthStateChange handles navigation.
      } else {
        // Email confirmation required — show a notice and let the user sign in later.
        setNotice('Account created! Check your inbox to confirm, then sign in.');
        setMode('signin');
        setLoading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.');
      setLoading(false);
    }
  };

  /* ── Google OAuth ────────────────────────────────────────────── */
  const handleGoogle = async () => {
    if (!supabase) return;
    clear();
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (authErr) throw authErr;
      // Browser redirects — spinner stays visible until the page unloads.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setLoading(false);
    }
  };

  /* ── Guest ───────────────────────────────────────────────────── */
  const handleGuest = () => onComplete(guestName || 'DegenExplorer');

  const handleSubmit = mode === 'signin' ? handleSignIn : handleSignUp;
  const canSubmit    = email.trim().length > 0 && password.length >= 6 && !loading;

  // Safety guard — App.tsx should never render this without Supabase
  if (!isSupabaseConfigured) { handleGuest(); return null; }

  return (
    <div className="landing auth-page landing--mounted">
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

            {/* ── Header ── */}
            <div className="auth-page__header">
              <div className="auth-page__logo">RUGTOWN</div>
              <p className="auth-page__subtitle">
                Sign in to save your progress across sessions.
              </p>
            </div>

            {/* ── Mode tabs ── */}
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

            {/* ── Feedback ── */}
            {error  && <p className="auth-feedback auth-feedback--error"  role="alert">{error}</p>}
            {notice && <p className="auth-feedback auth-feedback--notice" role="status">{notice}</p>}

            {/* ── Email/password form ── */}
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

            {/* ── Divider ── */}
            <div className="card__divider auth-divider">
              <span className="card__divider-line" />
              <span className="auth-divider-text">or</span>
              <span className="card__divider-line" />
            </div>

            {/* ── Google ── */}
            <button
              className="btn auth-btn-google"
              onClick={handleGoogle}
              disabled={loading}
              aria-label="Continue with Google"
            >
              <span className="auth-google-icon" aria-hidden>G</span>
              Continue with Google
            </button>

            {/* ── Guest separator ── */}
            <div className="card__divider auth-divider">
              <span className="card__divider-line" />
              <span className="auth-divider-text">or skip for now</span>
              <span className="card__divider-line" />
            </div>

            {/* ── Guest ── */}
            <button
              className="btn btn--ghost auth-btn-guest"
              onClick={handleGuest}
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
