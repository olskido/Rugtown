/**
 * Phase 10L character security static checks (alias of loadout security + spoof notes).
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const root = process.cwd();
console.log('Mode: STATIC\n');

const r = spawnSync(process.execPath, [path.join(root, 'scripts/validate-character-loadout-security.mjs')], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);

const gp = fs.readFileSync(path.join(root, 'src/components/GamePage.tsx'), 'utf8');
if (!gp.includes('getPublicLoadout') || !gp.includes('applyTrustedRemoteAppearances')) {
  console.error('FAIL remote appearance overlay missing');
  process.exit(1);
}
console.log('OK  remote loadout overlay wired');
console.log('\nvalidate-phase10l-character-security STATIC passed');
