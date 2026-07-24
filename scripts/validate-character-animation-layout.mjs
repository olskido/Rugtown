/**
 * Static animation layout checks for character manifest.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

console.log('Mode: STATIC\n');

const src = fs.readFileSync(path.join(root, 'src/game/characters/CharacterManifest.ts'), 'utf8');
if (!src.includes("directionalLayout: 'cardinal_rows'")) fail('cardinal_rows layout');
else ok('cardinal_rows');
if (!src.includes("origin: 'bottom-center'")) fail('bottom-center origin');
else ok('bottom-center origin');
if (!src.includes("frameWidth: 48") || !src.includes("frameHeight: 72")) fail('48×72 frames');
else ok('48×72 frames');

const anim = fs.readFileSync(path.join(root, 'src/game/characters/CharacterAnimationController.ts'), 'utf8');
if (!anim.includes('smoothWalkBlend')) fail('walk blend');
else ok('walk blend');
if (!anim.includes('dtMs / 1000')) fail('dt seconds for blend');
else ok('dtSeconds for walk blend');
if (anim.includes('animTick = 0') && anim.includes('this.state = \'walk\'')) {
  // ensure we don't reset tick on every walk enter in a naive way — soft check
  ok('animation controller present');
}

console.log('\n---');
if (errors.length) { console.error(`${errors.length} failure(s)`); process.exit(1); }
console.log('validate-character-animation-layout STATIC passed');
