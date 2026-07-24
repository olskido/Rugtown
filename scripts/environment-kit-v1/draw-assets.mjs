import { C } from './palette.mjs';

export function wrapSvg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${C.glow}" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="${C.glow}" stop-opacity="0"/>
  </radialGradient>
</defs>
${body}
</svg>`;
}

export function shadow(cx, cy, rx, ry) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="0.28"/>`;
}

export function isoBox(x, y, w, d, h, top = C.stoneMid, left = C.stone, right = C.stoneLight) {
  const dx = w * 0.5, dy = d * 0.28;
  return `
  <polygon points="${x},${y} ${x + dx},${y + dy} ${x + dx},${y + dy + h} ${x},${y + h}" fill="${left}"/>
  <polygon points="${x + dx},${y + dy} ${x + dx + w},${y + dy} ${x + dx + w},${y + dy + h} ${x + dx},${y + dy + h}" fill="${right}"/>
  <polygon points="${x},${y} ${x + w},${y} ${x + dx + w},${y + dy} ${x + dx},${y + dy}" fill="${top}"/>
  `;
}

export function lampFlame(cx, cy, r = 8) {
  return `
  <circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="url(#glow)" opacity="0.7"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.glow}" opacity="0.85"/>
  <circle cx="${cx}" cy="${cy - 1}" r="${r * 0.45}" fill="#fff0c8" opacity="0.6"/>
  `;
}

export function goldTrim(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.gold}" opacity="0.75"/>`;
}

export function drawLanternWall(variant) {
  const w = 96, h = 112, cx = 48;
  const tall = variant >= 3;
  const bodyH = tall ? 36 : 28;
  const y = tall ? 28 : 36;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 8, 22, 8)}
    <rect x="${cx - 4}" y="${y + bodyH}" width="8" height="${h - y - bodyH - 10}" fill="${C.metal}"/>
    ${isoBox(cx - 18, y, 36, 14, bodyH, C.stoneMid, C.stone, C.stoneLight)}
    <rect x="${cx - 16}" y="${y + 4}" width="32" height="${bodyH - 8}" fill="${C.obsidian}" opacity="0.6"/>
    ${goldTrim(cx - 18, y - 3, 36, 4)}
    ${lampFlame(cx, y + bodyH * 0.45, tall ? 7 : 6)}
    ${variant % 2 === 1 ? `<polygon points="${cx - 22},${y} ${cx},${y - 10} ${cx + 22},${y}" fill="${C.bronze}"/>` : ''}
  `);
}

export function drawLanternHanging(variant) {
  const w = 88, h = 120, cx = 44;
  const chain = variant > 1 ? 28 : 18;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 6, 20, 7)}
    <line x1="${cx}" y1="8" x2="${cx}" y2="${chain}" stroke="${C.metal}" stroke-width="2"/>
    ${variant > 2 ? `<line x1="${cx - 8}" y1="8" x2="${cx - 8}" y2="${chain}" stroke="${C.metal}" stroke-width="2"/><line x1="${cx + 8}" y1="8" x2="${cx + 8}" y2="${chain}" stroke="${C.metal}" stroke-width="2"/>` : ''}
    ${isoBox(cx - 16, chain, 32, 12, 24, C.bronzeLight, C.bronze, C.bronzeLight)}
    <rect x="${cx - 12}" y="${chain + 4}" width="24" height="16" fill="${C.obsidian}" opacity="0.5"/>
    ${goldTrim(cx - 16, chain + 22, 32, 3)}
    ${lampFlame(cx, chain + 12, 7)}
  `);
}

export function drawLanternPlaza(variant) {
  const w = 80, h = 140 + variant * 8, cx = 40;
  const postH = 70 + variant * 6;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 8, 26, 9)}
    <rect x="${cx - 3}" y="${h - postH - 20}" width="6" height="${postH}" fill="${C.metal}"/>
    ${goldTrim(cx - 8, h - postH - 24, 16, 6)}
    ${isoBox(cx - 22, h - postH - 50, 44, 18, 28 + variant * 2, C.stoneLight, C.stone, C.stoneMid)}
    ${lampFlame(cx, h - postH - 36, 9 + variant * 0.5)}
    ${variant > 3 ? `<polygon points="${cx - 26},${h - postH - 50} ${cx},${h - postH - 68} ${cx + 26},${h - postH - 50}" fill="${C.gold}" opacity="0.8"/>` : ''}
  `);
}

export function drawLanternBrazier() {
  const w = 96, h = 96, cx = 48, cy = 58;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 10, 28, 10)}
    ${isoBox(cx - 24, cy - 10, 48, 20, 16, C.bronze, C.bronze, C.bronzeLight)}
    <ellipse cx="${cx}" cy="${cy - 8}" rx="22" ry="10" fill="${C.obsidian}"/>
    ${lampFlame(cx, cy - 12, 12)}
    ${goldTrim(cx - 24, cy + 4, 48, 4)}
  `);
}

export function drawBench(type, variant) {
  const w = 112, h = 72, cx = 56;
  const wood = type === 'wood' || type === 'garden';
  const lux = type === 'luxury';
  const seat = wood ? C.wood : lux ? C.stoneLight : C.stoneMid;
  const curve = variant % 2 === 1;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 8, 40, 10)}
    ${curve
      ? `<path d="M${cx - 38} ${h - 28} Q${cx} ${h - 40} ${cx + 38} ${h - 28} L${cx + 34} ${h - 22} Q${cx} ${h - 32} ${cx - 34} ${h - 22} Z" fill="${seat}"/>`
      : `<rect x="${cx - 40}" y="${h - 30}" width="80" height="12" rx="2" fill="${seat}"/>`}
    ${lux ? goldTrim(cx - 40, h - 32, 80, 2) : ''}
    <rect x="${cx - 34}" y="${h - 18}" width="8" height="14" fill="${C.stone}"/>
    <rect x="${cx + 26}" y="${h - 18}" width="8" height="14" fill="${C.stone}"/>
    ${type === 'garden' ? `<circle cx="${cx - 30}" cy="${h - 34}" r="6" fill="${C.leafDark}"/><circle cx="${cx + 28}" cy="${h - 36}" r="7" fill="${C.leafMid}"/>` : ''}
  `);
}

export function drawTree(kind, variant) {
  const w = 96 + variant * 8, h = 120 + variant * 10, cx = w / 2;
  const scale = 0.8 + variant * 0.06;
  const dead = kind === 'dead';
  const pine = kind === 'pine';
  const leaf = dead ? '#1a1814' : kind === 'decorative' ? C.leafMid : C.leafDark;
  return wrapSvg(Math.round(w), Math.round(h), `
    ${shadow(cx, h - 8, 22 * scale, 9)}
    <rect x="${cx - 4}" y="${h - 38}" width="8" height="30" fill="${C.wood}"/>
    ${dead
      ? `<line x1="${cx}" y1="${h - 38}" x2="${cx - 20}" y2="${h - 58}" stroke="${C.wood}" stroke-width="3"/>
         <line x1="${cx}" y1="${h - 42}" x2="${cx + 18}" y2="${h - 62}" stroke="${C.wood}" stroke-width="3"/>`
      : pine
        ? `<polygon points="${cx},${h - 85 * scale} ${cx - 22 * scale},${h - 38} ${cx + 22 * scale},${h - 38}" fill="${leaf}"/>
           <polygon points="${cx},${h - 72 * scale} ${cx - 18 * scale},${h - 42} ${cx + 18 * scale},${h - 42}" fill="${C.leafMid}"/>`
        : `<circle cx="${cx - 14}" cy="${h - 55 * scale}" r="${16 * scale}" fill="${leaf}"/>
           <circle cx="${cx + 12}" cy="${h - 58 * scale}" r="${18 * scale}" fill="${leaf}"/>
           <circle cx="${cx}" cy="${h - 68 * scale}" r="${20 * scale}" fill="${C.leafMid}"/>`}
    ${kind === 'decorative' ? goldTrim(cx - 6, h - 40, 12, 3) : ''}
  `);
}

export function drawBush(variant) {
  const w = 72, h = 56, cx = 36;
  const r = 14 + (variant % 4) * 2;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 6, 24, 8)}
    <circle cx="${cx - 10}" cy="${h - 20}" r="${r}" fill="${C.leafDark}"/>
    <circle cx="${cx + 8}" cy="${h - 22}" r="${r + 2}" fill="${C.leafMid}"/>
    <circle cx="${cx}" cy="${h - 28}" r="${r - 2}" fill="${C.leafDark}"/>
  `);
}

export function drawFlowerBed(variant) {
  const w = 96, h = 48, x = 12;
  const colors = [C.flowerGold, C.flowerRed, C.flowerGold, '#6a5030'];
  return wrapSvg(w, h, `
    ${shadow(48, h - 6, 36, 8)}
    <rect x="${x}" y="${h - 22}" width="${w - 24}" height="16" rx="2" fill="${C.stone}"/>
    ${goldTrim(x, h - 24, w - 24, 2)}
    ${Array.from({ length: 6 + variant % 3 }, (_, i) => {
      const fx = x + 10 + (i % 4) * 16;
      const fy = h - 20 + Math.floor(i / 4) * 6;
      return `<circle cx="${fx}" cy="${fy}" r="4" fill="${colors[i % colors.length]}"/>`;
    }).join('')}
  `);
}

export function drawFence(variant) {
  const w = 128, h = 64;
  const posts = 4 + variant % 3;
  const gap = (w - 24) / posts;
  let s = shadow(64, h - 6, 48, 8);
  for (let i = 0; i <= posts; i++) {
    const px = 12 + i * gap;
    s += `<rect x="${px - 2}" y="${h - 44}" width="4" height="36" fill="${C.stone}"/>`;
  }
  for (let r = 0; r < 2; r++) {
    s += `<rect x="10" y="${h - 38 + r * 14}" width="${w - 20}" height="4" fill="${C.bronze}"/>`;
  }
  return wrapSvg(w, h, s);
}

export function drawWall(variant) {
  const w = 128, h = 80;
  const blocks = 5 + variant % 3;
  let s = shadow(64, h - 8, 52, 10) + isoBox(16, 20, w - 32, 20, 36 + variant * 2, C.stoneMid, C.stone, C.stoneLight);
  for (let i = 0; i < blocks; i++) {
    s += `<rect x="${20 + i * 18}" y="${24 + (i % 2) * 6}" width="14" height="10" fill="${C.stone}" opacity="0.5"/>`;
  }
  s += goldTrim(16, 18, w - 32, 3);
  return wrapSvg(w, h, s);
}

export function drawStairs(variant) {
  const w = 96, h = 80, steps = 4 + variant % 4;
  const sw = (w - 24) / steps;
  let s = shadow(48, h - 6, 36, 8);
  for (let i = 0; i < steps; i++) {
    const y = h - 16 - i * 10;
    s += isoBox(12 + i * 4, y - 8, w - 24 - i * 8, 16, 8, C.stoneLight, C.stoneMid, C.stone);
    s += goldTrim(12 + i * 4, y - 9, w - 24 - i * 8, 1);
  }
  return wrapSvg(w, h, s);
}

export function drawArch(variant) {
  const w = 112, h = 96, cx = 56;
  const wide = variant > 3;
  const aw = wide ? 44 : 32;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 8, 38, 10)}
    <rect x="${cx - aw - 8}" y="${h - 52}" width="12" height="44" fill="${C.stone}"/>
    <rect x="${cx + aw - 4}" y="${h - 52}" width="12" height="44" fill="${C.stoneLight}"/>
    <path d="M${cx - aw} ${h - 52} A${aw} ${aw * 0.7} 0 0 1 ${cx + aw} ${h - 52}" fill="none" stroke="${C.gold}" stroke-width="4"/>
    ${variant % 2 ? lampFlame(cx, h - 58, 5) : ''}
  `);
}

export function drawPlanter(variant) {
  const w = 72, h = 64, cx = 36;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 6, 22, 8)}
    ${isoBox(cx - 20, h - 28, 40, 14, 14, C.stoneLight, C.stone, C.stoneMid)}
    <circle cx="${cx - 8}" cy="${h - 38}" r="9" fill="${C.leafDark}"/>
    <circle cx="${cx + 6}" cy="${h - 40}" r="10" fill="${C.leafMid}"/>
    ${variant > 4 ? `<circle cx="${cx}" cy="${h - 44}" r="4" fill="${C.flowerGold}"/>` : ''}
  `);
}

export function drawMarketStall(type, variant) {
  const w = 112, h = 96, cx = 56;
  const awning = type === 'food' ? C.bronzeLight : type === 'potion' ? '#2a4038' : C.goldDim;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 8, 40, 10)}
    ${isoBox(cx - 32, h - 36, 64, 22, 22, C.woodLight, C.wood, C.woodLight)}
    <polygon points="${cx - 36},${h - 38} ${cx},${h - 56 - variant % 3 * 4} ${cx + 36},${h - 38}" fill="${awning}" opacity="0.9"/>
    ${goldTrim(cx - 36, h - 40, 72, 2)}
    ${type === 'cart' ? `<circle cx="${cx - 24}" cy="${h - 12}" r="6" fill="${C.metal}"/><circle cx="${cx + 24}" cy="${h - 12}" r="6" fill="${C.metal}"/>` : ''}
    ${type === 'token' ? `<rect x="${cx - 8}" y="${h - 32}" width="16" height="16" rx="8" fill="${C.gold}" opacity="0.8"/>` : ''}
    ${type === 'auction' ? `<rect x="${cx - 14}" y="${h - 34}" width="28" height="4" fill="${C.gold}"/>` : ''}
  `);
}

export function drawBarrel(variant) {
  const w = 56, h = 64, cx = 28;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 6, 18, 7)}
    ${isoBox(cx - 16, h - 40, 32, 14, 28, C.woodLight, C.wood, C.woodLight)}
    <ellipse cx="${cx}" cy="${h - 40}" rx="16" ry="6" fill="${C.wood}"/>
    ${goldTrim(cx - 16, h - 28 + variant % 3 * 6, 32, 3)}
  `);
}

export function drawCrate(variant) {
  const w = 56, h = 56, cx = 28;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 6, 18, 7)}
    ${isoBox(cx - 18, h - 36, 36, 14, 24, C.wood, C.woodLight, C.wood)}
    <line x1="${cx - 18}" y1="${h - 24}" x2="${cx + 18}" y2="${h - 24}" stroke="${C.goldDim}" stroke-width="1"/>
    <line x1="${cx}" y1="${h - 36}" x2="${cx}" y2="${h - 12}" stroke="${C.goldDim}" stroke-width="1"/>
  `);
}

export function drawBanner(type, variant) {
  const w = 64, h = 96, cx = 32;
  const color = type === 'guild' ? C.bronze : type === 'district' ? C.goldDim : C.gold;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 6, 14, 6)}
    <line x1="${cx}" y1="8" x2="${cx}" y2="${h - 20}" stroke="${C.metal}" stroke-width="2"/>
    <polygon points="${cx - 14},${16 + variant * 2} ${cx + 14},${20 + variant * 2} ${cx + 10},${h - 28} ${cx - 10},${h - 24}" fill="${color}" opacity="0.85"/>
    <circle cx="${cx}" cy="${h - 26}" r="5" fill="${C.goldBright}" opacity="0.5"/>
  `);
}

export function drawBridge(size, variant) {
  const w = size === 'large' ? 160 : size === 'small' ? 96 : 128;
  const h = size === 'large' ? 80 : 64;
  const cx = w / 2;
  return wrapSvg(w, h, `
    ${shadow(cx, h - 8, w * 0.35, 10)}
    ${isoBox(12, h - 32, w - 24, 24, 12, C.stoneLight, C.stone, C.stoneMid)}
    <path d="M${cx - 30 - variant * 4} ${h - 32} Q${cx} ${h - 52} ${cx + 30 + variant * 4} ${h - 32}" fill="none" stroke="${C.gold}" stroke-width="3"/>
    ${variant % 2 ? `<circle cx="${cx - 24}" cy="${h - 36}" r="3" fill="${C.glow}"/><circle cx="${cx + 24}" cy="${h - 36}" r="3" fill="${C.glow}"/>` : ''}
  `);
}

export function drawStreetDecor(type, variant) {
  const w = 80, h = 88, cx = 40;
  switch (type) {
    case 'sign':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 16, 6)}<rect x="${cx - 3}" y="${h - 50}" width="6" height="40" fill="${C.metal}"/>${isoBox(cx - 16, h - 68, 32, 10, 18, C.stoneMid, C.stone, C.stoneLight)}${goldTrim(cx - 16, h - 70, 32, 3)}`);
    case 'coin-statue':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 20, 8)}${isoBox(cx - 14, h - 36, 28, 12, 20, C.stone, C.stoneMid, C.stoneLight)}<circle cx="${cx}" cy="${h - 52}" r="12" fill="${C.gold}" opacity="0.85"/>`);
    case 'fountain-small':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 22, 8)}${isoBox(cx - 18, h - 28, 36, 14, 10, C.stone, C.stoneMid, C.stoneLight)}<circle cx="${cx}" cy="${h - 34}" r="10" fill="#142430"/><circle cx="${cx}" cy="${h - 36}" r="4" fill="${C.goldBright}" opacity="0.6"/>`);
    case 'clock':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 18, 7)}<rect x="${cx - 3}" y="${h - 48}" width="6" height="38" fill="${C.metal}"/><circle cx="${cx}" cy="${h - 58}" r="14" fill="${C.bronze}"/><circle cx="${cx}" cy="${h - 58}" r="10" fill="${C.obsidian}"/><line x1="${cx}" y1="${h - 58}" x2="${cx}" y2="${h - 64}" stroke="${C.gold}" stroke-width="2"/>`);
    case 'rock':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 24, 9)}<ellipse cx="${cx - 6}" cy="${h - 24}" rx="18" ry="12" fill="${C.stone}"/><ellipse cx="${cx + 8}" cy="${h - 20}" rx="14" ry="10" fill="${C.stoneMid}"/>`);
    case 'mailbox':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 14, 6)}${isoBox(cx - 12, h - 40, 24, 10, 22, C.stoneMid, C.stone, C.stoneLight)}${goldTrim(cx - 4, h - 44, 8, 6)}`);
    case 'wood-pile':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 28, 10)}${Array.from({length:4},(_,i)=>`<rect x="${cx-20+i*8}" y="${h-28-i*2}" width="24" height="6" fill="${C.wood}" transform="rotate(${-8+i*5} ${cx} ${h-20})"/>`).join('')}`);
    case 'rope-coil':
      return wrapSvg(w, h, `${shadow(cx, h - 6, 18, 7)}<ellipse cx="${cx}" cy="${h - 28}" rx="16" ry="10" fill="none" stroke="${C.rope}" stroke-width="4"/><ellipse cx="${cx}" cy="${h - 30}" rx="10" ry="6" fill="none" stroke="${C.rope}" stroke-width="3"/>`);
    default:
      return wrapSvg(w, h, shadow(cx, h - 6, 16, 6));
  }
}
