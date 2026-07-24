/**
 * generate-environment-kit-v1.mjs
 * ───────────────────────────────
 * PHASE 2 — RugTown Environment Kit V1
 * Generates isolated transparent PNG props matching Building Asset Pack V1 style.
 *
 * Run: node scripts/generate-environment-kit-v1.mjs
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  drawLanternWall, drawLanternHanging, drawLanternPlaza, drawLanternBrazier,
  drawBench, drawTree, drawBush, drawFlowerBed, drawFence, drawWall,
  drawStairs, drawArch, drawPlanter, drawMarketStall, drawBarrel, drawCrate,
  drawBanner, drawBridge, drawStreetDecor,
} from './environment-kit-v1/draw-assets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'environment-kit-v1');

const CATEGORIES = [
  'lanterns', 'benches', 'fences', 'walls', 'stairs', 'arches', 'planters',
  'trees', 'bushes', 'flowers', 'market', 'bridges', 'banners', 'street',
  'decorations', 'crates', 'barrels',
];

for (const c of CATEGORIES) mkdirSync(join(OUT, c), { recursive: true });

/** @type {Array<object>} */
const manifest = {
  version: '1.0',
  sourceStyle: 'RugTown_Master_Concept_V1 + rugtown-building-asset-sheet-v1',
  palette: ['black obsidian', 'dark stone', 'bronze', 'gold', 'warm lantern glow'],
  perspective: '3/4 isometric top-down hybrid (matches Building Asset Pack)',
  assets: [],
};

let id = 0;
function add(category, name, file, opts, svgFn) {
  id += 1;
  manifest.assets.push({
    id: `env-${String(id).padStart(3, '0')}`,
    name,
    category,
    file: `${category}/${file}`,
    recommendedScale: opts.scale ?? 1.0,
    recommendedDepth: opts.depth ?? 1.3,
    recommendedDistricts: opts.districts ?? ['spawn', 'market', 'fame', 'alpha', 'whale', 'park', 'bridge', 'cashback', 'arena'],
    collisionRecommendation: opts.collision ?? 'none',
    footprintPx: opts.footprint ?? { w: 64, h: 64 },
  });
  return { category, file, svgFn };
}

const jobs = [];

// LANTERNS (10)
const lanternNames = [
  'wall-lantern-small', 'wall-lantern-large', 'wall-lantern-ornate',
  'hanging-lantern-single', 'hanging-lantern-triple', 'hanging-lantern-gilded',
  'plaza-lantern-short', 'plaza-lantern-tall', 'plaza-lantern-grand', 'bronze-brazier',
];
lanternNames.forEach((name, i) => {
  const fn = i < 3 ? () => drawLanternWall(i + 1)
    : i < 6 ? () => drawLanternHanging(i - 2)
    : i < 9 ? () => drawLanternPlaza(i - 5)
    : () => drawLanternBrazier();
  jobs.push(add('lanterns', name, `${name}.png`, {
    scale: 1.0, depth: 1.45, collision: 'none',
    footprint: { w: 48, h: 64 },
    districts: ['spawn', 'fame', 'market', 'park', 'bridge'],
  }, fn));
});

// BENCHES (8)
const benchTypes = ['stone', 'stone', 'wood', 'wood', 'luxury', 'luxury', 'garden', 'garden'];
benchTypes.forEach((t, i) => {
  const name = `${t}-bench-${i % 2 === 0 ? 'straight' : 'curved'}`;
  jobs.push(add('benches', name, `${name}.png`, {
    scale: 0.95, depth: 1.28, collision: 'soft-block',
    footprint: { w: 80, h: 32 },
    districts: ['spawn', 'park', 'fame', 'market'],
  }, () => drawBench(t, i)));
});

// TREES (12)
const treeDefs = [
  { name: 'oak-tree-a', kind: 'oak', variant: 0 },
  { name: 'oak-tree-b', kind: 'oak', variant: 1 },
  { name: 'pine-tree-a', kind: 'pine', variant: 2 },
  { name: 'pine-tree-b', kind: 'pine', variant: 3 },
  { name: 'dead-tree-a', kind: 'dead', variant: 4 },
  { name: 'dead-tree-b', kind: 'dead', variant: 5 },
  { name: 'decorative-tree-a', kind: 'decorative', variant: 6 },
  { name: 'decorative-tree-b', kind: 'decorative', variant: 7 },
  { name: 'plaza-tree-large', kind: 'oak', variant: 8, plaza: 'large' },
  { name: 'plaza-tree-small', kind: 'pine', variant: 9, plaza: 'small' },
  { name: 'oak-tree-c', kind: 'oak', variant: 10 },
  { name: 'pine-tree-c', kind: 'pine', variant: 11 },
];
treeDefs.forEach(({ name, kind, variant, plaza }) => {
  jobs.push(add('trees', name, `${name}.png`, {
    scale: plaza === 'large' ? 1.15 : plaza === 'small' ? 0.85 : 1.0,
    depth: 1.32, collision: 'soft-block',
    footprint: { w: 48, h: 48 },
    districts: ['park', 'spawn', 'fame', 'bridge'],
  }, () => drawTree(kind, variant % 5)));
});

// BUSHES (10)
for (let i = 0; i < 10; i++) {
  const name = `bush-cluster-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('bushes', name, `${name}.png`, {
    scale: 0.9 + (i % 3) * 0.05, depth: 1.25, collision: 'soft-block',
    footprint: { w: 56, h: 40 },
    districts: ['park', 'spawn', 'fame', 'bridge'],
  }, () => drawBush(i)));
}

// FLOWER BEDS (10) → flowers/
for (let i = 0; i < 10; i++) {
  const name = `flower-bed-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('flowers', name, `${name}.png`, {
    scale: 1.0, depth: 1.22, collision: 'none',
    footprint: { w: 72, h: 28 },
    districts: ['spawn', 'park', 'fame', 'market'],
  }, () => drawFlowerBed(i)));
}

// FENCES (10)
for (let i = 0; i < 10; i++) {
  const name = `fence-section-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('fences', name, `${name}.png`, {
    scale: 1.0, depth: 1.35, collision: 'soft-block',
    footprint: { w: 96, h: 24 },
    districts: ['spawn', 'park', 'cashback', 'arena', 'expansion'],
  }, () => drawFence(i)));
}

// STONE WALLS (10)
for (let i = 0; i < 10; i++) {
  const name = `stone-wall-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('walls', name, `${name}.png`, {
    scale: 1.0, depth: 1.15, collision: 'block',
    footprint: { w: 96, h: 32 },
    districts: ['fame', 'cashback', 'arena', 'expansion'],
  }, () => drawWall(i)));
}

// STAIRS (8)
for (let i = 0; i < 8; i++) {
  const name = `stone-stairs-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('stairs', name, `${name}.png`, {
    scale: 1.0, depth: 1.2, collision: 'none',
    footprint: { w: 72, h: 48 },
    districts: ['fame', 'spawn', 'cashback', 'arena'],
  }, () => drawStairs(i)));
}

// ARCHES (8)
for (let i = 0; i < 8; i++) {
  const name = `stone-arch-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('arches', name, `${name}.png`, {
    scale: 1.0, depth: 1.4, collision: 'none',
    footprint: { w: 88, h: 48 },
    districts: ['fame', 'park', 'bridge', 'spawn'],
  }, () => drawArch(i)));
}

// PLANTERS (10)
for (let i = 0; i < 10; i++) {
  const name = `planter-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('planters', name, `${name}.png`, {
    scale: 0.95, depth: 1.26, collision: 'soft-block',
    footprint: { w: 40, h: 32 },
    districts: ['spawn', 'market', 'park', 'alpha'],
  }, () => drawPlanter(i)));
}

// MARKET STALLS (12)
const stallTypes = ['cart', 'cart', 'food', 'food', 'trader', 'trader', 'potion', 'potion', 'token', 'token', 'auction', 'auction'];
stallTypes.forEach((t, i) => {
  const name = `${t}-stall-${i % 2 === 0 ? 'a' : 'b'}`;
  jobs.push(add('market', name, `${name}.png`, {
    scale: 1.05, depth: 1.38, collision: 'soft-block',
    footprint: { w: 88, h: 64 },
    districts: ['market', 'spawn'],
  }, () => drawMarketStall(t, i)));
});

// BARRELS (8)
for (let i = 0; i < 8; i++) {
  const name = `barrel-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('barrels', name, `${name}.png`, {
    scale: 0.9, depth: 1.24, collision: 'soft-block',
    footprint: { w: 32, h: 32 },
    districts: ['market', 'spawn', 'dock'],
  }, () => drawBarrel(i)));
}

// CRATES (8)
for (let i = 0; i < 8; i++) {
  const name = `crate-${String(i + 1).padStart(2, '0')}`;
  jobs.push(add('crates', name, `${name}.png`, {
    scale: 0.9, depth: 1.24, collision: 'soft-block',
    footprint: { w: 32, h: 32 },
    districts: ['market', 'spawn'],
  }, () => drawCrate(i)));
}

// BANNERS (10)
const bannerDefs = [
  { type: 'decorative', name: 'decorative-banner-01' },
  { type: 'decorative', name: 'decorative-banner-02' },
  { type: 'decorative', name: 'decorative-banner-03' },
  { type: 'district', name: 'district-banner-01' },
  { type: 'district', name: 'district-banner-02' },
  { type: 'district', name: 'district-banner-03' },
  { type: 'guild', name: 'guild-banner-01' },
  { type: 'guild', name: 'guild-banner-02' },
  { type: 'guild', name: 'guild-banner-03' },
  { type: 'decorative', name: 'decorative-banner-04' },
];
bannerDefs.forEach(({ type, name }, i) => {
  jobs.push(add('banners', name, `${name}.png`, {
    scale: 1.0, depth: 1.5, collision: 'none',
    footprint: { w: 24, h: 64 },
    districts: type === 'guild' ? ['fame', 'arena'] : ['market', 'spawn', 'alpha'],
  }, () => drawBanner(type, i)));
});

// BRIDGES (6)
const bridgeSizes = ['small', 'small', 'medium', 'medium', 'large', 'decorative'];
bridgeSizes.forEach((s, i) => {
  const size = s === 'decorative' ? 'medium' : s;
  const name = `${s}-bridge-${String((i % 2) + 1).padStart(2, '0')}`;
  jobs.push(add('bridges', name, `${name}.png`, {
    scale: s === 'large' ? 1.2 : s === 'small' ? 0.85 : 1.0,
    depth: 1.1, collision: 'none',
    footprint: { w: s === 'large' ? 128 : 96, h: 48 },
    districts: ['bridge', 'park'],
  }, () => drawBridge(size, i)));
});

// STREET DECORATION (20)
const streetDefs = [
  { type: 'sign', name: 'street-sign-01' },
  { type: 'sign', name: 'street-sign-02' },
  { type: 'coin-statue', name: 'street-coin-statue-01' },
  { type: 'coin-statue', name: 'street-coin-statue-02' },
  { type: 'fountain-small', name: 'street-fountain-small-01' },
  { type: 'fountain-small', name: 'street-fountain-small-02' },
  { type: 'clock', name: 'street-clock-01' },
  { type: 'clock', name: 'street-clock-02' },
  { type: 'rock', name: 'street-rock-01' },
  { type: 'rock', name: 'street-rock-02' },
  { type: 'mailbox', name: 'street-mailbox-01' },
  { type: 'mailbox', name: 'street-mailbox-02' },
  { type: 'wood-pile', name: 'street-wood-pile-01' },
  { type: 'wood-pile', name: 'street-wood-pile-02' },
  { type: 'rope-coil', name: 'street-rope-coil-01' },
  { type: 'rope-coil', name: 'street-rope-coil-02' },
  { type: 'sign', name: 'street-sign-03' },
  { type: 'coin-statue', name: 'street-coin-statue-03' },
  { type: 'rock', name: 'street-rock-03' },
  { type: 'clock', name: 'street-clock-03' },
];
streetDefs.forEach(({ type, name }, i) => {
  jobs.push(add('street', name, `${name}.png`, {
    scale: 0.95, depth: 1.3, collision: type === 'rock' ? 'soft-block' : 'none',
    footprint: { w: 48, h: 48 },
    districts: ['spawn', 'market', 'fame', 'bridge'],
  }, () => drawStreetDecor(type, i)));
});

// DECORATIONS (bonus category — duplicate small props for variety folder)
const decorNames = ['gold-urn', 'stone-urn', 'bronze-chalice', 'obsidian-obelisk-small'];
decorNames.forEach((name, i) => {
  jobs.push(add('decorations', name, `${name}.png`, {
    scale: 0.9, depth: 1.35, collision: 'none',
    footprint: { w: 32, h: 48 },
    districts: ['fame', 'spawn', 'alpha'],
  }, () => drawStreetDecor(i % 2 ? 'coin-statue' : 'fountain-small', i)));
});

async function renderAll() {
  console.log(`Rendering ${jobs.length} environment assets...`);
  for (const job of jobs) {
    const entry = manifest.assets.find(a => a.file === `${job.category}/${job.file}`);
    const svg = job.svgFn();
    const outPath = join(OUT, job.category, job.file);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    if (entry) {
      const meta = await sharp(outPath).metadata();
      entry.pixelSize = { width: meta.width, height: meta.height };
    }
  }
  manifest.totalAssets = manifest.assets.length;
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'environment-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Done — ${manifest.totalAssets} assets → ${OUT}`);
  console.log('Manifest → docs/environment-kit-v1/environment-manifest.json');
}

renderAll().catch(err => {
  console.error(err);
  process.exit(1);
});
