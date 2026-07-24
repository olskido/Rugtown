/**
 * Copies world placement assets from docs/ → public/assets/world/
 * and mirrors the manifest into src/game/data/ for TypeScript import.
 *
 * Run: node scripts/sync-world-assets.mjs
 *
 * Tip: run scripts/clean-world-asset-transparency.mjs first if sheet PNGs were re-sliced.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'public', 'assets', 'world');
const MANIFEST_SRC = join(ROOT, 'docs', 'rugtown-world-placement-manifest.json');
const MANIFEST_TS = join(ROOT, 'src', 'game', 'data', 'world-placement-manifest.json');

mkdirSync(OUT, { recursive: true });
mkdirSync(dirname(MANIFEST_TS), { recursive: true });

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else cpSync(s, d);
  }
}

copyDir(join(ROOT, 'docs', 'building-assets-v1'), join(OUT, 'building-assets-v1'));
copyDir(join(ROOT, 'docs', 'environment-kit-v1'), join(OUT, 'environment-kit-v1'));

const manifest = readFileSync(MANIFEST_SRC, 'utf8');
writeFileSync(join(OUT, 'rugtown-world-placement-manifest.json'), manifest);
writeFileSync(MANIFEST_TS, manifest);

const data = JSON.parse(manifest);
const missing = [];
for (const p of data.placements) {
  const rel = p.sourceImagePath.replace(/^docs\//, '');
  const disk = join(OUT, rel);
  if (!existsSync(disk)) missing.push(p.sourceImagePath);
}

console.log(`Synced world assets → ${OUT}`);
console.log(`Manifest → public + src/game/data (${data.placements.length} placements)`);
if (missing.length) {
  console.warn('Missing files:', missing.length);
  missing.forEach((m) => console.warn('  -', m));
  process.exit(1);
}
console.log('All placement image paths verified on disk.');
