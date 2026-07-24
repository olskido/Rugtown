/**
 * clean-world-asset-transparency.mjs
 * ─────────────────────────────────
 * Keys out RugTown sheet background (#080a0e / #0c1010) from world PNGs.
 * Preserves warm gold glow, bronze, and interior shadows not connected to edges.
 *
 * Run: node scripts/clean-world-asset-transparency.mjs
 * Then: node scripts/sync-world-assets.mjs
 */

import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Canonical sheet backgrounds from building pack + env kit palette. */
const BG_SAMPLES = [
  [8, 10, 14],   // #080a0e obsidian
  [12, 16, 16],  // #0c1010 sheet
  [6, 12, 13],
  [7, 12, 13],
  [8, 13, 14],
  [6, 13, 14],
];

const TARGET_DIRS = [
  join(ROOT, 'docs', 'building-assets-v1'),
  join(ROOT, 'docs', 'environment-kit-v1'),
];

const HARD_DIST = 16;   // fully transparent
const SOFT_DIST = 30;   // feather zone
const WARM_LUMA = 52;   // protect bright/warm pixels

function walkPngs(dir, acc = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkPngs(p, acc);
    else if (name.toLowerCase().endsWith('.png')) acc.push(p);
  }
  return acc;
}

function minBgDist(r, g, b) {
  let min = Infinity;
  for (const [br, bg, bb] of BG_SAMPLES) {
    const d = Math.hypot(r - br, g - bg, b - bb);
    if (d < min) min = d;
  }
  return min;
}

/** Keep gold glow, lantern light, bronze highlights. */
function isProtectedPixel(r, g, b) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma >= WARM_LUMA) return true;
  // gold / warm glow
  if (r >= 70 && r >= g * 1.02 && g >= 40) return true;
  // bronze / copper
  if (r >= 55 && g >= 38 && b <= 48 && r > b + 8) return true;
  // warm window tint
  if (r >= 48 && g >= 36 && b <= 32) return true;
  return false;
}

function detectEdgeBackground(data, w, h) {
  const samples = [];
  const push = (x, y) => {
    const i = (y * w + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isProtectedPixel(r, g, b)) return;
    if (minBgDist(r, g, b) <= SOFT_DIST) samples.push([r, g, b]);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    push(0, y);
    push(w - 1, y);
  }

  if (!samples.length) return BG_SAMPLES[0];
  const avg = [0, 0, 0];
  for (const [r, g, b] of samples) {
    avg[0] += r;
    avg[1] += g;
    avg[2] += b;
  }
  return avg.map((v) => Math.round(v / samples.length));
}

function matchesBackground(r, g, b, bg, dist = SOFT_DIST) {
  return Math.min(minBgDist(r, g, b), Math.hypot(r - bg[0], g - bg[1], b - bg[2])) <= dist;
}

function isShadowFringe(r, g, b, a) {
  return a < 96 && r < 24 && g < 24 && b < 24;
}

function floodBackgroundMask(data, w, h, mode) {
  const n = w * h;
  const mask = new Uint8Array(n); // 0=keep, 1=bg hard, 2=bg soft feather
  const bg = detectEdgeBackground(data, w, h);

  const queue = [];
  const markBg = (idx, d) => {
    const band = d <= HARD_DIST ? 1 : 2;
    if (!mask[idx] || mask[idx] < band) mask[idx] = band;
    if (d <= HARD_DIST) queue.push(idx);
  };

  const trySeed = (x, y) => {
    const idx = y * w + x;
    const i = idx * 4;
    const a = data[i + 3];
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isProtectedPixel(r, g, b) || isShadowFringe(r, g, b, a)) return;

    if (a < 8) {
      mask[idx] = 1;
      return;
    }

    const d = Math.min(minBgDist(r, g, b), Math.hypot(r - bg[0], g - bg[1], b - bg[2]));
    if (d <= SOFT_DIST) markBg(idx, d);
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  // Only spread through background-colored pixels — never into stone via transparent halos.
  while (queue.length) {
    const idx = queue.pop();
    const x = idx % w;
    const y = (idx - x) / w;
    const neighbors = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < w - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - w);
    if (y < h - 1) neighbors.push(idx + w);

    for (const nIdx of neighbors) {
      if (mask[nIdx]) continue;
      const i = nIdx * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (data[i + 3] < 8 || isProtectedPixel(r, g, b) || isShadowFringe(r, g, b, data[i + 3])) continue;
      const d = Math.min(minBgDist(r, g, b), Math.hypot(r - bg[0], g - bg[1], b - bg[2]));
      if (d <= SOFT_DIST) markBg(nIdx, d);
    }
  }

  if (mode === 'alpha') {
    peelBackgroundFringe(data, w, h, mask, bg);
  }

  return mask;
}

/** Remove dark anti-alias halos touching transparency (env kit). */
function peelBackgroundFringe(data, w, h, mask, bg) {
  const n = w * h;
  let changed = true;
  let passes = 0;
  while (changed && passes < 6) {
    changed = false;
    passes++;
    for (let idx = 0; idx < n; idx++) {
      const i = idx * 4;
      if (data[i + 3] < 8 || mask[idx]) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isProtectedPixel(r, g, b) || isShadowFringe(r, g, b, data[i + 3])) continue;
      if (!matchesBackground(r, g, b, bg, HARD_DIST)) continue;

      const x = idx % w;
      const y = (idx - x) / w;
      let touchesClear = false;
      if (x > 0 && data[(idx - 1) * 4 + 3] < 16) touchesClear = true;
      if (!touchesClear && x < w - 1 && data[(idx + 1) * 4 + 3] < 16) touchesClear = true;
      if (!touchesClear && y > 0 && data[(idx - w) * 4 + 3] < 16) touchesClear = true;
      if (!touchesClear && y < h - 1 && data[(idx + w) * 4 + 3] < 16) touchesClear = true;
      if (!touchesClear) continue;

      const d = Math.min(minBgDist(r, g, b), Math.hypot(r - bg[0], g - bg[1], b - bg[2]));
      mask[idx] = d <= HARD_DIST ? 1 : 2;
      changed = true;
    }
  }
}

function detectMode(data, w, h, hasAlpha) {
  const total = w * h;
  let transparent = 0;
  let cornerClear = 0;
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  for (const [x, y] of corners) {
    if (data[(y * w + x) * 4 + 3] < 16) cornerClear++;
  }
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) transparent++;
  }
  if (!hasAlpha || transparent / total < 0.08) return 'sheet';
  if (cornerClear >= 3) return 'alpha';
  return 'sheet';
}

function applyTransparency(data, mask) {
  let cleared = 0;
  let feathered = 0;
  for (let idx = 0; idx < mask.length; idx++) {
    const m = mask[idx];
    if (!m) continue;
    const i = idx * 4;
    if (m === 1) {
      data[i + 3] = 0;
      cleared++;
    } else if (m === 2) {
      const d = minBgDist(data[i], data[i + 1], data[i + 2]);
      const t = Math.min(1, Math.max(0, (d - HARD_DIST) / (SOFT_DIST - HARD_DIST)));
      const newA = Math.round(data[i + 3] * t);
      if (newA < data[i + 3]) feathered++;
      data[i + 3] = newA;
      if (newA === 0) cleared++;
    }
  }
  return { cleared, feathered };
}

async function processPng(filePath) {
  const meta = await sharp(filePath).metadata();
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buf = Buffer.from(data);
  const mode = detectMode(buf, info.width, info.height, meta.hasAlpha);
  const beforeOpaque = countOpaque(buf);
  const mask = floodBackgroundMask(buf, info.width, info.height, mode);
  const { cleared, feathered } = applyTransparency(buf, mask);
  const afterOpaque = countOpaque(buf);

  if (cleared === 0 && feathered === 0) {
    return { changed: false, cleared, feathered, beforeOpaque, afterOpaque, mode };
  }

  mkdirSync(dirname(filePath), { recursive: true });
  await sharp(buf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(filePath);

  return { changed: true, cleared, feathered, beforeOpaque, afterOpaque, mode };
}

function countOpaque(buf) {
  let n = 0;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] > 16) n++;
  return n;
}

async function main() {
  const files = TARGET_DIRS.flatMap((d) => walkPngs(d));
  let changed = 0;
  let totalCleared = 0;

  console.log(`Cleaning transparency on ${files.length} PNGs...`);

  for (const file of files) {
    const rel = relative(ROOT, file);
    const result = await processPng(file);
    totalCleared += result.cleared;
    if (result.changed) {
      changed++;
      console.log(
        `  ✓ ${rel} [${result.mode}] — cleared ${result.cleared}, feathered ${result.feathered} ` +
          `(opaque ${result.beforeOpaque} → ${result.afterOpaque})`,
      );
    }
  }

  console.log(`\nDone — updated ${changed}/${files.length} files, ${totalCleared} pixels keyed out.`);
  console.log('Run: node scripts/sync-world-assets.mjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
