/**
 * Auth email / OAuth redirect helpers.
 *
 * Always use the active browser origin so local (`localhost:3000`) and
 * Vercel production share the same code path — never hardcode localhost
 * or a production domain here.
 */

import { supabase } from './supabase';

/** Canonical post-confirm / OAuth return path. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Redirect target passed to `signUp({ options: { emailRedirectTo } })`.
 * Must also be listed under Supabase → Authentication → Redirect URLs.
 */
export function getAuthEmailRedirectTo(): string {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

/** True when the current URL is the email-confirmation / OAuth callback. */
export function isAuthCallbackPath(pathname = window.location.pathname): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === AUTH_CALLBACK_PATH;
}

export type AuthCallbackResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist the session from a confirmation / magic-link / OAuth return URL.
 * Supports PKCE (`?code=`) and legacy hash tokens (`#access_token=`).
 * Clears the sensitive query/hash from the address bar on success.
 */
export async function handleAuthCallback(): Promise<AuthCallbackResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const url = new URL(window.location.href);
  const errorParam =
    url.searchParams.get('error_description')
    ?? url.searchParams.get('error')
    ?? null;

  if (errorParam) {
    return { ok: false, error: errorParam };
  }

  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
    } else {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        return { ok: false, error: error.message };
      }
      if (!session) {
        return {
          ok: false,
          error: 'Missing confirmation code. Open the link from your email again.',
        };
      }
    }
  }

  // Drop tokens / code from the URL so a refresh does not re-exchange.
  window.history.replaceState({}, document.title, '/');
  return { ok: true };
}
