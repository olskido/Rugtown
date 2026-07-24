/**
 * Character manifest — Phase 10L.
 * Placeholder procedural entries until bitmap art lands.
 */

export type CosmeticCategory =
  | 'base' | 'skin' | 'hair' | 'outfit' | 'shoes' | 'headwear'
  | 'face' | 'back' | 'held' | 'aura' | 'emote' | 'nameplate';

export type CosmeticStatus = 'draft' | 'active' | 'disabled' | 'retired';
export type SpriteMode = 'layered' | 'precomposed' | 'procedural';

export interface CharacterManifestEntry {
  id: string;
  category: CosmeticCategory;
  displayName: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'test';
  spriteMode: SpriteMode;
  texturePath: string | null;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  directionalLayout: 'cardinal_rows';
  animations: string[];
  origin: 'bottom-center';
  scaleOverride: number | null;
  allowedBaseModels: string[];
  entitlementSource: string;
  status: CosmeticStatus;
  version: string;
  checksum: string | null;
  legacySlot?: string;
}

export interface CharacterManifest {
  version: string;
  logicalFrameWidth: number;
  logicalFrameHeight: number;
  renderModeDefault: 'graphics' | 'sprite';
  entries: CharacterManifestEntry[];
}

function entry(
  partial: Omit<CharacterManifestEntry, 'frameWidth' | 'frameHeight' | 'frameCount' | 'directionalLayout' | 'origin' | 'scaleOverride' | 'allowedBaseModels' | 'version' | 'checksum' | 'animations' | 'status'> & {
    animations?: string[];
    status?: CosmeticStatus;
  },
): CharacterManifestEntry {
  const { animations, status, ...rest } = partial;
  return {
    ...rest,
    frameWidth: 48,
    frameHeight: 72,
    frameCount: 1,
    directionalLayout: 'cardinal_rows',
    origin: 'bottom-center',
    scaleOverride: null,
    allowedBaseModels: ['base_default'],
    version: '1',
    checksum: null,
    animations: animations ?? ['idle', 'walk'],
    status: status ?? 'active',
  };
}

export const CHARACTER_MANIFEST_V1: CharacterManifest = {
  version: '1',
  logicalFrameWidth: 48,
  logicalFrameHeight: 72,
  renderModeDefault: 'graphics',
  entries: [
    entry({ id: 'base_default', category: 'base', displayName: 'Default Base', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default' }),
    entry({ id: 'hair_short', category: 'hair', displayName: 'Short Hair', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', legacySlot: 'hairstyle' }),
    entry({ id: 'hair_long', category: 'hair', displayName: 'Long Hair', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', legacySlot: 'hairstyle' }),
    entry({ id: 'outfit_starter_dark', category: 'outfit', displayName: 'Starter Dark Jacket', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', legacySlot: 'jacket' }),
    entry({ id: 'outfit_market_apron', category: 'outfit', displayName: 'Market Apron', rarity: 'uncommon', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', legacySlot: 'jacket' }),
    entry({ id: 'hat_beanie', category: 'headwear', displayName: 'Beanie', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', legacySlot: 'hat' }),
    entry({ id: 'glasses_round', category: 'face', displayName: 'Round Glasses', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', legacySlot: 'glasses' }),
    entry({ id: 'cosmetic_test_event_pin', category: 'face', displayName: 'TEST Event Pin', rarity: 'test', spriteMode: 'procedural', texturePath: null, entitlementSource: 'test_event', animations: ['idle'] }),
    entry({ id: 'cosmetic_test_tournament_scarf', category: 'outfit', displayName: 'TEST Tournament Scarf', rarity: 'test', spriteMode: 'procedural', texturePath: null, entitlementSource: 'test_tournament', status: 'draft' }),
    entry({ id: 'cosmetic_test_guild_sash', category: 'back', displayName: 'TEST Guild Sash', rarity: 'test', spriteMode: 'procedural', texturePath: null, entitlementSource: 'test_guild', status: 'draft' }),
    entry({ id: 'none', category: 'aura', displayName: 'None', rarity: 'common', spriteMode: 'procedural', texturePath: null, entitlementSource: 'default', animations: ['idle'] }),
  ],
};

export function getCharacterManifest(): CharacterManifest {
  return CHARACTER_MANIFEST_V1;
}

export function getManifestEntry(id: string): CharacterManifestEntry | undefined {
  return CHARACTER_MANIFEST_V1.entries.find((e) => e.id === id);
}

export function listActiveByCategory(category: CosmeticCategory): CharacterManifestEntry[] {
  return CHARACTER_MANIFEST_V1.entries.filter((e) => e.category === category && e.status === 'active');
}
