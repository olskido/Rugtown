/**
 * Canonical, foot-planted bitmap layout. Coordinates are relative to the
 * generated 96×144 mannequin, whose foot plant is (48, 144).
 *
 * Root cause of earlier "inverted head": head cosmetics are padded square
 * crops. Using center-origin + bob overwriting Y parked them at the feet.
 * All layers now share foot origin (0.5, 1). Head crops are positioned so
 * their *sprite center* sits on the mannequin head center.
 */
export type LayerPlacement = {
  slot: string;
  anchorX: number;
  anchorY: number;
  /** Fraction of body height. */
  offsetX: number;
  offsetY: number;
  scale: number;
  layerOrder: number;
};

export type ResolvedLayerPlacement = {
  x: number;
  y: number;
  scale: number;
  originX: number;
  originY: number;
  depth: number;
};

const BASE_NATIVE_HEIGHT = 144;
const HEAD_CENTER_FROM_FEET = 110 / BASE_NATIVE_HEIGHT;
const HEAD_DIAMETER = 44;

/** Draw order bottom → top. */
export const BITMAP_LAYER_STACK = ['base', 'outfit', 'pants', 'shoes', 'hair', 'facial', 'hat', 'accessories'] as const;
export type BitmapStackSlot = (typeof BITMAP_LAYER_STACK)[number];

/** Foot-origin placements. offsetY is a body-height fraction for non-head slots. */
export const CANONICAL_LAYER_PLACEMENTS: Record<BitmapStackSlot, Omit<LayerPlacement, 'scale'>> = {
  base: { slot: 'base', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0, layerOrder: 10 },
  // Phase 12 — separate clothing layer. Same anchor/offset/height-fraction
  // as 'base' by design: its canvas is specified to match the base body's
  // canvas exactly (same pose, same proportions, same 512x768-style
  // frame), so it overlays with zero extra offset math.
  outfit: { slot: 'outfit', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0, layerOrder: 15 },
  pants: { slot: 'pants', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: -(8 / BASE_NATIVE_HEIGHT), layerOrder: 20 },
  shoes: { slot: 'shoes', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0, layerOrder: 30 },
  hair: { slot: 'hair', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: -HEAD_CENTER_FROM_FEET, layerOrder: 40 },
  facial: { slot: 'facial', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: -HEAD_CENTER_FROM_FEET, layerOrder: 50 },
  hat: { slot: 'hat', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: -HEAD_CENTER_FROM_FEET, layerOrder: 60 },
  accessories: { slot: 'accessories', anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: -(52 / BASE_NATIVE_HEIGHT), layerOrder: 70 },
};

/** Target display height as a fraction of body height (accounts for padded crops). */
const SLOT_HEIGHT_FRACTION: Record<BitmapStackSlot, number> = {
  base: 1,
  outfit: 1,
  pants: 48 / BASE_NATIVE_HEIGHT,
  shoes: 18 / BASE_NATIVE_HEIGHT,
  hair: (HEAD_DIAMETER * 1.15) / BASE_NATIVE_HEIGHT,
  facial: (HEAD_DIAMETER * 0.7) / BASE_NATIVE_HEIGHT,
  hat: (HEAD_DIAMETER * 1.25) / BASE_NATIVE_HEIGHT,
  accessories: (HEAD_DIAMETER * 0.9) / BASE_NATIVE_HEIGHT,
};

const HEAD_SLOTS = new Set<BitmapStackSlot>(['hair', 'facial', 'hat']);

function slotFor(slot: string): BitmapStackSlot {
  if (slot.startsWith('acc')) return 'accessories';
  if (slot === 'facial-hair') return 'facial';
  if (slot === 'headwear') return 'hat';
  if (slot === 'npcs') return 'base';
  return (BITMAP_LAYER_STACK.includes(slot as BitmapStackSlot) ? slot : 'accessories') as BitmapStackSlot;
}

/** Real, per-asset measured visible-content bounds (Phase 11C). When
 *  omitted, falls back to treating the full frame as "visible" — the
 *  pre-11C behavior — so callers that don't have measured data (e.g. the
 *  generated base-body fallback before its own bounds are wired) keep
 *  working, just without the size-consistency fix. */
export interface VisibleBoundsHint {
  visibleWidth?: number;
  visibleHeight?: number;
  /** Fraction of frame width/height — visible-content center offset
   *  from the frame's geometric center. */
  offsetXFrac?: number;
  offsetYFrac?: number;
}

/**
 * Resolves placement from the shared foot origin.
 *
 * Phase 11C root cause: every category's atlas frames share one fixed
 * canvas size (e.g. every hair frame is 160x160, every headwear frame is
 * 352x352), but the ACTUAL visible art fills anywhere from ~10% to ~95%
 * of that canvas depending on the specific asset (measured via
 * scripts/analyze-character-asset-bounds.mjs). Scaling from the raw
 * frame height made on-screen cosmetic size arbitrary and inconsistent
 * between assets in the same slot ("hats floating", inconsistent hair
 * size) even though X/Y centering was already fine for nearly every
 * asset. Scaling from the measured VISIBLE height fixes this: every
 * asset's actual pixels now consistently fill the intended slot target,
 * regardless of how much transparent padding surrounds it.
 */
export function getPlacementForSlot(
  slot: string,
  bodyDisplayHeight: number,
  nativeH: number,
  nativeW: number = nativeH,
  bounds?: VisibleBoundsHint,
): ResolvedLayerPlacement {
  const canonicalSlot = slotFor(slot);
  const placement = CANONICAL_LAYER_PLACEMENTS[canonicalSlot];
  const targetHeight = bodyDisplayHeight * SLOT_HEIGHT_FRACTION[canonicalSlot];

  // 'base' and 'outfit' are FULL-FRAME slots by contract: an outfit's
  // canvas is specified to exactly match the base body's canvas/pose, so
  // the two must scale by the SAME frame-to-body ratio, not by each
  // asset's own visible-content ratio. A base body's drawn figure
  // happens to fill nearly the whole frame (visible ≈ frame), so scaling
  // by visible content looked correct there — but an outfit is only ever
  // a PARTIAL overlay (a torso garment) on that same shared frame, so
  // scaling it by its own (much smaller) visible height blew it up far
  // past the body underneath. Everything else (hair/hat/facial/
  // accessories/pants/shoes) is an independent item on its own padded
  // canvas, where fitting the target to the MEASURED visible content is
  // exactly the Phase 11C fix and remains correct.
  const isFullFrameSlot = canonicalSlot === 'base' || canonicalSlot === 'outfit';
  const visibleH = Math.max(1, bounds?.visibleHeight ?? nativeH);
  const visibleW = Math.max(1, bounds?.visibleWidth ?? nativeW);
  const targetWidthCap = bodyDisplayHeight * SLOT_HEIGHT_FRACTION[canonicalSlot] * 1.6;
  const scale = isFullFrameSlot
    ? targetHeight / Math.max(1, nativeH)
    : Math.min(targetHeight / visibleH, targetWidthCap / visibleW);
  const displayH = Math.max(1, nativeH) * scale;

  const offsetXFrac = isFullFrameSlot ? 0 : (bounds?.offsetXFrac ?? 0);
  const offsetYFrac = isFullFrameSlot ? 0 : (bounds?.offsetYFrac ?? 0);

  let y = placement.offsetY * bodyDisplayHeight;
  let x = placement.offsetX * bodyDisplayHeight - offsetXFrac * nativeW * scale;
  if (HEAD_SLOTS.has(canonicalSlot)) {
    const headCenterY = -HEAD_CENTER_FROM_FEET * bodyDisplayHeight;
    // With origin at feet (bottom), sprite center is at y - displayH/2.
    // Correct for the asset's own measured visible-center offset so the
    // VISIBLE content (not the padded frame) centers on the head.
    y = headCenterY + displayH / 2 - offsetYFrac * nativeH * scale;
  }

  return {
    x,
    y,
    scale,
    originX: placement.anchorX,
    originY: placement.anchorY,
    depth: placement.layerOrder,
  };
}

export function stackOrderForKey(key: string): number {
  const placement = getPlacementForSlot(key, 1, 1, 1);
  return placement.depth + (key.startsWith('acc') ? Number(key.slice(3) || 0) : 0);
}
