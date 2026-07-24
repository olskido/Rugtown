/**
 * MinimapTransform.ts — Phase 10C world ↔ map coordinate helpers.
 *
 * Single source for aspect-fit letterboxing, padding, and viewport rects.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/WorldMapScale';
import type { MinimapViewportWorld } from './MinimapTypes';

export interface MapFitRect {
  /** Pixel offset inside the canvas/container. */
  offsetX: number;
  offsetY: number;
  /** Drawable map area in pixels. */
  width: number;
  height: number;
  /** World units per map pixel. */
  worldPerPxX: number;
  worldPerPxY: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WORLD_W = WORLD_WIDTH;
const WORLD_H = WORLD_HEIGHT;
const WORLD_ASPECT = WORLD_W / WORLD_H;

/**
 * Fit the world (3:1) inside a container, preserving aspect ratio.
 * Letterboxes top/bottom or left/right as needed.
 */
export function computeMapFit(
  containerW: number,
  containerH: number,
  padding = 0,
): MapFitRect {
  const innerW = Math.max(1, containerW - padding * 2);
  const innerH = Math.max(1, containerH - padding * 2);
  const containerAspect = innerW / innerH;

  let width: number;
  let height: number;
  if (containerAspect > WORLD_ASPECT) {
    height = innerH;
    width = height * WORLD_ASPECT;
  } else {
    width = innerW;
    height = width / WORLD_ASPECT;
  }

  const offsetX = padding + (innerW - width) / 2;
  const offsetY = padding + (innerH - height) / 2;

  return {
    offsetX,
    offsetY,
    width,
    height,
    worldPerPxX: WORLD_W / width,
    worldPerPxY: WORLD_H / height,
  };
}

/** World pixel → map pixel (inside fit rect). */
export function worldToMap(wx: number, wy: number, fit: MapFitRect): MapPoint {
  return {
    x: fit.offsetX + (wx / WORLD_W) * fit.width,
    y: fit.offsetY + (wy / WORLD_H) * fit.height,
  };
}

/** Map pixel → world pixel (clamped to world bounds). */
export function mapToWorld(mx: number, my: number, fit: MapFitRect): MapPoint {
  const lx = (mx - fit.offsetX) / fit.width;
  const ly = (my - fit.offsetY) / fit.height;
  return {
    x: clamp(lx * WORLD_W, 0, WORLD_W),
    y: clamp(ly * WORLD_H, 0, WORLD_H),
  };
}

/** Camera viewport in world space → map rectangle. */
export function cameraViewportToMapRect(
  cam: MinimapViewportWorld,
  fit: MapFitRect,
): MapRect {
  const tl = worldToMap(cam.scrollX, cam.scrollY, fit);
  const br = worldToMap(cam.scrollX + cam.viewW, cam.scrollY + cam.viewH, fit);
  return {
    x: tl.x,
    y: tl.y,
    w: Math.max(2, br.x - tl.x),
    h: Math.max(2, br.y - tl.y),
  };
}

/** Expanded-map pan/zoom: transform world point through map zoom + pan. */
export function worldToExpandedMap(
  wx: number,
  wy: number,
  fit: MapFitRect,
  panX: number,
  panY: number,
  zoom: number,
): MapPoint {
  const base = worldToMap(wx, wy, fit);
  const cx = fit.offsetX + fit.width / 2;
  const cy = fit.offsetY + fit.height / 2;
  return {
    x: cx + (base.x - cx) * zoom + panX,
    y: cy + (base.y - cy) * zoom + panY,
  };
}

export function mapToWorldExpanded(
  mx: number,
  my: number,
  fit: MapFitRect,
  panX: number,
  panY: number,
  zoom: number,
): MapPoint {
  const cx = fit.offsetX + fit.width / 2;
  const cy = fit.offsetY + fit.height / 2;
  const bx = cx + (mx - cx - panX) / zoom;
  const by = cy + (my - cy - panY) / zoom;
  return mapToWorld(bx, by, fit);
}

export function isInsideMapFit(mx: number, my: number, fit: MapFitRect): boolean {
  return (
    mx >= fit.offsetX &&
    mx <= fit.offsetX + fit.width &&
    my >= fit.offsetY &&
    my <= fit.offsetY + fit.height
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export { WORLD_W, WORLD_H, WORLD_ASPECT };
