/**
 * Static validation — Phase 10L character manifest (client).
 * Distinguishes STATIC checks only — no live DB.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC (no live database)\n');

const manifestPath = path.join(root, 'src/game/characters/CharacterManifest.ts');
if (!fs.existsSync(manifestPath)) fail('CharacterManifest.ts missing');
else ok('CharacterManifest.ts present');

const src = fs.readFileSync(manifestPath, 'utf8');
const requiredIds = [
  'base_default', 'hair_short', 'hair_long', 'outfit_starter_dark',
  'outfit_market_apron', 'hat_beanie', 'glasses_round',
];
for (const id of requiredIds) {
  if (!src.includes(`id: '${id}'`)) fail(`manifest entry ${id}`);
  else ok(`manifest ${id}`);
}
if (!src.includes("logicalFrameWidth: 48")) fail('expected 48 logical width');
else ok('logical frame 48×72');
if (!src.includes("renderModeDefault: 'graphics'")) fail('procedural default mode');
else ok('procedural fallback default');

const moduleFiles = [
  'CharacterRenderer.ts', 'CharacterEntity.ts', 'CharacterAppearanceModel.ts',
  'CharacterAnimationController.ts', 'CharacterAssetRegistry.ts', 'CharacterManifest.ts',
  'CharacterLayers.ts', 'CharacterDirections.ts', 'CharacterStates.ts',
  'CharacterFallbackRenderer.ts', 'CharacterPreloader.ts', 'CharacterValidation.ts', 'index.ts',
];
for (const f of moduleFiles) {
  const p = path.join(root, 'src/game/characters', f);
  if (!fs.existsSync(p)) fail(`missing ${f}`);
  else ok(`module ${f}`);
}

// Ensure no arbitrary URL loaders in character module
const charDir = path.join(root, 'src/game/characters');
for (const f of fs.readdirSync(charDir)) {
  if (!f.endsWith('.ts')) continue;
  const t = fs.readFileSync(path.join(charDir, f), 'utf8');
  if (/https?:\/\//.test(t) && !t.includes('// http')) {
    // allow comments only — fail on assignment-like URL usage
    if (/['"`]https?:\/\//.test(t)) fail(`${f} contains absolute URL string`);
  }
}
ok('no absolute cosmetic URL strings in character module');

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-character-manifest STATIC passed');
void require;
