/**
 * Static security checks for character loadout RPCs.
 * Mode: STATIC — does not call live Supabase.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');

const mig = path.join(root, 'database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql');
if (!fs.existsSync(mig)) fail('10L migration missing');
const sql = fs.readFileSync(mig, 'utf8');

const required = [
  'update_character_loadout',
  'grant_character_cosmetic',
  'revoke_character_cosmetic',
  'get_public_character_loadout',
  'cosmetic not owned or invalid slot',
  'ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON FUNCTION',
];
for (const s of required) {
  if (!sql.includes(s)) fail(`missing ${s}`);
  else ok(s);
}

if (!sql.includes("GRANT EXECUTE ON FUNCTION public.grant_character_cosmetic") ||
    !sql.includes('rt_is_social_operator')) {
  fail('operator grant gating missing');
} else ok('operator grant gated');

// Client must not invent texture URLs in CharacterService
const svc = fs.readFileSync(path.join(root, 'src/lib/character/CharacterService.ts'), 'utf8');
if (/https?:\/\//.test(svc)) fail('CharacterService absolute URL');
else ok('CharacterService has no absolute URLs');
if (!svc.includes('update_character_loadout')) fail('client missing update RPC');
else ok('client uses update_character_loadout');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-character-loadout-security STATIC passed');
