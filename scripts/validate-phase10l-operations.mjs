/**
 * Static operations dashboard / maintenance checks for Phase 10L.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');
const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10l_characters_events_tournaments_guilds.sql'), 'utf8');
if (!sql.includes('get_phase10l_ops_dashboard')) fail('ops dashboard');
else ok('ops dashboard');
if (!sql.includes('run_phase10l_maintenance')) fail('maintenance');
else ok('maintenance');

const opsUi = fs.readFileSync(path.join(root, 'src/components/RewardOperationsPanel.tsx'), 'utf8');
if (!opsUi.includes('get_phase10l_ops_dashboard')) fail('ops UI missing dashboard RPC');
else ok('ops UI wired');
if (!opsUi.includes('run_phase10l_maintenance')) fail('ops UI missing maintenance');
else ok('ops UI maintenance');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-phase10l-operations STATIC passed');
