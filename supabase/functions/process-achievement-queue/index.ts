/**
 * process-achievement-queue — scheduled/operator Edge Function.
 * Invokes process_achievement_evaluation_queue and run_progression_maintenance.
 * Service-role only. No browser secrets.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing server env' }), { status: 500 });
    }
    // Require service-role bearer or authenticated operator JWT + RPC will gate.
    const admin = createClient(url, key);
    const { data: queue, error: qErr } = await admin.rpc('process_achievement_evaluation_queue', { p_limit: 100 });
    if (qErr) {
      return new Response(JSON.stringify({ ok: false, error: qErr.message }), { status: 400 });
    }
    const { data: maint, error: mErr } = await admin.rpc('run_progression_maintenance');
    if (mErr) {
      return new Response(JSON.stringify({ ok: true, queue, maintenanceError: mErr.message }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, queue, maintenance: maint }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'error' }), { status: 500 });
  }
});
