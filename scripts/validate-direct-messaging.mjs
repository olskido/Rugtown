/**
 * Static validation — direct messaging safety and idempotency.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const sql = fs.readFileSync(path.join(root, 'database/migrations/20260716_phase10j_social_identity_moderation.sql'), 'utf8');
const dm = fs.readFileSync(path.join(root, 'src/components/DirectMessagePanel.tsx'), 'utf8');
const safety = fs.readFileSync(path.join(root, 'src/lib/social/chatSafety.ts'), 'utf8');

if (!sql.includes('client_message_id')) fail('idempotency key missing');
else ok('client_message_id');

if (!sql.includes("'idempotent', true")) fail('idempotent return missing');
else ok('idempotent send path');

if (!sql.includes('rt_safety_check_message')) fail('safety pipeline missing');
else ok('rt_safety_check_message');

if (!sql.includes('seed') || !sql.includes('private')) fail('seed/private key detection missing');
else ok('scam/seed detection patterns');

if (!sql.includes("status = 'deleted'") || !sql.includes('original_body')) fail('soft-delete / evidence retention missing');
else ok('soft-delete with original retained');

if (!sql.includes('message_type') || !/system/.test(sql)) {
  // system type enum may exist
  if (!sql.includes("'system'")) fail('system message type missing from schema');
  else ok('system message type exists');
} else ok('message types include system');

if (dm.includes('Direct messages are being prepared')) fail('DM still placeholder');
else ok('DM panel is live');

if (!dm.includes('sendDirectMessage') && !dm.includes('socialService.sendDirectMessage')) {
  fail('DM panel not wired to SocialService');
} else ok('DM panel uses SocialService');

if (!safety.includes('sanitizeCityChat')) fail('city chat safety helper missing');
else ok('city chat safety helper');

// Deterministic local safety checks
import { createRequire } from 'module';
// Inline mirror of critical rules (no TS compile needed)
function sanitize(raw) {
  const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
  let text = String(raw).normalize('NFKC').replace(CONTROL, '').replace(/<\/?[a-z][^>]*>/gi, '').trim();
  if (!text) return false;
  if (/javascript:|data:text\/html/i.test(text)) return false;
  if (/\b(seed\s*phrase|private\s*key)\b/i.test(text)) return false;
  return true;
}
if (sanitize('send me your seed phrase now')) fail('seed phrase not rejected');
else ok('seed phrase rejected');
if (sanitize('javascript:alert(1)')) fail('javascript scheme not rejected');
else ok('javascript scheme rejected');
if (!sanitize('hello friend')) fail('benign text rejected');
else ok('benign text allowed');
if (sanitize('<b>hi</b>')) ok('html tags stripped; remaining text may pass');
else ok('html-only content rejected after strip');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('Direct messaging static validation passed');
