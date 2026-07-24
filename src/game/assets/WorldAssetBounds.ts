/**
 * WorldAssetBounds.ts
 * ───────────────────
 * Phase 7B — Visible-content bounds helpers for world PNG library assets.
 * Source PNGs are never cropped; metadata drives scale/anchor math only.
 */

import Phaser from 'phaser';
import rawBounds from '../data/world-asset-visual-bounds.json';

export interface WorldAssetVisualBounds {
  key: string;
  relativePath: string;
  filename: string;
  category: string;
  ok: boolean;
  sourceWidth: number;
  sourceHeight: number;
  visibleX: number;
  visibleY: number;
  visibleWidth: number;
  visibleHeight: number;
  visibleCenterX: number;
  visibleCenterY: number;
  /** Exclusive bottom edge of visible content in texture pixels. */
  visibleBottomY: number;
  occupancyRatio: number;
  opaquePixels: number;
}

export interface WorldAssetVisualBoundsFile {
  version: string;
  generatedAt: string;
  alphaThreshold: number;
  totalAssets: number;
  validBounds: number;
  failedCount: number;
  lowOccupancyCount: number;
  tinyVisibleCount: number;
  failures: { key: string; path: string; reason: string }[];
  lowOccupancy: {
    key: string;
    relativePath: string;
    occupancyRatio: number;
    visibleWidth: number;
    visibleHeight: number;
  }[];
  tinyVisible: {
    key: string;
    relativePath: string;
    visibleWidth: number;
    visibleHeight: number;
  }[];
  assets: Record<string, WorldAssetVisualBounds>;
}

export type VisualAnchorMode = 'building-bottom-center' | 'prop-center';

export const WORLD_ASSET_VISUAL_BOUNDS = rawBounds as WorldAssetVisualBoundsFile;

export function getVisualBounds(textureKey: string): WorldAssetVisualBounds | undefined {
  return WORLD_ASSET_VISUAL_BOUNDS.assets[textureKey];
}

export function requireVisualBounds(textureKey: string): WorldAssetVisualBounds {
  const b = getVisualBounds(textureKey);
  if (!b) throw new Error(`[WorldAssetBounds] Missing bounds for key: ${textureKey}`);
  return b;
}

/** Uniform scale so visible width equals `desiredVisibleWidth` world px. */
export function scaleForVisibleWidth(textureKey: string, desiredVisibleWidth: number): number {
  const b = requireVisualBounds(textureKey);
  if (!b.ok || b.visibleWidth <= 0) return 1;
  return desiredVisibleWidth / b.visibleWidth;
}

/** Uniform scale so visible height equals `desiredVisibleHeight` world px. */
export function scaleForVisibleHeight(textureKey: string, desiredVisibleHeight: number): number {
  const b = requireVisualBounds(textureKey);
  if (!b.ok || b.visibleHeight <= 0) return 1;
  return desiredVisibleHeight / b.visibleHeight;
}

/** Fit visible content inside a max box (letterbox). */
export function scaleToFitVisible(
  textureKey: string,
  maxVisibleWidth: number,
  maxVisibleHeight: number,
): number {
  const b = requireVisualBounds(textureKey);
  if (!b.ok || b.visibleWidth <= 0 || b.visibleHeight <= 0) return 1;
  return Math.min(maxVisibleWidth / b.visibleWidth, maxVisibleHeight / b.visibleHeight);
}

/**
 * Origin fractions so Phaser positions the VISIBLE content point at the image x/y.
 * Buildings: visible bottom-center. Props: visible center.
 */
export function visibleOrigin(
  textureKey: string,
  mode: VisualAnchorMode = 'building-bottom-center',
): { x: number; y: number } {
  const b = requireVisualBounds(textureKey);
  if (!b.ok || b.sourceWidth <= 0 || b.sourceHeight <= 0) {
    return mode === 'prop-center' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 };
  }
  const ox = b.visibleCenterX / b.sourceWidth;
  if (mode === 'prop-center') {
    return { x: ox, y: b.visibleCenterY / b.sourceHeight };
  }
  return { x: ox, y: b.visibleBottomY / b.sourceHeight };
}

/**
 * Place a loaded Phaser Image so VISIBLE content is anchored at (worldX, worldY).
 * Does not crop the texture — only origin + scale + position.
 */
export function placeWithVisibleAnchor(
  image: Phaser.GameObjects.Image,
  textureKey: string,
  worldX: number,
  worldY: number,
  scale: number,
  mode: VisualAnchorMode = 'building-bottom-center',
): void {
  const origin = visibleOrigin(textureKey, mode);
  image.setTexture(textureKey);
  image.setOrigin(origin.x, origin.y);
  image.setScale(scale);
  image.setPosition(worldX, worldY);
  // Clear any gallery crop so full texture + transparent padding remain intact.
  image.setCrop();
}

export function placeBuildingBottomCenter(
  image: Phaser.GameObjects.Image,
  textureKey: string,
  worldX: number,
  worldY: number,
  scale: number,
): void {
  placeWithVisibleAnchor(image, textureKey, worldX, worldY, scale, 'building-bottom-center');
}

export function placePropCenter(
  image: Phaser.GameObjects.Image,
  textureKey: string,
  worldX: number,
  worldY: number,
  scale: number,
): void {
  placeWithVisibleAnchor(image, textureKey, worldX, worldY, scale, 'prop-center');
}

/** Future collision footprint from visible content at a given display scale. */
export function collisionFootprintFromVisible(
  textureKey: string,
  scale: number,
  worldX: number,
  worldY: number,
  mode: VisualAnchorMode = 'building-bottom-center',
): { x: number; y: number; w: number; h: number } {
  const b = requireVisualBounds(textureKey);
  const w = b.visibleWidth * scale;
  const h = b.visibleHeight * scale;
  if (mode === 'prop-center') {
    return { x: worldX - w / 2, y: worldY - h / 2, w, h };
  }
  // Bottom-center of visible content at (worldX, worldY)
  return { x: worldX - w / 2, y: worldY - h, w, h };
}

/**
 * Apply texture crop to visible bounds for preview only (does not modify PNG on disk).
 * Returns the scale used to fit visible content into maxW×maxH.
 */
export function applyNormalizedPreviewCrop(
  image: Phaser.GameObjects.Image,
  textureKey: string,
  maxW: number,
  maxH: number,
): number {
  const b = getVisualBounds(textureKey);
  if (!b?.ok || b.visibleWidth <= 0 || b.visibleHeight <= 0) {
    image.setCrop();
    const sx = maxW / Math.max(1, image.width);
    const sy = maxH / Math.max(1, image.height);
    const s = Math.min(sx, sy, 1);
    image.setScale(s);
    image.setOrigin(0.5, 0.5);
    return s;
  }
  image.setCrop(b.visibleX, b.visibleY, b.visibleWidth, b.visibleHeight);
  const s = Math.min(maxW / b.visibleWidth, maxH / b.visibleHeight);
  image.setScale(s);
  image.setOrigin(0.5, 0.5);
  return s;
}

export function clearPreviewCrop(image: Phaser.GameObjects.Image): void {
  image.setCrop();
}

export function occupancyPercent(textureKey: string): number {
  const b = getVisualBounds(textureKey);
  if (!b) return 0;
  return Math.round(b.occupancyRatio * 10000) / 100;
}
