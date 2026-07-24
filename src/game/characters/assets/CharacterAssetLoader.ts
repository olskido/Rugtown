/**
 * Phaser atlas / base texture preloader for bitmap characters.
 */

import Phaser from 'phaser';
import {
  loadCharacterRuntimeManifest,
  type RuntimeManifest,
} from './CharacterAssetRegistry';
import { CHARACTER_BASE_TEXTURES } from './generatedCharacterManifest';
import { charPerfMark, charPerfMeasure } from '../dev/CharacterPerfMarks';

let loaded = false;
const loggedMissing = new Set<string>();

export function logMissingOnce(key: string, detail: string): void {
  if (loggedMissing.has(key)) return;
  loggedMissing.add(key);
  console.warn(`[characters] ${detail}`);
}

export async function preloadCharacterBitmaps(scene: Phaser.Scene): Promise<RuntimeManifest> {
  charPerfMark('CharacterAssetLoader.preload.start');
  const manifest = await loadCharacterRuntimeManifest();

  for (const atlas of manifest.atlases) {
    if (scene.textures.exists(atlas.textureKey)) continue;
    scene.load.atlas(atlas.textureKey, atlas.url, atlas.jsonUrl);
  }
  for (const base of manifest.bases) {
    if (scene.textures.exists(base.textureKey)) continue;
    scene.load.image(base.textureKey, base.url);
  }
  // Ensure generated constants also load if manifest fetch raced
  for (const base of CHARACTER_BASE_TEXTURES) {
    if (scene.textures.exists(base.textureKey)) continue;
    scene.load.image(base.textureKey, base.url);
  }

  await new Promise<void>((resolve, reject) => {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key?: string }) => {
      logMissingOnce(String(file?.key), `failed to load ${file?.key}`);
    });
    if (scene.load.list.size === 0 && scene.load.inflight.size === 0) {
      resolve();
      return;
    }
    scene.load.start();
  });

  loaded = true;
  charPerfMark('CharacterAssetLoader.preload.complete');
  charPerfMeasure(
    'CharacterAssetLoader.preload',
    'CharacterAssetLoader.preload.start',
    'CharacterAssetLoader.preload.complete',
  );
  return manifest;
}

export function characterBitmapsReady(): boolean {
  return loaded;
}

/** Backward-compatible name for the world-safe bundle. */
export function queueCharacterBitmapLoads(scene: Phaser.Scene): void {
  queueWorldCharacterLoads(scene);
}

/** World essentials plus cosmetics which remain creator-enabled in-world. */
export function queueWorldCharacterLoads(scene: Phaser.Scene): void {
  charPerfMark('CharacterAssetLoader.queue');
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    charPerfMark('CharacterAssetLoader.queue.complete');
    charPerfMeasure(
      'CharacterAssetLoader.queue',
      'CharacterAssetLoader.queue',
      'CharacterAssetLoader.queue.complete',
    );
  });
  scene.load.json('char-manifest', '/assets/characters/manifests/character_runtime_manifest.json');
  const atlasFiles = [
    'atlas_facial-hair', 'atlas_hair',
    'atlas_headwear_1', 'atlas_headwear_2', 'atlas_npcs_1', 'atlas_npcs_2',
    'atlas_pants',
  ];
  queueAtlases(scene, atlasFiles);
  queueBases(scene);
}

/** Delayed creator-only atlases; safe to call when an atlas is already loaded. */
export function queueCreatorCosmeticLoads(scene: Phaser.Scene): void {
  queueAtlases(scene, [
    'atlas_accessories', 'atlas_facial-hair', 'atlas_hair',
    'atlas_headwear_1', 'atlas_headwear_2', 'atlas_pants', 'atlas_shoes',
  ]);
}

function queueAtlases(scene: Phaser.Scene, atlasFiles: string[]): void {
  for (const id of atlasFiles) {
    const key = `char-atlas-${id}`;
    if (scene.textures.exists(key)) continue;
    scene.load.atlas(
      key,
      `/assets/characters/atlases/${id}.png`,
      `/assets/characters/atlases/${id}.json`,
    );
  }
}

function queueBases(scene: Phaser.Scene): void {
  for (const base of CHARACTER_BASE_TEXTURES) {
    if (scene.textures.exists(base.textureKey)) continue;
    scene.load.image(base.textureKey, base.url);
  }
}
