/**
 * _shared/auth.ts — authenticate the calling user from the JWT.
 * Uses the anon-scoped client bound to the caller token to resolve auth.uid().
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadSettlementEnv } from './env.ts';
import { HandledError } from './errors.ts';

export interface AuthedContext {
  userId: string;
  token: string;
  /** Service-role client — full DB access, server-only. */
  admin: SupabaseClient;
}

export async function authenticate(req: Request): Promise<AuthedContext> {
  const env = loadSettlementEnv();
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HandledError('unauthenticated', 'Missing bearer token', 401);

  const userClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    throw new HandledError('unauthenticated', 'Invalid session', 401);
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey);
  return { userId: data.user.id, token, admin };
}

export async function requireOperator(
  ctx: AuthedContext,
  minRole: 'operator' | 'reviewer' | 'admin' = 'operator',
): Promise<void> {
  const { data, error } = await ctx.admin
    .from('reward_operators')
    .select('role, active')
    .eq('player_id', ctx.userId)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) throw new HandledError('forbidden', 'Operator authorization required', 403);
  const role = data.role as string;
  const ok =
    minRole === 'operator' ||
    (minRole === 'reviewer' && (role === 'reviewer' || role === 'admin')) ||
    (minRole === 'admin' && role === 'admin');
  if (!ok) throw new HandledError('forbidden', 'Insufficient operator role', 403);
}
