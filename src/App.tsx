import React, { useCallback, useEffect, useRef, useState } from 'react';
import './styles/global.css';
import './styles/landing.css';
import './styles/game.css';
import './styles/auth.css';
import { LandingPage } from './components/LandingPage';
import { AuthPage } from './components/AuthPage';
import { AuthCallbackPage } from './components/AuthCallbackPage';
import { OutfitSelectPage } from './components/OutfitSelectPage';
import { GamePage } from './components/GamePage';
import { getCanonicalPlayerAppearance } from './game/characters/appearance/CanonicalPlayerAppearance';
import { soundManager } from './audio/SoundManager';
import { isAuthCallbackPath } from './lib/authRedirect';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  fetchOrCreateProfile,
  fetchUserBadgeIds,
  fetchInventoryItemIds,
  fetchDistrictUnlockIds,
  saveUsername,
  type AuthUserLike,
} from './lib/profile';

/*
  App.tsx
  ───────
  Screen flow:

    LandingPage
      │
      ├─ (Supabase configured) → AuthPage
      │                              │
      └─ (no Supabase) ──────────────┤
                                     ▼
                              OutfitSelectPage (nickname)
                                     │
                                     ▼
                                 GamePage
                        (boots Phaser immediately; shows its own
                         readiness-gated cover while the world loads)

  Email confirmation / OAuth return:
    /auth/callback → AuthCallbackPage → AuthPage (signed-in Continue)

  Guests: local-only, unchanged when Supabase is not configured.
*/

type Screen = 'landing' | 'auth' | 'auth-callback' | 'outfit' | 'game';

interface AuthUser {
  id: string;
  email: string | null;
}

export default function App() {
  const [screen, setScreen]                 = useState<Screen>(() =>
    isAuthCallbackPath() ? 'auth-callback' : 'landing',
  );
  const [playerName, setPlayerName]         = useState('');
  const [user, setUser]                     = useState<AuthUser | null>(null);
  const [initialRep, setInitialRep]             = useState(0);
  const [initialBadgeIds, setInitialBadgeIds]   = useState<string[]>([]);
  const [initialOwnedItemIds, setInitialOwnedItemIds] = useState<string[]>([]);
  const [initialDistrictIds, setInitialDistrictIds]   = useState<string[]>([]);
  /** Shown on AuthPage after a failed email-confirmation callback. */
  const [authCallbackError, setAuthCallbackError] = useState<string | null>(null);

  /** True while an explicit email/password sign-in or sign-up is in flight. */
  const authActionPendingRef = useRef(false);
  /** Username chosen during sign-up, persisted to the profile once the auth
   *  user is created (cleared after use). */
  const pendingUsernameRef = useRef<string | null>(null);
  /** Guards against loading the same user's data twice (getSession +
   *  onAuthStateChange both fire on load). Reset on sign-out. */
  const loadedUserIdRef = useRef<string | null>(null);

  const resetGuestProgress = useCallback(() => {
    setPlayerName('');
    setInitialRep(0);
    setInitialBadgeIds([]);
    setInitialOwnedItemIds([]);
    setInitialDistrictIds([]);
  }, []);

  /* ── Audio: start music as early as possible ─────────────────────
     Buffer the music tracks immediately on load, then unlock + start
     playback on the very first user interaction anywhere in the app
     (e.g. clicking "Enter RugTown" on the landing page or typing on the
     auth screen). This is what makes music play from the moment you sign
     up, not only once you're inside the game. Autoplay policy is respected
     — preload() never plays; playback only begins after a real gesture. ── */
  useEffect(() => {
    soundManager.preload();
    if (soundManager.isUnlocked()) return;
    const unlock = () => {
      soundManager.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  /* ── Preload Phaser while the player is on auth / character creator so
     the game engine chunk is cached before GamePage mounts — cuts the
     blank-screen wait after outfit selection. ── */
  useEffect(() => {
    if (screen === 'auth' || screen === 'outfit') {
      void import('./game/RugTownGame');
    }
  }, [screen]);

  /* ── Supabase: auth listener + profile sync ──────────────────── */
  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    /* Fetch (or create) the profile and load all persistent player data for a
       signed-in user. Deduped per user id so the getSession() + SIGNED_IN
       double-fire on load doesn't run it twice. */
    const loadUserData = async (sUser: AuthUserLike): Promise<void> => {
      if (loadedUserIdRef.current === sUser.id) return;
      loadedUserIdRef.current = sUser.id;

      const emailFallback = sUser.email?.split('@')[0] ?? 'Degen';
      try {
        // fetchOrCreateProfile is the frontend fallback: it creates the row
        // from the account if the DB trigger didn't (never rely on the trigger
        // alone). Cosmetic saves are intentionally ignored because all players
        // use the canonical appearance.
        const [profile, badgeIds, itemIds, districtIds] = await Promise.all([
          fetchOrCreateProfile(sUser),
          fetchUserBadgeIds(sUser.id),
          fetchInventoryItemIds(sUser.id),
          fetchDistrictUnlockIds(sUser.id),
        ]);
        if (cancelled) return;

        if (profile?.username) setPlayerName(profile.username);
        else setPlayerName(prev => prev || emailFallback);

        if (profile) setInitialRep(profile.rep);
        if (badgeIds.length) setInitialBadgeIds(badgeIds);
        if (itemIds.length) setInitialOwnedItemIds(itemIds);
        if (districtIds.length) setInitialDistrictIds(districtIds);
      } catch {
        if (!cancelled) {
          // Reset the guard so a later attempt can retry the load.
          loadedUserIdRef.current = null;
          setPlayerName(prev => prev || emailFallback);
        }
      }
    };

    const storeUser = (sUser: { id: string; email?: string | null }) => {
      setUser({ id: sUser.id, email: sUser.email ?? null });
    };

    /* Requirement: always call getSession() on load to restore a persisted
       session (returning users) and load their profile/player data. This does
       not navigate — the user stays on the landing page until they act. */
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;
      storeUser(session.user);
      void loadUserData(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_IN' && session?.user) {
          const sUser = session.user;
          storeUser(sUser);
          void loadUserData(sUser).then(async () => {
            if (cancelled) return;
            // Only advance after an explicit in-app sign-in / sign-up action.
            if (!authActionPendingRef.current) return;
            authActionPendingRef.current = false;

            // Sign-up: persist the chosen username to the profile (the DB
            // trigger seeds an email-derived handle; this overrides it with
            // what the user typed). loadUserData already ensured the row exists.
            const chosenUsername = pendingUsernameRef.current;
            pendingUsernameRef.current = null;
            if (chosenUsername) {
              await saveUsername(sUser.id, chosenUsername).catch(() => {});
              if (!cancelled) setPlayerName(chosenUsername);
            }

            if (!cancelled) setScreen('outfit');
          });
        }

        if (event === 'SIGNED_OUT') {
          if (!cancelled) {
            loadedUserIdRef.current = null;
            pendingUsernameRef.current = null;
            setUser(null);
            resetGuestProgress();
          }
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [resetGuestProgress]);

  /* ── Handlers ────────────────────────────────────────────────── */

  const handleEnterRugtown = useCallback(() => {
    setScreen(isSupabaseConfigured ? 'auth' : 'outfit');
  }, []);

  const handleAuthContinue = useCallback(() => {
    setScreen('outfit');
  }, []);

  const handleAuthCallbackSuccess = useCallback(() => {
    setAuthCallbackError(null);
    // Session is persisted; AuthPage shows the signed-in Continue panel.
    setScreen('auth');
  }, []);

  const handleAuthCallbackFailure = useCallback((message: string) => {
    setAuthCallbackError(message);
    setScreen('auth');
  }, []);

  const handleAuthSignInAttempt = useCallback(() => {
    authActionPendingRef.current = true;
    pendingUsernameRef.current = null;
  }, []);

  const handleAuthSignUpAttempt = useCallback((username: string) => {
    authActionPendingRef.current = true;
    pendingUsernameRef.current = username.trim() || null;
  }, []);

  const handleGuestFromAuth = useCallback(async () => {
    authActionPendingRef.current = false;
    pendingUsernameRef.current = null;
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    resetGuestProgress();
    setScreen('outfit');
  }, [resetGuestProgress]);

  const handleNameSelect = useCallback(
    (name: string) => {
      setPlayerName(name);
      setScreen('game');
      if (user?.id) {
        if (name.trim()) saveUsername(user.id, name.trim()).catch(() => {});
      }
    },
    [user],
  );

  const handleLogout = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    resetGuestProgress();
    setScreen('landing');
  }, [resetGuestProgress]);

  /* ── Render ──────────────────────────────────────────────────── */

  if (screen === 'game') {
    return (
      <GamePage
        playerName={playerName}
        appearance={getCanonicalPlayerAppearance()}
        userEmail={user?.email ?? null}
        userId={user?.id ?? null}
        initialRep={user ? initialRep : undefined}
        initialBadgeIds={initialBadgeIds}
        initialOwnedItemIds={initialOwnedItemIds}
        initialDistrictIds={initialDistrictIds}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === 'outfit') {
    return (
      <OutfitSelectPage
        playerName={playerName}
        onSelect={handleNameSelect}
      />
    );
  }

  if (screen === 'auth-callback') {
    return (
      <AuthCallbackPage
        onSuccess={handleAuthCallbackSuccess}
        onFailure={handleAuthCallbackFailure}
      />
    );
  }

  if (screen === 'auth') {
    return (
      <AuthPage
        loggedInEmail={user?.email ?? null}
        loggedInUsername={playerName || null}
        isLoggedIn={!!user}
        initialError={authCallbackError}
        onContinue={handleAuthContinue}
        onGuest={handleGuestFromAuth}
        onSignInAttempt={handleAuthSignInAttempt}
        onSignUpAttempt={handleAuthSignUpAttempt}
      />
    );
  }

  return <LandingPage onEnterRugtown={handleEnterRugtown} />;
}
