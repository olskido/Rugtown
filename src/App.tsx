import React, { useCallback, useEffect, useState } from 'react';
import './styles/global.css';
import './styles/landing.css';
import './styles/game.css';
import './styles/auth.css';
import { LandingPage } from './components/LandingPage';
import { AuthPage } from './components/AuthPage';
import { OutfitSelectPage } from './components/OutfitSelectPage';
import { GamePage } from './components/GamePage';
import { DEFAULT_APPEARANCE, type CharacterAppearance } from './game/world/CharacterAppearance';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  fetchProfile,
  fetchSavedAppearance,
  fetchUserBadgeIds,
  fetchInventoryItemIds,
  fetchDistrictUnlockIds,
  saveAppearance,
} from './lib/profile';

/*
  App.tsx
  ───────
  Screen flow:

    LandingPage
      │
      ├─ (Supabase configured) → AuthPage ──┐
      │                                      │
      └─ (no Supabase / guest)               ▼
                                        OutfitSelectPage
                                              │
                                              ▼
                                          GamePage

  Profile sync — what is loaded before OutfitSelectPage/GamePage mount:
    ✓  profile.username       → playerName
    ✓  character_appearance   → appearance (opens creator pre-filled)
    ✓  profile.rep            → initialRep (GamePage starts with saved REP)
    ✓  player_badges          → initialBadgeIds (badges already marked unlocked)
    ✓  player_inventory       → initialOwnedItemIds (items confirmed in DB)
    ✓  district_unlocks       → initialDistrictIds (districts restored as unlocked)
  Deferred (not this task):
    –  quests
  Guests: local-only, unchanged.
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
  // Loaded from profile before GamePage mounts — guests stay at defaults.
  const [initialRep, setInitialRep]             = useState(0);
  const [initialBadgeIds, setInitialBadgeIds]   = useState<string[]>([]);
  const [initialOwnedItemIds, setInitialOwnedItemIds] = useState<string[]>([]);
  const [initialDistrictIds, setInitialDistrictIds]   = useState<string[]>([]);

  /* ── Supabase: auth listener + profile sync ──────────────────── */
  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    /**
     * Fetch profile, appearance, rep, and badges for `userId` in parallel.
     * Any failure falls back silently to local defaults.
     */
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

        // Username
        if (profile?.username) setPlayerName(profile.username);
        else setPlayerName(prev => prev || emailFallback);

        // Appearance
        if (savedApp) setAppearance(savedApp);

        // REP (profile.rep is 0 for new users, which is the correct default)
        if (profile?.rep) setInitialRep(profile.rep);

        // Badges
        if (badgeIds.length) setInitialBadgeIds(badgeIds);

        // Inventory items
        if (itemIds.length) setInitialOwnedItemIds(itemIds);

        // Districts
        if (districtIds.length) setInitialDistrictIds(districtIds);
      } catch {
        if (!cancelled) setPlayerName(prev => prev || emailFallback);
      }
    };

    // Restore existing session on mount — sets state without navigating
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user || cancelled) return;
      const { id, email } = session.user;
      setUser({ id, email: email ?? null });
      loadUserData(id, email?.split('@')[0] ?? 'Degen');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_IN' && session?.user) {
          const { id, email } = session.user;
          setUser({ id, email: email ?? null });
          // Load all profile data THEN navigate so OutfitSelectPage/GamePage
          // mount with the correct initial values already in state.
          loadUserData(id, email?.split('@')[0] ?? 'Degen').then(() => {
            if (cancelled) return;
            setScreen(prev =>
              prev === 'landing' || prev === 'auth' ? 'outfit' : prev,
            );
          });
        }

        if (event === 'SIGNED_OUT') {
          if (!cancelled) {
            setUser(null);
            setPlayerName('');
            setAppearance(DEFAULT_APPEARANCE);
            setInitialRep(0);
            setInitialBadgeIds([]);
            setInitialOwnedItemIds([]);
            setInitialDistrictIds([]);
          }
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Handlers ────────────────────────────────────────────────── */

  const handleEnter = useCallback((name: string) => {
    setPlayerName(name);
    setScreen(isSupabaseConfigured ? 'auth' : 'outfit');
  }, []);

  /** Guest / auto-skip path from AuthPage (auth paths navigate via onAuthStateChange). */
  const handleGuestOrSkip = useCallback((name: string) => {
    if (name) setPlayerName(name);
    setScreen('outfit');
  }, []);

  const handleAppearanceSelect = useCallback(
    (picked: CharacterAppearance) => {
      setAppearance(picked);
      setScreen('game');
      if (user?.id) {
        saveAppearance(user.id, picked).catch(() => {});
      }
    },
    [user],
  );

  const handleLogout = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    setPlayerName('');
    setAppearance(DEFAULT_APPEARANCE);
    setInitialRep(0);
    setInitialBadgeIds([]);
    setInitialOwnedItemIds([]);
    setInitialDistrictIds([]);
    setScreen('landing');
  }, []);

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
        guestName={playerName}
        onComplete={handleGuestOrSkip}
      />
    );
  }

  return <LandingPage onEnter={handleEnter} />;
}
