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
  fetchProfile,
  fetchSavedAppearance,
  fetchUserBadgeIds,
  fetchInventoryItemIds,
  fetchDistrictUnlockIds,
  saveAppearance,
  saveUsername,
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

    const loadUserData = async (
      userId: string,
      emailFallback: string,
    ): Promise<void> => {
      try {
        const [profile, savedApp, badgeIds, itemIds, districtIds] = await Promise.all([
          fetchProfile(userId),
          fetchSavedAppearance(userId),
          fetchUserBadgeIds(userId),
          fetchInventoryItemIds(userId),
          fetchDistrictUnlockIds(userId),
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
        if (!cancelled) setPlayerName(prev => prev || emailFallback);
      }
    };

    const handleSession = (session: { user: { id: string; email?: string | null } } | null) => {
      if (!session?.user || cancelled) return;
      const { id, email } = session.user;
      setUser({ id, email: email ?? null });
      loadUserData(id, email?.split('@')[0] ?? 'Degen');
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      handleSession(session);

      // OAuth redirect lands with tokens in the URL — open Auth so the
      // user sees their logged-in state and taps Continue (not a skip).
      const isOAuthReturn =
        window.location.hash.includes('access_token') ||
        window.location.search.includes('code=');
      if (session?.user && isOAuthReturn) {
        setScreen('auth');
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_IN' && session?.user) {
          const { id, email } = session.user;
          setUser({ id, email: email ?? null });
          loadUserData(id, email?.split('@')[0] ?? 'Degen').then(() => {
            if (cancelled) return;
            // Only advance after an explicit sign-in action on the Auth page.
            if (authActionPendingRef.current) {
              authActionPendingRef.current = false;
              setScreen('outfit');
            }
          });
        }

        if (event === 'SIGNED_OUT') {
          if (!cancelled) {
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
