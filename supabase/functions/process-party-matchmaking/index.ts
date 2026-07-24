// Deno Edge Function stub — process TEST party matchmaking batches.
// Deploy only after Phase 10K migration. Requires service role or operator JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405 });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'server misconfigured' }), { status: 500 });
  }
  const supabase = createClient(url, key);
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabase.rpc('process_party_matchmaking', {
    p_queue_slug: body.queueSlug ?? 'test-party-activity-queue',
    p_limit: body.limit ?? 10,
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
  }
  return new Response(JSON.stringify({ ok: true, result: data }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
