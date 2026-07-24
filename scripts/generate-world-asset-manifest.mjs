/**
 * generate-world-asset-manifest.mjs
 * ─────────────────────────────────
 * Phase 7A — Inventory PNG library under public/assets/world/{landmarks,commercial,...}
 * Writes a Vite-importable JSON manifest. Does NOT resize or modify source PNGs.
 *
 * Run: node scripts/generate-world-asset-manifest.mjs
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, relative, extname, basename, sep } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WORLD_DIR = join(ROOT, 'public', 'assets', 'world');
const OUT_JSON = join(ROOT, 'src', 'game', 'data', 'world-asset-library-manifest.json');
const OUT_REPORT = join(ROOT, 'docs', 'WORLD_ASSET_LIBRARY_QA_REPORT.md');

/** New Phase 7A library folders only (not building-assets-v1 / environment-kit-v1). */
const LIBRARY_CATEGORIES = [
  'landmarks',
  'commercial',
  'residential',
  'props',
  'nature',
  'terrain',
  'park',
];

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (IMAGE_EXT.has(extname(name).toLowerCase())) acc.push(p);
  }
  return acc;
}

/** Stable Phaser texture key: world-{folder}-{filename-stem} */
export function textureKeyFromRel(relPosix) {
  const parts = relPosix.replace(/\\/g, '/').split('/');
  const file = parts.pop() ?? '';
  const stem = file.replace(/\.[^.]+$/, '');
  const slug = [...parts, stem]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return `world-${slug}`;
}

function isUnusualFilename(name) {
  const reasons = [];
  if (/^assets_?\.png$/i.test(name)) reasons.push('generic/placeholder name');
  if (/_+\./.test(name)) reasons.push('trailing underscore before extension');
  if (/[A-Z]/.test(name) && /[a-z]/.test(name) && name !== name.toLowerCase()) {
    reasons.push('mixed case (keys are lowercased)');
  }
  if (/\s/.test(name)) reasons.push('contains whitespace');
  if (/[^a-zA-Z0-9._-]/.test(name)) reasons.push('non-standard characters');
  if (/^[Pp]_/.test(name)) reasons.push('ambiguous P_/p_ prefix');
  return reasons;
}

async function analyzePadding(filePath) {
  try {
    const { data, info } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    let minX = width, minY = height, maxX = 0, maxY = 0, opaque = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > 16) {
          opaque++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (opaque === 0) {
      return { opaque: 0, paddingRatio: 1, contentW: 0, contentH: 0 };
    }
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const contentArea = contentW * contentH;
    const paddingRatio = 1 - contentArea / (width * height);
    return { opaque, paddingRatio, contentW, contentH, contentBox: { minX, minY, maxX, maxY } };
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  mkdirSync(dirname(OUT_REPORT), { recursive: true });

  const assets = [];
  const keyMap = new Map();
  const duplicates = [];
  const unusual = [];
  const extreme = [];
  const missingFolders = [];

  for (const cat of LIBRARY_CATEGORIES) {
    const catDir = join(WORLD_DIR, cat);
    if (!existsSync(catDir)) {
      missingFolders.push(cat);
      continue;
    }
    const files = walk(catDir);
    for (const abs of files) {
      const rel = relative(WORLD_DIR, abs).replace(/\\/g, '/');
      const file = basename(abs);
      const category = rel.split('/')[0];
      const key = textureKeyFromRel(rel);
      const url = `/assets/world/${rel}`;

      if (keyMap.has(key)) {
        duplicates.push({ key, a: keyMap.get(key), b: rel });
      } else {
        keyMap.set(key, rel);
      }

      const reasons = isUnusualFilename(file);
      if (reasons.length) unusual.push({ path: rel, reasons });

      let width = 0;
      let height = 0;
      let hasAlpha = false;
      try {
        const meta = await sharp(abs).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
        hasAlpha = !!meta.hasAlpha;
      } catch (err) {
        unusual.push({ path: rel, reasons: [`metadata read failed: ${err.message}`] });
      }

      const pad = await analyzePadding(abs);
      if (width > 2048 || height > 2048) {
        extreme.push({ path: rel, width, height, note: 'large dimensions' });
      }
      if (pad && pad.paddingRatio > 0.95 && pad.opaque > 0) {
        extreme.push({
          path: rel,
          width,
          height,
          note: `excessive transparent padding (${Math.round(pad.paddingRatio * 100)}% empty canvas)`,
        });
      }

      assets.push({
        key,
        category,
        relativePath: rel,
        filename: file,
        url,
        width,
        height,
        hasAlpha,
        contentW: pad?.contentW ?? null,
        contentH: pad?.contentH ?? null,
        paddingRatio: pad ? Math.round(pad.paddingRatio * 1000) / 1000 : null,
      });
    }
  }

  assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const byCategory = {};
  for (const cat of LIBRARY_CATEGORIES) byCategory[cat] = 0;
  for (const a of assets) byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;

  const manifest = {
    version: '7a-library',
    generatedAt: new Date().toISOString(),
    rootUrl: '/assets/world',
    categories: LIBRARY_CATEGORIES,
    totalAssets: assets.length,
    byCategory,
    missingFolders,
    duplicateKeys: duplicates,
    unusualFilenames: unusual,
    extremeNotes: extreme,
    assets,
  };

  writeFileSync(OUT_JSON, JSON.stringify(manifest, null, 2));

  const lines = [
    '# World Asset Library QA Report (Phase 7A)',
    '',
    `Generated: ${manifest.generatedAt}`,
    '',
    `**Total assets:** ${manifest.totalAssets}`,
    '',
    '## Category counts',
    '',
    ...LIBRARY_CATEGORIES.map((c) => `- **${c}:** ${byCategory[c] ?? 0}`),
    '',
    `## Duplicate texture keys: ${duplicates.length}`,
    duplicates.length ? duplicates.map((d) => `- \`${d.key}\`: ${d.a} vs ${d.b}`).join('\n') : '_None_',
    '',
    `## Unusual filenames: ${unusual.length}`,
    unusual.length
      ? unusual.map((u) => `- \`${u.path}\` — ${u.reasons.join('; ')}`).join('\n')
      : '_None_',
    '',
    `## Extreme dimensions / padding: ${extreme.length}`,
    extreme.length
      ? extreme.map((e) => `- \`${e.path}\` (${e.width}×${e.height}) — ${e.note}`).join('\n')
      : '_None_',
    '',
    `## Missing folders: ${missingFolders.length ? missingFolders.join(', ') : 'None'}`,
    '',
  ];
  writeFileSync(OUT_REPORT, lines.join('\n'));

  console.log(`Wrote ${assets.length} assets → ${OUT_JSON}`);
  console.log('By category:', byCategory);
  console.log(`Duplicates: ${duplicates.length}, unusual: ${unusual.length}, extreme: ${extreme.length}`);
  console.log(`Report → ${OUT_REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
