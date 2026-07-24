/**
 * Detect forbidden secret patterns in production bundle (if present).
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC bundle scan\n');

if (!fs.existsSync(dist)) {
  console.log('SKIP dist/ not built yet');
  process.exit(0);
}

const patterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]/i,
  /service_role_[a-zA-Z0-9]{20,}/i,
  /BEGIN RSA PRIVATE KEY/,
  /eyJhbGciOi.*service_role/i,
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(js|css|html|map)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

for (const f of walk(dist)) {
  const t = fs.readFileSync(f, 'utf8');
  for (const re of patterns) {
    if (re.test(t)) fail(`secret-like pattern in ${path.relative(root, f)}`);
  }
}
ok('no obvious secret patterns in dist');

console.log('\n---');
if (errors.length) {
  console.error(`${errors.length} failure(s)`);
  process.exit(1);
}
console.log('validate-bundle-secrets STATIC passed');
