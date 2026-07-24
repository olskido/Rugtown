/**
 * Fail-loud static validation for the installed bitmap character system.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const characters = path.join(root, 'public', 'assets', 'characters');
const atlasesDir = path.join(characters, 'atlases');
const basesDir = path.join(characters, 'bases');
const errors = [];
let totalFrames = 0;

function fail(message) {
  errors.push(message);
  console.error(`FAIL ${message}`);
}

function ok(message) {
  console.log(`OK   ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${path.relative(root, file)}: invalid JSON (${error.message})`);
    return null;
  }
}

function pngSize(file) {
  const data = fs.readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (data.subarray(0, 8).toString('hex') !== signature || data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('missing PNG IHDR');
  }
  return { w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
}

function walkSource(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSource(file, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(file);
  }
  return files;
}

console.log('=== Bitmap character system validation ===');

if (!fs.existsSync(atlasesDir)) {
  fail('public/assets/characters/atlases is missing');
} else {
  const files = fs.readdirSync(atlasesDir);
  const jsonFiles = files.filter((file) => file.endsWith('.json')).sort();
  const pngFiles = files.filter((file) => file.endsWith('.png')).sort();
  const jsonStems = new Set(jsonFiles.map((file) => path.basename(file, '.json')));
  const pngStems = new Set(pngFiles.map((file) => path.basename(file, '.png')));

  if (jsonFiles.length !== 9 || pngFiles.length !== 9) {
    fail(`expected 9 atlas PNG+JSON pairs; found ${pngFiles.length} PNG and ${jsonFiles.length} JSON`);
  }
  for (const stem of jsonStems) if (!pngStems.has(stem)) fail(`atlas ${stem}: PNG counterpart missing`);
  for (const stem of pngStems) if (!jsonStems.has(stem)) fail(`atlas ${stem}: JSON counterpart missing`);

  const allFrameNames = new Set();
  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(atlasesDir, jsonFile);
    const atlas = readJson(jsonPath);
    if (!atlas) continue;
    const pngName = atlas.meta?.image;
    const frames = atlas.frames;
    if (typeof pngName !== 'string' || !pngName.endsWith('.png')) {
      fail(`${jsonFile}: meta.image must name a PNG`);
      continue;
    }
    const pngPath = path.join(atlasesDir, pngName);
    if (!fs.existsSync(pngPath)) {
      fail(`${jsonFile}: missing declared image ${pngName}`);
      continue;
    }
    if (!frames || typeof frames !== 'object' || Array.isArray(frames)) {
      fail(`${jsonFile}: frames must be an object`);
      continue;
    }

    let imageSize;
    try {
      imageSize = pngSize(pngPath);
    } catch (error) {
      fail(`${pngName}: ${error.message}`);
      continue;
    }
    const names = Object.keys(frames);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) fail(`${jsonFile}: duplicate frame names`);
    if (!names.length) fail(`${jsonFile}: no frames`);

    for (const name of names) {
      const frame = frames[name]?.frame;
      if (!frame || !Number.isFinite(frame.x) || !Number.isFinite(frame.y) || !Number.isFinite(frame.w) || !Number.isFinite(frame.h)) {
        fail(`${jsonFile}: ${name} has invalid frame bounds`);
        continue;
      }
      if (frame.w <= 0 || frame.h <= 0) fail(`${jsonFile}: ${name} has non-positive bounds`);
      if (frame.x < 0 || frame.y < 0 || frame.x + frame.w > imageSize.w || frame.y + frame.h > imageSize.h) {
        fail(`${jsonFile}: ${name} is outside ${pngName} (${imageSize.w}x${imageSize.h})`);
      }
      if (allFrameNames.has(name)) fail(`duplicate frame name across atlases: ${name}`);
      allFrameNames.add(name);
    }
    totalFrames += names.length;
    ok(`${jsonFile}: ${names.length} frames within ${imageSize.w}x${imageSize.h}`);
  }
}

const expectedBases = ['base_skin_fair', 'base_skin_light', 'base_skin_medium', 'base_skin_tan', 'base_skin_deep', 'base_skin_dark'];
for (const base of expectedBases) {
  const file = path.join(basesDir, `${base}.png`);
  if (!fs.existsSync(file)) fail(`generated base missing: ${path.relative(root, file)}`);
}
if (!errors.some((error) => error.startsWith('generated base missing:'))) ok(`${expectedBases.length} generated base PNGs`);

for (const file of [
  path.join(characters, 'manifests', 'character_runtime_manifest.json'),
  path.join(root, 'docs', 'character-system', 'asset-audit.json'),
]) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(root, file)}`);
  else if (readJson(file)) ok(`${path.relative(root, file)} parses`);
}

const rendererHits = [];
const src = path.join(root, 'src');
if (!fs.existsSync(src)) {
  fail('src directory missing');
} else {
  for (const file of walkSource(src)) {
    const text = fs.readFileSync(file, 'utf8');
    if (/^\s*import(?:[\s\S]*?\sfrom\s*)?['"][^'"]*HumanoidRenderer[^'"]*['"]\s*;?/m.test(text)
      || /\bimport\s*\(\s*['"][^'"]*HumanoidRenderer[^'"]*['"]\s*\)/.test(text)) {
      rendererHits.push(path.relative(root, file));
    }
  }
}
if (rendererHits.length) fail(`HumanoidRenderer imports remain: ${rendererHits.join(', ')}`);
else ok('no HumanoidRenderer imports in src');

console.log('\n--- Summary ---');
console.log(`atlases: 9 expected, ${totalFrames} frames checked`);
console.log(`bases: ${expectedBases.length} expected`);
console.log(`HumanoidRenderer imports: ${rendererHits.length}`);
if (errors.length) {
  console.error(`Validation failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log('Bitmap character system validation passed.');
