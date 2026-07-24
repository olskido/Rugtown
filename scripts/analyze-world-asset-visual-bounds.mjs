/**
 * analyze-world-asset-visual-bounds.mjs
 * ─────────────────────────────────────
 * Phase 7B — Measure visible alpha bounds for the world PNG library.
 * Does NOT crop, resize, or modify any source PNG.
 *
 * Run: node scripts/analyze-world-asset-visual-bounds.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WORLD_DIR = join(ROOT, 'public', 'assets', 'world');
const LIBRARY_MANIFEST = join(ROOT, 'src', 'game', 'data', 'world-asset-library-manifest.json');
const OUT_JSON = join(ROOT, 'src', 'game', 'data', 'world-asset-visual-bounds.json');
const OUT_REPORT = join(ROOT, 'docs', 'WORLD_ASSET_VISUAL_BOUNDS_QA.md');

/** Alpha below this is treated as empty (ignore near-invisible fringe). */
const ALPHA_THRESHOLD = 16;
/** Flag occupancy below this. */
const LOW_OCCUPANCY = 0.05;
/** Flag tiny visible content (either axis). */
const TINY_VISIBLE_PX = 8;

async function measureVisibleBounds(absPath) {
  const { data, info } = await sharp(absPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sourceWidth = info.width;
  const sourceHeight = info.height;
  let minX = sourceWidth;
  let minY = sourceHeight;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const a = data[(y * sourceWidth + x) * 4 + 3];
      if (a <= ALPHA_THRESHOLD) continue;
      opaque++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (opaque === 0 || maxX < minX) {
    return {
      ok: false,
      sourceWidth,
      sourceHeight,
      visibleX: 0,
      visibleY: 0,
      visibleWidth: 0,
      visibleHeight: 0,
      visibleCenterX: sourceWidth / 2,
      visibleCenterY: sourceHeight / 2,
      visibleBottomY: sourceHeight,
      occupancyRatio: 0,
      opaquePixels: 0,
    };
  }

  const visibleWidth = maxX - minX + 1;
  const visibleHeight = maxY - minY + 1;
  const visibleCenterX = minX + visibleWidth / 2;
  const visibleCenterY = minY + visibleHeight / 2;
  const visibleBottomY = maxY + 1; // exclusive bottom edge in texture space
  const occupancyRatio = opaque / (sourceWidth * sourceHeight);

  return {
    ok: true,
    sourceWidth,
    sourceHeight,
    visibleX: minX,
    visibleY: minY,
    visibleWidth,
    visibleHeight,
    visibleCenterX: Math.round(visibleCenterX * 1000) / 1000,
    visibleCenterY: Math.round(visibleCenterY * 1000) / 1000,
    visibleBottomY,
    occupancyRatio: Math.round(occupancyRatio * 100000) / 100000,
    opaquePixels: opaque,
  };
}

async function main() {
  if (!existsSync(LIBRARY_MANIFEST)) {
    console.error('Missing library manifest. Run: node scripts/generate-world-asset-manifest.mjs');
    process.exit(1);
  }

  const library = JSON.parse(readFileSync(LIBRARY_MANIFEST, 'utf8'));
  const assets = [];
  const failures = [];
  const lowOccupancy = [];
  const tinyVisible = [];

  for (const entry of library.assets) {
    const abs = join(WORLD_DIR, entry.relativePath);
    if (!existsSync(abs)) {
      failures.push({ key: entry.key, path: entry.relativePath, reason: 'file missing on disk' });
      continue;
    }

    try {
      const bounds = await measureVisibleBounds(abs);
      const record = {
        key: entry.key,
        relativePath: entry.relativePath,
        filename: entry.filename,
        category: entry.category,
        ...bounds,
      };
      assets.push(record);

      if (!bounds.ok) {
        failures.push({ key: entry.key, path: entry.relativePath, reason: 'no visible pixels above alpha threshold' });
      } else {
        if (bounds.occupancyRatio < LOW_OCCUPANCY) {
          lowOccupancy.push(record);
        }
        if (bounds.visibleWidth < TINY_VISIBLE_PX || bounds.visibleHeight < TINY_VISIBLE_PX) {
          tinyVisible.push(record);
        }
      }
    } catch (err) {
      failures.push({ key: entry.key, path: entry.relativePath, reason: String(err.message || err) });
    }
  }

  assets.sort((a, b) => a.key.localeCompare(b.key));
  lowOccupancy.sort((a, b) => a.occupancyRatio - b.occupancyRatio);

  const byKey = {};
  for (const a of assets) byKey[a.key] = a;

  const out = {
    version: '7b-visual-bounds',
    generatedAt: new Date().toISOString(),
    alphaThreshold: ALPHA_THRESHOLD,
    totalAssets: assets.length,
    validBounds: assets.filter((a) => a.ok).length,
    failedCount: failures.length,
    lowOccupancyCount: lowOccupancy.length,
    tinyVisibleCount: tinyVisible.length,
    failures,
    lowOccupancy: lowOccupancy.map((a) => ({
      key: a.key,
      relativePath: a.relativePath,
      occupancyRatio: a.occupancyRatio,
      visibleWidth: a.visibleWidth,
      visibleHeight: a.visibleHeight,
    })),
    tinyVisible: tinyVisible.map((a) => ({
      key: a.key,
      relativePath: a.relativePath,
      visibleWidth: a.visibleWidth,
      visibleHeight: a.visibleHeight,
    })),
    assets: byKey,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

  const lowest = [...assets]
    .filter((a) => a.ok)
    .sort((a, b) => a.occupancyRatio - b.occupancyRatio)
    .slice(0, 15);

  const report = [
    '# World Asset Visual Bounds QA (Phase 7B)',
    '',
    `Generated: ${out.generatedAt}`,
    `Alpha threshold: ${ALPHA_THRESHOLD}`,
    '',
    `**Analyzed:** ${out.totalAssets}`,
    `**Valid bounds:** ${out.validBounds}`,
    `**Failures:** ${out.failedCount}`,
    `**Occupancy < 5%:** ${out.lowOccupancyCount}`,
    `**Tiny visible (< ${TINY_VISIBLE_PX}px axis):** ${out.tinyVisibleCount}`,
    '',
    '## Failures',
    failures.length
      ? failures.map((f) => `- \`${f.path}\` (${f.key}) — ${f.reason}`).join('\n')
      : '_None_',
    '',
    '## Lowest occupancy (top 15)',
    ...lowest.map(
      (a) =>
        `- \`${a.relativePath}\` — ${(a.occupancyRatio * 100).toFixed(2)}% · visible ${a.visibleWidth}×${a.visibleHeight} of ${a.sourceWidth}×${a.sourceHeight}`,
    ),
    '',
  ];
  writeFileSync(OUT_REPORT, report.join('\n'));

  console.log(`Analyzed ${out.totalAssets} → ${OUT_JSON}`);
  console.log(`Valid: ${out.validBounds}, failed: ${out.failedCount}, low occupancy: ${out.lowOccupancyCount}`);
  console.log('Lowest occupancy:');
  for (const a of lowest.slice(0, 8)) {
    console.log(`  ${(a.occupancyRatio * 100).toFixed(2)}%  ${a.relativePath}  visible ${a.visibleWidth}×${a.visibleHeight}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
