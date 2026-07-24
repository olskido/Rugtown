/**
 * Cosmetic ID mapping — bridges creator legacy IDs ↔ server/manifest slugs.
 * Presence never authorizes cosmetics; only mapped approved IDs render.
 */

export type CosmeticSlot =
  | 'base' | 'hair' | 'outfit' | 'hat' | 'glasses' | 'badge'
  | 'skin' | 'shoes' | 'back' | 'held';

export interface CosmeticMappingEntry {
  slug: string;
  serverId: string;
  manifestVersion: string;
  slot: CosmeticSlot;
  rarity: string;
  ownershipRequired: boolean;
  textureRef: string | null;
  animationCompatible: boolean;
  genderNeutral: boolean;
  npcOnly: boolean;
  playerUsable: boolean;
  hidden: boolean;
  deprecated: boolean;
  fallbackSlug: string;
  /** Legacy creator / procedural option ids that map to this slug. */
  legacyAliases: string[];
}

const ENTRIES: CosmeticMappingEntry[] = [
  {
    slug: 'base_default', serverId: 'base_default', manifestVersion: '1', slot: 'base',
    rarity: 'common', ownershipRequired: false, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'base_default', legacyAliases: ['base_default'],
  },
  {
    slug: 'hair_short', serverId: 'hair_short', manifestVersion: '1', slot: 'hair',
    rarity: 'common', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'hair_short',
    legacyAliases: ['shortBlack', 'shortBlonde', 'hoodieHood', 'bald', 'short'],
  },
  {
    slug: 'hair_long', serverId: 'hair_long', manifestVersion: '1', slot: 'hair',
    rarity: 'common', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'hair_short',
    legacyAliases: ['longBlack', 'longRed', 'long', 'mohawkTeal', 'mohawkGray'],
  },
  {
    slug: 'outfit_starter_dark', serverId: 'outfit_starter_dark', manifestVersion: '1', slot: 'outfit',
    rarity: 'common', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'outfit_starter_dark', legacyAliases: ['default', 'darkCoat', 'starter'],
  },
  {
    slug: 'outfit_market_apron', serverId: 'outfit_market_apron', manifestVersion: '1', slot: 'outfit',
    rarity: 'uncommon', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'outfit_starter_dark', legacyAliases: ['marketApron', 'apron'],
  },
  {
    slug: 'hat_beanie', serverId: 'hat_beanie', manifestVersion: '1', slot: 'hat',
    rarity: 'common', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'none', legacyAliases: ['beanieBlack', 'beanieGold', 'beanie'],
  },
  {
    slug: 'glasses_round', serverId: 'glasses_round', manifestVersion: '1', slot: 'glasses',
    rarity: 'common', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'none', legacyAliases: ['round', 'shades'],
  },
  {
    slug: 'cosmetic_test_event_pin', serverId: 'cosmetic_test_event_pin', manifestVersion: '1', slot: 'badge',
    rarity: 'test', ownershipRequired: true, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'none', legacyAliases: [],
  },
  {
    slug: 'none', serverId: 'none', manifestVersion: '1', slot: 'hat',
    rarity: 'common', ownershipRequired: false, textureRef: null, animationCompatible: true,
    genderNeutral: true, npcOnly: false, playerUsable: true, hidden: false, deprecated: false,
    fallbackSlug: 'none', legacyAliases: ['none'],
  },
];

const bySlug = new Map(ENTRIES.map((e) => [e.slug, e]));
const byAlias = new Map<string, CosmeticMappingEntry>();
for (const e of ENTRIES) {
  byAlias.set(e.slug, e);
  for (const a of e.legacyAliases) byAlias.set(a, e);
}

export function resolveCosmeticSlug(raw: string | null | undefined): CosmeticMappingEntry | null {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.includes('://') || raw.includes('/') || raw.includes('\\')) return null;
  return byAlias.get(raw) ?? bySlug.get(raw) ?? null;
}

export function sanitizePublicCosmeticId(raw: unknown, slot?: CosmeticSlot): string {
  if (typeof raw !== 'string') return slot === 'hair' ? 'hair_short' : slot === 'outfit' ? 'outfit_starter_dark' : 'none';
  const entry = resolveCosmeticSlug(raw);
  if (!entry || entry.hidden || entry.deprecated || entry.npcOnly) {
    return entry?.fallbackSlug ?? (slot === 'hair' ? 'hair_short' : slot === 'outfit' ? 'outfit_starter_dark' : 'none');
  }
  if (!entry.playerUsable) return entry.fallbackSlug;
  return entry.slug;
}

export function listCosmeticMappings(): CosmeticMappingEntry[] {
  return ENTRIES.slice();
}

export function isRestrictedCosmeticSlug(slug: string): boolean {
  const e = bySlug.get(slug);
  if (!e) return true;
  return e.hidden || e.npcOnly || !e.playerUsable;
}
