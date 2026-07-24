/**
 * _shared/cors.ts — CORS handling for RugTown reward Edge Functions.
 * Allowed origins are configured server-side via ALLOWED_ORIGINS.
 */

import { getEnv } from './env.ts';

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (getEnv('ALLOWED_ORIGINS', '') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin =
    origin && (allowed.length === 0 || allowed.includes(origin)) ? origin : (allowed[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) });
  }
  return null;
}
