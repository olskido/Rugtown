/**
 * Phase 10L character system static suite entry.
 */
import { spawnSync } from 'child_process';
import path from 'path';

const root = process.cwd();
const scripts = [
  'validate-character-manifest.mjs',
  'validate-character-assets.mjs',
  'validate-character-loadout-security.mjs',
  'validate-character-animation-layout.mjs',
];

let failed = 0;
for (const s of scripts) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', s)], { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}
if (failed) {
  console.error(`\n${failed} character validator(s) failed`);
  process.exit(1);
}
console.log('\nvalidate-phase10l-character-system STATIC passed');
