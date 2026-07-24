/**
 * character-bounds-analysis.mjs
 * ──────────────────────────────
 * Phase 11C — real, pixel-measured transparent-bounds analysis for
 * character atlas frames and base bodies. Build-time only (never runs
 * per-frame at runtime). Used by:
 *   - scripts/analyze-character-asset-bounds.mjs (writes the QA report)
 *   - scripts/install-character-assets.mjs (feeds real per-asset
 *     offsetX/offsetY into the runtime manifest, replacing the old
 *     blanket per-category heuristic)
 *
 * For every source frame this computes:
 *   - the real non-transparent bounding box (alpha > threshold)
 *   - padding on each side
 *   - the visible-content center's offset from the FRAME center, as a
 *     fraction of frame width/height (this is what the renderer needs:
 *     "how far is the actual art from where a naive frame-center
 *     placement would put it")
 *   - a left/right mirror-symmetry score, used to decide whether
 *     horizontally flipping the frame is a visually valid stand-in for
 *     a missing facing (Phase 11C directional policy)
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ALPHA_THRESHOLD = 12; // 0-255; ignore near-fully-transparent anti-alias fringe
const MIRROR_DIFF_OK = 0.14; // fraction of visible pixels allowed to differ before "not mirror-safe"

/**
 * Counts distinct connected components of alpha>threshold pixels via
 * flood fill, ignoring components smaller than `minArea` (anti-alias
 * flecks / compression noise). Discovered while diagnosing "hair across
 * the face" reports: some source frames (e.g. headwear_dad_cap_01) pack
 * TWO reference views — a front view AND a 3/4 side view — into one
 * frame. Treated as a single asset, that renders as two heads stacked
 * side by side. This is a real data-quality defect in the source art,
 * not a placement/scale bug — flagged here so install-character-assets.mjs
 * can keep such assets out of the creator until someone re-crops the
 * source frame to one view.
 */
function countVisibleRegions(raw, w, h, bbox, minArea = 24) {
  const { x: bx, y: by, w: bw, h: bh } = bbox;
  const visited = new Uint8Array(bw * bh);
  const isOpaque = (lx, ly) => raw[((by + ly) * w + (bx + lx)) * 4 + 3] > ALPHA_THRESHOLD;
  let regions = 0;
  const stack = [];
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      const idx = ly * bw + lx;
      if (visited[idx] || !isOpaque(lx, ly)) continue;
      // Flood fill this component.
      let area = 0;
      stack.length = 0;
      stack.push(idx);
      visited[idx] = 1;
      while (stack.length) {
        const cur = stack.pop();
        area++;
        const cx = cur % bw, cy = (cur - cx) / bw;
        const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const nIdx = ny * bw + nx;
          if (visited[nIdx] || !isOpaque(nx, ny)) continue;
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
      }
      if (area >= minArea) regions++;
    }
  }
  return regions;
}

/** Scan a raw RGBA buffer for the alpha>threshold bounding box. Returns
 *  null if the frame is fully transparent (should not normally happen). */
function findVisibleBBox(raw, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const rowBase = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = raw[rowBase + x * 4 + 3];
      if (a > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Compares the left half vs a horizontally-mirrored right half of the
 *  visible bbox. Returns a 0..1 difference ratio (0 = perfectly
 *  symmetric). Cheap alpha-mask compare, not a full pixel/color diff —
 *  enough to catch "art is clearly one-sided" (side-parted hair, a bag
 *  on one shoulder) vs "roughly symmetric silhouette". */
function mirrorDiffRatio(raw, w, h, bbox) {
  const { x, y, w: bw, h: bh } = bbox;
  let total = 0;
  let diff = 0;
  for (let row = 0; row < bh; row++) {
    const srcRow = (y + row) * w * 4;
    for (let col = 0; col < bw; col++) {
      const leftA = raw[srcRow + (x + col) * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
      const mirrorCol = x + (bw - 1 - col);
      const rightA = raw[srcRow + mirrorCol * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
      if (leftA || rightA) {
        total++;
        if (leftA !== rightA) diff++;
      }
    }
  }
  if (total === 0) return 0;
  return diff / total;
}

/**
 * Analyzes every frame in a TexturePacker-format atlas JSON against its
 * paired PNG. Returns a Map<frameName, AnalyzedFrame>.
 */
export async function analyzeAtlas(jsonPath, pngPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const image = sharp(pngPath);
  const results = new Map();
  for (const [name, entry] of Object.entries(data.frames || {})) {
    const fr = entry.frame;
    if (!fr || fr.w <= 0 || fr.h <= 0) continue;
    const raw = await image
      .clone()
      .extract({ left: fr.x, top: fr.y, width: fr.w, height: fr.h })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const bbox = findVisibleBBox(raw, fr.w, fr.h);
    if (!bbox) {
      results.set(name, {
        frame: fr, visible: null, ok: false,
        reason: 'fully transparent frame',
      });
      continue;
    }
    const diffRatio = mirrorDiffRatio(raw, fr.w, fr.h, bbox);
    const regionCount = countVisibleRegions(raw, fr.w, fr.h, bbox);
    const visibleCenterX = bbox.x + bbox.w / 2;
    const visibleCenterY = bbox.y + bbox.h / 2;
    const frameCenterX = fr.w / 2;
    const frameCenterY = fr.h / 2;
    results.set(name, {
      frame: fr,
      ok: true,
      visible: bbox,
      paddingLeft: bbox.x,
      paddingRight: fr.w - (bbox.x + bbox.w),
      paddingTop: bbox.y,
      paddingBottom: fr.h - (bbox.y + bbox.h),
      visibleCenterX,
      visibleCenterY,
      // Fraction of the FRAME's own dimensions — composable regardless
      // of final on-screen scale (matches how BitmapCharacterLayout.ts
      // already expresses offsets as fractions of body height).
      offsetFromFrameCenterXFrac: (visibleCenterX - frameCenterX) / fr.w,
      offsetFromFrameCenterYFrac: (visibleCenterY - frameCenterY) / fr.h,
      mirrorDiffRatio: diffRatio,
      mirrorSafe: diffRatio <= MIRROR_DIFF_OK,
      regionCount,
      multiRegion: regionCount > 1,
    });
  }
  return results;
}

/** Analyzes a single non-atlas PNG (e.g. a generated base body) the same way. */
export async function analyzeSingleImage(pngPath) {
  const image = sharp(pngPath);
  const meta = await image.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return { ok: false, reason: 'no dimensions' };
  const raw = await image.clone().ensureAlpha().raw().toBuffer();
  const bbox = findVisibleBBox(raw, w, h);
  if (!bbox) return { ok: false, reason: 'fully transparent image' };
  const diffRatio = mirrorDiffRatio(raw, w, h, bbox);
  const regionCount = countVisibleRegions(raw, w, h, bbox);
  const visibleCenterX = bbox.x + bbox.w / 2;
  const visibleCenterY = bbox.y + bbox.h / 2;
  return {
    ok: true,
    frame: { x: 0, y: 0, w, h },
    visible: bbox,
    paddingLeft: bbox.x,
    paddingRight: w - (bbox.x + bbox.w),
    paddingTop: bbox.y,
    paddingBottom: h - (bbox.y + bbox.h),
    visibleCenterX,
    visibleCenterY,
    offsetFromFrameCenterXFrac: (visibleCenterX - w / 2) / w,
    offsetFromFrameCenterYFrac: (visibleCenterY - h / 2) / h,
    mirrorDiffRatio: diffRatio,
    mirrorSafe: diffRatio <= MIRROR_DIFF_OK,
    regionCount,
    multiRegion: regionCount > 1,
  };
}

/** Analyzes every atlas JSON+PNG pair in a directory. Returns
 *  Map<frameName, AnalyzedFrame> merged across all atlases in the dir
 *  (frame names are already guaranteed globally unique upstream). */
export async function analyzeAtlasDirectory(atlasesDir) {
  const merged = new Map();
  const jsonFiles = fs.readdirSync(atlasesDir).filter((f) => f.endsWith('.json'));
  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(atlasesDir, jsonFile);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const pngFile = data.meta?.image;
    if (!pngFile) continue;
    const pngPath = path.join(atlasesDir, pngFile);
    if (!fs.existsSync(pngPath)) continue;
    const atlasResults = await analyzeAtlas(jsonPath, pngPath);
    for (const [name, result] of atlasResults) merged.set(name, { ...result, atlasKey: jsonFile.replace(/\.json$/, '') });
  }
  return merged;
}

export const CHARACTER_BOUNDS_ALPHA_THRESHOLD = ALPHA_THRESHOLD;
export const CHARACTER_BOUNDS_MIRROR_DIFF_OK = MIRROR_DIFF_OK;
