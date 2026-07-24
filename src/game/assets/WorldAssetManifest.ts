/**
 * WorldAssetManifest.ts
 * ─────────────────────
 * Phase 7A — Vite-safe inventory of the new PNG library under /assets/world/.
 * Data is generated at build time by scripts/generate-world-asset-manifest.mjs
 * (no browser filesystem access).
 */

import Phaser from 'phaser';
import rawManifest from '../data/world-asset-library-manifest.json';

export interface WorldLibraryAsset {
  key: string;
  category: string;
  relativePath: string;
  filename: string;
  url: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  contentW: number | null;
  contentH: number | null;
  paddingRatio: number | null;
}

export interface WorldLibraryManifest {
  version: string;
  generatedAt: string;
  rootUrl: string;
  categories: string[];
  totalAssets: number;
  byCategory: Record<string, number>;
  missingFolders: string[];
  duplicateKeys: { key: string; a: string; b: string }[];
  unusualFilenames: { path: string; reasons: string[] }[];
  extremeNotes: { path: string; width: number; height: number; note: string }[];
  assets: WorldLibraryAsset[];
}

export interface WorldAssetValidationReport {
  totalDiscovered: number;
  successfullyLoaded: number;
  failedMissing: string[];
  duplicateKeys: { key: string; a: string; b: string }[];
  unusualFilenames: { path: string; reasons: string[] }[];
  extremeNotes: { path: string; width: number; height: number; note: string }[];
  byCategory: Record<string, number>;
}

export const WORLD_LIBRARY_MANIFEST = rawManifest as WorldLibraryManifest;

export const WORLD_LIBRARY_CATEGORIES = WORLD_LIBRARY_MANIFEST.categories;

export const WORLD_LIBRARY_ASSETS: readonly WorldLibraryAsset[] =
  WORLD_LIBRARY_MANIFEST.assets;

/** Texture key from relative path (folder + stem), matching the generator. */
export function worldTextureKey(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/');
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

export function getAssetsByCategory(category: string | 'all'): WorldLibraryAsset[] {
  if (category === 'all') return [...WORLD_LIBRARY_ASSETS];
  return WORLD_LIBRARY_ASSETS.filter((a) => a.category === category);
}

/** Queue every library texture on a Phaser loader (call from preload). */
export function preloadWorldLibraryAssets(scene: Phaser.Scene): void {
  const seen = new Set<string>();
  for (const asset of WORLD_LIBRARY_ASSETS) {
    if (seen.has(asset.key)) continue;
    seen.add(asset.key);
    scene.load.image(asset.key, asset.url);
  }
}

/** After load completes — count present textures vs failed. */
export function validateWorldLibraryTextures(scene: Phaser.Scene): WorldAssetValidationReport {
  const failedMissing: string[] = [];
  let successfullyLoaded = 0;

  for (const asset of WORLD_LIBRARY_ASSETS) {
    if (scene.textures.exists(asset.key)) {
      successfullyLoaded += 1;
    } else {
      failedMissing.push(asset.relativePath);
    }
  }

  const report: WorldAssetValidationReport = {
    totalDiscovered: WORLD_LIBRARY_MANIFEST.totalAssets,
    successfullyLoaded,
    failedMissing,
    duplicateKeys: WORLD_LIBRARY_MANIFEST.duplicateKeys,
    unusualFilenames: WORLD_LIBRARY_MANIFEST.unusualFilenames,
    extremeNotes: WORLD_LIBRARY_MANIFEST.extremeNotes,
    byCategory: { ...WORLD_LIBRARY_MANIFEST.byCategory },
  };

  console.info('[WorldAssetManifest] QA', {
    total: report.totalDiscovered,
    loaded: report.successfullyLoaded,
    failed: report.failedMissing.length,
    duplicates: report.duplicateKeys.length,
    unusual: report.unusualFilenames.length,
  });

  if (report.failedMissing.length) {
    console.warn('[WorldAssetManifest] Missing textures:', report.failedMissing);
  }
  if (report.duplicateKeys.length) {
    console.warn('[WorldAssetManifest] Duplicate keys:', report.duplicateKeys);
  }
  if (report.unusualFilenames.length) {
    console.warn('[WorldAssetManifest] Unusual filenames:', report.unusualFilenames);
  }

  return report;
}

export function isAssetGalleryRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('assetGallery') === '1';
  } catch {
    return false;
  }
}
