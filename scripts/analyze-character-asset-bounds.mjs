/**
 * analyze-character-asset-bounds.mjs
 * ────────────────────────────────────
 * Phase 11C — build-time transparent-bounds QA report for every
 * currently creator-enabled character asset (bases, hair, facial-hair,
 * headwear, pants) plus a sample of NPC bodies. Writes deterministic
 * JSON + a human-readable Markdown summary under docs/character-system/qa/.
 *
 * This does NOT run at game runtime — it is an offline audit tool, and
 * also the data source install-character-assets.mjs uses to compute
 * real per-asset attachment offsets (see analyzeAtlasDirectory()).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeAtlasDirectory, analyzeSingleImage } from './lib/character-bounds-analysis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PIPELINE = path.join(ROOT, 'rugtown_asset_pipeline');
const ATLASES_DIR = path.join(PIPELINE, 'atlases');
const BASES_DIR = path.join(ROOT, 'public', 'assets', 'characters', 'bases');
const OUT_DIR = path.join(ROOT, 'docs', 'character-system', 'qa');
const METADATA_PATH = path.join(PIPELINE, 'metadata_assets.json');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function main() {
  console.log('=== Character transparent-bounds analysis ===\n');
  if (!fs.existsSync(ATLASES_DIR)) {
    console.error('FAIL: pipeline atlases dir missing:', ATLASES_DIR);
    process.exit(1);
  }
  ensureDir(OUT_DIR);

  const atlasResults = await analyzeAtlasDirectory(ATLASES_DIR);
  console.log(`analyzed ${atlasResults.size} atlas frames`);

  const baseResults = new Map();
  if (fs.existsSync(BASES_DIR)) {
    for (const f of fs.readdirSync(BASES_DIR).filter((f) => f.endsWith('.png'))) {
      const result = await analyzeSingleImage(path.join(BASES_DIR, f));
      baseResults.set(f.replace(/\.png$/, ''), result);
    }
  }
  console.log(`analyzed ${baseResults.size} base bodies`);

  let metadata = [];
  try { metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8')); } catch { /* optional */ }
  const metaById = new Map(metadata.map((m) => [m.id, m]));

  const report = {
    generatedAt: new Date().toISOString(),
    alphaThreshold: 12,
    mirrorDiffOk: 0.14,
    frames: [],
    bases: [],
    summary: { byCategory: {}, mirrorSafeCount: 0, mirrorUnsafeCount: 0, notOk: 0 },
  };

  for (const [name, result] of atlasResults) {
    const meta = metaById.get(name);
    const category = meta?.category ?? 'unknown';
    report.summary.byCategory[category] = (report.summary.byCategory[category] || 0) + 1;
    if (!result.ok) { report.summary.notOk++; }
    else if (result.mirrorSafe) report.summary.mirrorSafeCount++;
    else report.summary.mirrorUnsafeCount++;
    report.frames.push({
      id: name,
      category,
      displayName: meta?.displayName ?? name,
      atlasKey: result.atlasKey,
      ...result,
    });
  }
  for (const [id, result] of baseResults) {
    report.bases.push({ id, ...result });
  }

  report.frames.sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(path.join(OUT_DIR, 'transparent-bounds-report.json'), JSON.stringify(report, null, 2));

  const md = [
    '# Character transparent-bounds report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Frames analyzed: ${report.frames.length} · Bases analyzed: ${report.bases.length}`,
    '',
    '## By category',
    '',
    '| Category | Frame count |',
    '|---|---|',
    ...Object.entries(report.summary.byCategory).map(([c, n]) => `| ${c} | ${n} |`),
    '',
    '## Mirror-symmetry',
    '',
    `- Mirror-safe (diff ≤ ${report.mirrorDiffOk}): ${report.summary.mirrorSafeCount}`,
    `- NOT mirror-safe (asymmetric art — do not fake left/right via flip): ${report.summary.mirrorUnsafeCount}`,
    `- Fully transparent / unreadable: ${report.summary.notOk}`,
    '',
    '## Not mirror-safe (sample, first 30) — these must not be silently flipped for left/right facing',
    '',
    '| id | category | mirrorDiffRatio |',
    '|---|---|---|',
    ...report.frames
      .filter((f) => f.ok && !f.mirrorSafe)
      .slice(0, 30)
      .map((f) => `| ${f.id} | ${f.category} | ${f.mirrorDiffRatio.toFixed(3)} |`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'transparent-bounds-report.md'), md);

  console.log('\nwrote', path.join(OUT_DIR, 'transparent-bounds-report.json'));
  console.log('wrote', path.join(OUT_DIR, 'transparent-bounds-report.md'));
  console.log('mirror-safe:', report.summary.mirrorSafeCount, 'not mirror-safe:', report.summary.mirrorUnsafeCount);
}

main().catch((e) => { console.error(e); process.exit(1); });
