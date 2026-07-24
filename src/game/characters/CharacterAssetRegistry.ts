/**
 * CharacterAssetRegistry — texture keys for validated manifest entries.
 * Does not accept arbitrary URLs.
 */

import { getManifestEntry, type CharacterManifestEntry } from './CharacterManifest';

const loadedKeys = new Set<string>();

export function textureKeyForEntry(entry: CharacterManifestEntry): string | null {
  if (!entry.texturePath || entry.spriteMode === 'procedural') return null;
  if (entry.texturePath.includes('://') || entry.texturePath.includes('..')) return null;
  return `char:${entry.id}:v${entry.version}`;
}

export function registerLoadedTexture(key: string): void {
  loadedKeys.add(key);
}

export function isTextureLoaded(key: string): boolean {
  return loadedKeys.has(key);
}

export function resolveTextureKey(cosmeticId: string): string | null {
  const entry = getManifestEntry(cosmeticId);
  if (!entry || entry.status !== 'active') return null;
  return textureKeyForEntry(entry);
}

export function clearAssetRegistry(): void {
  loadedKeys.clear();
}
