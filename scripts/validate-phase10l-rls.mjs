/**
 * Static RLS / grant checks for Phase 10L.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql'), 'utf8');

if ((sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length < 10) fail('insufficient RLS enables');
else ok('RLS enabled on 10L tables');
if (!sql.includes('REVOKE ALL ON FUNCTION')) fail('PUBLIC execute revoke');
else ok('PUBLIC execute revoked');
if (!sql.includes('character cosmetics owner read')) fail('cosmetic owner policy');
else ok('cosmetic owner read policy');
if (sql.includes('FOR INSERT') && sql.includes('player_character_cosmetics')) {
  // should not have permissive insert policy for players
  const insertCosmetic = /player_character_cosmetics[\s\S]{0,200}FOR INSERT/;
  if (insertCosmetic.test(sql)) fail('player cosmetic INSERT policy present');
  else ok('no player cosmetic INSERT policy');
} else ok('no player cosmetic INSERT policy');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-phase10l-rls STATIC passed');
