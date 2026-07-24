/**
 * Slice rugtown-building-asset-sheet-v1.png into individual PNGs.
 * Run: node scripts/slice-building-asset-sheet.mjs
 */
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'docs/rugtown-building-asset-sheet-v1.json'), 'utf8'));
const sheetPath = join(root, 'docs', manifest.sheetFile);
const outDir = join(root, 'docs', 'building-assets-v1');
mkdirSync(outDir, { recursive: true });

const { width: cellW, height: cellH } = manifest.cellSize;

for (const b of manifest.buildings) {
  const left = b.col * cellW;
  const top = b.row * cellH;
  const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const out = join(outDir, `${String(b.id).padStart(2, '0')}-${slug}.png`);
  await sharp(sheetPath)
    .extract({ left, top, width: cellW, height: cellH })
    .png()
    .toFile(out);
  console.log('Wrote', out);
}

console.log('Done —', manifest.buildings.length, 'assets in', outDir);
console.log('Next: node scripts/clean-world-asset-transparency.mjs && node scripts/sync-world-assets.mjs');
