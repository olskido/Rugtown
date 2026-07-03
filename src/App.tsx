import React, { useCallback, useEffect, useRef, useState } from 'react';
import './styles/global.css';
import './styles/landing.css';
import './styles/game.css';
import './styles/auth.css';
import { LandingPage } from './components/LandingPage';
import { AuthPage } from './components/AuthPage';
import { OutfitSelectPage } from './components/OutfitSelectPage';
import { GamePage } from './components/GamePage';
import { DEFAULT_APPEARANCE, type CharacterAppearance } from './game/world/CharacterAppearance';
import { soundManager } from './audio/SoundManager';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  fetchOrCreateProfile,
  fetchSavedAppearance,
  fetchUserBadgeIds,
  fetchInventoryItemIds,
  fetchDistrictUnlockIds,
  saveAppearance,
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
                              OutfitSelectPage (nickname + character)
                                     │
                                     ▼
                                 GamePage
                        (boots Phaser immediately; shows its own
                         readiness-gated cover while the world loads)

  Guests: local-only, unchanged when Supabase is not configured.
*/

type Screen = 'landing' | 'auth' | 'outfit' | 'game';

interface AuthUser {
  id: string;
  email: string | null;
}

export default function App() {
  const [screen, setScreen]                 = useState<Screen>('landing');
  const [playerName, setPlayerName]         = useState('');
  const [appearance, setAppearance]         = useState<CharacterAppearance>(DEFAULT_APPEARANCE);
  const [user, setUser]                     = useState<AuthUser | null>(null);
  const [initialRep, setInitialRep]             = useState(0);
  const [initialBadgeIds, setInitialBadgeIds]   = useState<string[]>([]);
  const [initialOwnedItemIds, setInitialOwnedItemIds] = useState<string[]>([]);
  const [initialDistrictIds, setInitialDistrictIds]   = useState<string[]>([]);

  /** True while an explicit sign-in / sign-up / OAuth attempt is in flight. */
  const authActionPendingRef = useRef(false);
  /** Guards against loading the same user's data twice (getSession +
   *  onAuthStateChange both fire on load). Reset on sign-out. */
  const loadedUserIdRef = useRef<string | null>(null);

  const resetGuestProgress = useCallback(() => {
    setPlayerName('');
    setAppearance(DEFAULT_APPEARANCE);
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
        // from the Google account if the DB trigger didn't (never rely on the
        // trigger alone). The other reads run in parallel — they key off
        // user_id and return empty defaults when nothing is saved yet.
        const [profile, savedApp, badgeIds, itemIds, districtIds] = await Promise.all([
          fetchOrCreateProfile(sUser),
          fetchSavedAppearance(sUser.id),
          fetchUserBadgeIds(sUser.id),
          fetchInventoryItemIds(sUser.id),
          fetchDistrictUnlockIds(sUser.id),
        ]);
        if (cancelled) return;

        if (profile?.username) setPlayerName(profile.username);
        else setPlayerName(prev => prev || emailFallback);

        if (savedApp) setAppearance(savedApp);
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

    /** Strip the OAuth `?code=` / `#access_token=` params from the URL bar. */
    const cleanOAuthUrl = () => {
      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    const storeUser = (sUser: { id: string; email?: string | null }) => {
      setUser({ id: sUser.id, email: sUser.email ?? null });
    };

    /* Requirement 1: always call getSession() on load. This restores an
       existing session (persisted or freshly parsed from the OAuth redirect)
       and loads the profile/player data. */
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;
      storeUser(session.user);
      void loadUserData(session.user);

      // Fallback OAuth-return detection via the URL (covers implicit flow and
      // any case where the SIGNED_IN event doesn't fire): show the logged-in
      // AuthPage so the user taps Continue — never an auto-skip.
      const isOAuthReturn =
        window.location.hash.includes('access_token') ||
        window.location.search.includes('code=');
      if (isOAuthReturn) {
        setScreen('auth');
        cleanOAuthUrl();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_IN' && session?.user) {
          storeUser(session.user);
          void loadUserData(session.user).then(() => {
            if (cancelled) return;
            if (authActionPendingRef.current) {
              // Explicit in-app sign-in (email/password or the Google button
              // click within this session) → proceed to the character creator.
              authActionPendingRef.current = false;
              setScreen('outfit');
            } else {
              // A SIGNED_IN with no pending flag means the page reloaded via the
              // OAuth redirect (the flag was reset by the reload). Surface the
              // logged-in AuthPage with "Continue" — do NOT skip it.
              setScreen('auth');
              cleanOAuthUrl();
            }
          });
        }

        if (event === 'SIGNED_OUT') {
          if (!cancelled) {
            loadedUserIdRef.current = null;
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

  const handleAuthSignInAttempt = useCallback(() => {
    authActionPendingRef.current = true;
  }, []);

  const handleGuestFromAuth = useCallback(async () => {
    authActionPendingRef.current = false;
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    resetGuestProgress();
    setScreen('outfit');
  }, [resetGuestProgress]);

  const handleAppearanceSelect = useCallback(
    (picked: CharacterAppearance, name: string) => {
      setAppearance(picked);
      setPlayerName(name);
      // Straight into the game — GamePage shows its own readiness-gated
      // cover while Phaser boots, so there's no separate timed loading
      // screen wasting a second before the world even starts loading.
      setScreen('game');
      if (user?.id) {
        saveAppearance(user.id, picked).catch(() => {});
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
        appearance={appearance}
        userEmail={user?.email ?? null}
        userId={user?.id ?? null}
        initialRep={initialRep}
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
        initialAppearance={appearance}
        onSelect={handleAppearanceSelect}
      />
    );
  }

  if (screen === 'auth') {
    return (
      <AuthPage
        loggedInEmail={user?.email ?? null}
        loggedInUsername={playerName || null}
        isLoggedIn={!!user}
        onContinue={handleAuthContinue}
        onGuest={handleGuestFromAuth}
        onSignInAttempt={handleAuthSignInAttempt}
      />
    );
  }

  return <LandingPage onEnterRugtown={handleEnterRugtown} />;
}
