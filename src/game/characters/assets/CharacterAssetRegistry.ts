import type Phaser from 'phaser';

export interface RuntimeAssetEntry {
  id: string;
  category: string;
  slot: string;
  atlasKey: string | null;
  textureKey: string | null;
  frame: string | null;
  imagePath?: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  playerUsable: boolean;
  npcOnly: boolean;
  directions: string[];
  states: string[];
  layerOrder: number;
  creatorVisible: boolean;
  accepted: boolean;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  compatibleBaseIds?: string[];
  compatibilityGroup?: string;
  alignmentStatus?: 'ok' | 'approximate' | 'incompatible';
  creatorEnabled?: boolean;
  displayName?: string;
  /**
   * Phase 11C — real, pixel-measured (build-time, not per-frame) visible
   * content bounds within this asset's frame. Written by
   * scripts/analyze-character-asset-bounds.mjs via install-character-assets.mjs.
   * When present, BitmapCharacterLayout.ts scales from visibleHeight
   * instead of the raw frame height — the actual root cause of
   * inconsistent hair/hat sizing (frame canvases share one fixed size
   * per category, but visible content fills anywhere from ~10% to ~95%
   * of that canvas depending on the asset).
   */
  visibleWidth?: number;
  visibleHeight?: number;
  /** Visible-content center offset from frame center, as a fraction of
   *  frame width/height. Near-zero for nearly all current assets, but
   *  applied so a genuinely off-center asset is still corrected. */
  offsetXFrac?: number;
  offsetYFrac?: number;
  /** Measured left/right symmetry — see character-bounds-analysis.mjs.
   *  false means this asset's art is visibly one-sided and must not be
   *  silently flipped to fake a missing facing. */
  mirrorSafe?: boolean;
}

export interface RuntimeManifest {
  version: number;
  logicalDisplayHeight: number;
  defaultAppearance: Record<string, unknown>;
  atlases: { id: string; textureKey: string; url: string; jsonUrl: string; frameCount: number }[];
  bases: { id: string; textureKey: string; url: string }[];
  assets: RuntimeAssetEntry[];
}

let manifest: RuntimeManifest | null = null;
const byId = new Map<string, RuntimeAssetEntry>();

export async function loadCharacterRuntimeManifest(url = '/assets/characters/manifests/character_runtime_manifest.json'): Promise<RuntimeManifest> {
  if (manifest) return manifest;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`character manifest HTTP ${res.status}`);
  const data = (await res.json()) as RuntimeManifest;
  return hydrateCharacterRegistry(data);
}

export function hydrateCharacterRegistry(data: RuntimeManifest): RuntimeManifest {
  manifest = data;
  byId.clear();
  for (const a of data.assets) {
    if (a.accepted !== false) byId.set(a.id, a);
  }
  return data;
}

export function hydrateCharacterRegistryFromScene(scene: Phaser.Scene, key = 'char-manifest'): RuntimeManifest | null {
  const data = scene.cache.json.get(key) as RuntimeManifest | undefined;
  if (!data) return null;
  return hydrateCharacterRegistry(data);
}

export function getCharacterRuntimeManifest(): RuntimeManifest | null {
  return manifest;
}

export function getAssetById(id: string): RuntimeAssetEntry | undefined {
  return byId.get(id);
}

export function isCreatorCosmeticAllowed(id: string): boolean {
  const asset = byId.get(id);
  return !!asset && asset.creatorEnabled !== false && asset.alignmentStatus !== 'incompatible';
}

export function assetExists(id: string, slot?: string): boolean {
  const asset = byId.get(id);
  if (!asset) return false;
  if (slot === 'base' || asset.category === 'base' || asset.category === 'npcs') return true;
  return isCreatorCosmeticAllowed(id);
}

export function listCreatorAssets(category: string): RuntimeAssetEntry[] {
  return [...byId.values()].filter(
    (a) => a.category === category
      && a.creatorEnabled !== false
      && a.alignmentStatus !== 'incompatible'
      && a.creatorVisible
      && a.playerUsable,
  );
}

export function listNpcBodies(): RuntimeAssetEntry[] {
  return [...byId.values()].filter((a) => a.category === 'npcs' && a.accepted !== false);
}

export function clearCharacterRegistryForTests(): void {
  manifest = null;
  byId.clear();
}
