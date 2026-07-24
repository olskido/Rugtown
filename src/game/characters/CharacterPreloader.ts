/**
 * CharacterPreloader — queue manifest textures once per session.
 * Skips procedural / missing paths.
 */

import type Phaser from 'phaser';
import { getCharacterManifest } from './CharacterManifest';
import { registerLoadedTexture, textureKeyForEntry } from './CharacterAssetRegistry';

export function preloadCharacterAssets(scene: Phaser.Scene): void {
  const manifest = getCharacterManifest();
  for (const entry of manifest.entries) {
    if (entry.status !== 'active' || !entry.texturePath) continue;
    const key = textureKeyForEntry(entry);
    if (!key) continue;
    if (scene.textures.exists(key)) {
      registerLoadedTexture(key);
      continue;
    }
    const path = entry.texturePath.startsWith('/')
      ? entry.texturePath
      : `/assets/characters/${entry.texturePath}`;
    scene.load.spritesheet(key, path, {
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
    });
    scene.load.once(`filecomplete-spritesheet-${key}`, () => registerLoadedTexture(key));
  }
}
