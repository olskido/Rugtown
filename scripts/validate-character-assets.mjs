/**
 * Static validation — character asset paths referenced by manifest.
 * Mode: STATIC. Missing bitmap art is expected until Phase 10M import.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');

const base = path.join(root, 'public/assets/characters');
const dirs = ['bases', 'hair', 'outfits', 'accessories', 'held-items', 'shadows', 'npc', 'manifests'];
for (const d of dirs) {
  const p = path.join(base, d);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    ok(`created missing dir ${d}`);
  } else ok(`dir ${d}`);
}

const readme = path.join(base, 'README.md');
if (!fs.existsSync(readme)) {
  fs.writeFileSync(readme, '# Character assets\n\nPlaceholder directory. Final bitmap art is not shipped in Phase 10L.\nProcedural fallback remains active until assets pass validation.\n');
  ok('wrote README placeholder');
} else ok('README present');

const src = fs.readFileSync(path.join(root, 'src/game/characters/CharacterManifest.ts'), 'utf8');
const pathMatches = [...src.matchAll(/texturePath:\s*'([^']+)'/g)].map((m) => m[1]);
const nullPaths = (src.match(/texturePath:\s*null/g) || []).length;
ok(`${nullPaths} procedural (null) texture paths`);
for (const rel of pathMatches) {
  if (rel.includes('://') || rel.includes('..')) fail(`unsafe path ${rel}`);
  else {
    const abs = path.join(base, rel);
    if (!fs.existsSync(abs)) ok(`deferred art missing (expected): ${rel}`);
    else ok(`asset present ${rel}`);
  }
}

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-character-assets STATIC passed (art may be deferred)');
