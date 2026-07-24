/**
 * generate-minimap-texture.mjs — Phase 10C
 * Creates a reduced main_rugtown minimap texture (half resolution + subtle darken).
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.cwd();
const src = path.join(root, 'public/assets/world/main_rugtown.png');
const out = path.join(root, 'public/assets/world/minimap_rugtown.png');

if (!fs.existsSync(src)) {
  console.error('FAIL main_rugtown.png missing');
  process.exit(1);
}

const meta = await sharp(src).metadata();
const targetW = Math.round((meta.width ?? 2172) / 2);
const targetH = Math.round((meta.height ?? 724) / 2);

await sharp(src)
  .resize(targetW, targetH, { fit: 'fill' })
  .modulate({ brightness: 0.92, saturation: 0.95 })
  .png({ compressionLevel: 9 })
  .toFile(out);

const outMeta = await sharp(out).metadata();
console.log(`OK minimap texture ${outMeta.width}x${outMeta.height} → public/assets/world/minimap_rugtown.png`);
