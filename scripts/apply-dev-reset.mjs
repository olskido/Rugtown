/**
 * Apply DEV public-schema reset + full bootstrap against Supabase Postgres.
 *
 * Requires a privileged connection string (not the anon key), e.g.:
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres
 *
 * Or session-mode direct:
 *   postgresql://postgres:[PASSWORD]@db.[ref].supabase.co:5432/postgres
 *
 * Usage:
 *   SUPABASE_DB_URL=… node scripts/apply-dev-reset.mjs
 *
 * Does NOT read or modify VITE_SUPABASE_* connection settings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sqlPath = path.join(root, 'database/release/dev_public_schema_reset_then_bootstrap.sql');

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(`
BLOCKED: No privileged database URL found.

Set one of:
  SUPABASE_DB_URL
  DATABASE_URL

Do NOT use the anon key. Use the database password from:
  Supabase Dashboard → Project Settings → Database → Connection string

Example:
  SUPABASE_DB_URL="postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" node scripts/apply-dev-reset.mjs
`);
  process.exit(2);
}

if (!fs.existsSync(sqlPath)) {
  console.error('Missing', sqlPath, '— run: node scripts/generate-dev-reset-bootstrap.mjs');
  process.exit(1);
}

console.log('Applying', sqlPath);
console.log('Target host:', (() => {
  try {
    return new URL(dbUrl.replace(/^postgresql:/, 'http:')).host;
  } catch {
    return '(parse failed)';
  }
})());

const psql = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

if (psql.error) {
  // Fallback: use node-postgres if available
  console.error('psql not available:', psql.error.message);
  console.error('Install psql, or provide SUPABASE_DB_URL and install `pg` for the JS fallback.');
  process.exit(1);
}

process.stdout.write(psql.stdout || '');
process.stderr.write(psql.stderr || '');
process.exit(psql.status ?? 1);
