/**
 * export-art-blueprint.mjs
 * ─────────────────────────
 * Generates final map art blueprints for designers / image-gen reference.
 * Data mirrors HubLandmarks.ts + RoadNetwork.ts + MAP_MEASUREMENT_DESIGN_SPEC.md
 *
 * Run: node scripts/export-art-blueprint.mjs
 * Output:
 *   docs/rugtown-art-blueprint-9600x5400.svg
 *   docs/rugtown-art-blueprint-4800x2700.png
 */

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, '../docs');

const W = 9600;
const H = 5400;
const ROAD_WIDTH = 88;
const VISUAL_ROAD_HALF = 64;
const EDGE_BARRIER = 120;
const SPAWN = { x: 3648, y: 3132, fx: 0.38, fy: 0.58 };

/* ─── Road network (RoadNetwork.ts) ─────────────────────────────────── */
const ROAD_NODES = [
  { id: 'fountain', x: 0.380, y: 0.580, plaza: 165 },
  { id: 'notice',   x: 0.396, y: 0.508, plaza: 92  },
  { id: 'market',   x: 0.476, y: 0.460, plaza: 112 },
  { id: 'bridge',   x: 0.448, y: 0.532, plaza: 100 },
  { id: 'alpha',    x: 0.528, y: 0.540, plaza: 104 },
  { id: 'whale',    x: 0.448, y: 0.628, plaza: 112 },
  { id: 'fame',     x: 0.316, y: 0.668, plaza: 116 },
  { id: 'coffee',   x: 0.348, y: 0.620, plaza: 92  },
  { id: 'park',     x: 0.540, y: 0.620, plaza: 104 },
  { id: 'cashback', x: 0.188, y: 0.867, plaza: 140 },
  { id: 'arena',    x: 0.812, y: 0.867, plaza: 160 },
];

const ROAD_EDGES = [
  { a: 'fountain', b: 'notice',   corner: 'h' },
  { a: 'fountain', b: 'bridge',   corner: 'h' },
  { a: 'fountain', b: 'coffee',   corner: 'h' },
  { a: 'fountain', b: 'whale',    corner: 'h' },
  { a: 'notice',   b: 'market',   corner: 'h' },
  { a: 'notice',   b: 'bridge',   corner: 'h' },
  { a: 'bridge',   b: 'alpha',    corner: 'h' },
  { a: 'bridge',   b: 'whale',    corner: 'v' },
  { a: 'whale',    b: 'park',     corner: 'h' },
  { a: 'coffee',   b: 'fame',     corner: 'h' },
  { a: 'alpha',    b: 'park',     corner: 'v' },
  { a: 'market',   b: 'alpha',    corner: 'h' },
  { a: 'fame',     b: 'cashback', corner: 'v' },
  { a: 'cashback', b: 'arena',    corner: 'h' },
  { a: 'park',     b: 'arena',    corner: 'v' },
];

/* ─── Landmarks (HubLandmarks.ts HUB_LANDMARK_SPECS) ──────────────────── */
const LANDMARKS = [
  { id: 'fountain',       label: 'Spawn Fountain',        cx: 3648, cy: 3132, w: 280, h: 280, ox: 0,    oy: 0    },
  { id: 'notice',         label: 'Notice Board',          cx: 3802, cy: 2743, w: 120, h: 100, ox: 0,    oy: -55  },
  { id: 'market',         label: 'Meme Market',           cx: 4570, cy: 2484, w: 320, h: 240, ox: 0,    oy: -90  },
  { id: 'bridge',         label: 'Bridge',                cx: 4301, cy: 2873, w: 360, h: 120, ox: 0,    oy: -30  },
  { id: 'alpha',          label: 'Alpha Lounge',          cx: 5069, cy: 2916, w: 280, h: 220, ox: 0,    oy: 75   },
  { id: 'whale',          label: 'Whale Tower',           cx: 4301, cy: 3391, w: 200, h: 360, ox: 95,   oy: 0    },
  { id: 'fame',           label: 'Hall of Fame',          cx: 3034, cy: 3607, w: 300, h: 260, ox: 0,    oy: 95   },
  { id: 'coffee',         label: 'Coffee Shop',           cx: 3341, cy: 3348, w: 200, h: 180, ox: -75,  oy: 20   },
  { id: 'park',           label: 'Park Entrance',         cx: 5184, cy: 3348, w: 240, h: 160, ox: 0,    oy: 70   },
  { id: 'cashback',       label: 'Holder Cashback Vault', cx: 1805, cy: 4682, w: 210, h: 170, ox: 0,    oy: -30  },
  { id: 'arena',          label: 'Future Arena',          cx: 7795, cy: 4682, w: 310, h: 250, ox: 0,    oy: -25  },
  { id: 'nft-shop',       label: 'NFT / Shop District',   cx: 6200, cy: 2600, w: 400, h: 300, ox: 0,    oy: 0    },
  { id: 'locked-east-1',  label: 'Coming Soon',           cx: 6800, cy: 3200, w: 180, h: 200, ox: 0,    oy: 0    },
  { id: 'locked-north-1', label: 'Expansion',             cx: 4200, cy: 1800, w: 200, h: 180, ox: 0,    oy: 0    },
  { id: 'locked-west-1',  label: 'Restricted',            cx: 1400, cy: 3000, w: 180, h: 200, ox: 0,    oy: 0    },
];

/* ─── District boundaries (MAP_MEASUREMENT_DESIGN_SPEC §4) ────────────── */
const DISTRICTS = [
  { id: 'spawn',    name: 'Spawn Plaza',           x: 3200, y: 2850, w: 900,  h: 550  },
  { id: 'market',   name: 'Market District',       x: 4300, y: 2200, w: 600,  h: 500  },
  { id: 'alpha',    name: 'Alpha Lounge District', x: 4900, y: 2700, w: 500,  h: 400  },
  { id: 'whale',    name: 'Whale Tower District',  x: 4100, y: 3200, w: 500,  h: 400  },
  { id: 'fame',     name: 'Hall of Fame District', x: 2800, y: 3200, w: 700,  h: 600  },
  { id: 'park',     name: 'Park / Bridge Area',    x: 4000, y: 2700, w: 1600, h: 800  },
  { id: 'arena',    name: 'Arena District',        x: 7200, y: 4300, w: 1200, h: 750  },
  { id: 'cashback', name: 'Cashback Holder Dist.', x: 1200, y: 4300, w: 1200, h: 750  },
  { id: 'expansion',name: 'Future Expansion Zone', x: 5600, y: 1200, w: 3600, h: 3000 },
];

/* ─── Southern district plates ────────────────────────────────────────── */
const DISTRICT_PLATES = [
  { id: 'cashback', cx: 1805, cy: 4682, w: 760, h: 520 },
  { id: 'arena',    cx: 7795, cy: 4682, w: 1080, h: 660 },
];

/* ─── Blocked / future zones (MAP_MEASUREMENT_DESIGN_SPEC §5) ─────────── */
const BLOCKED_ZONES = [
  { label: 'FENCED BOUNDARY',     x: 120,  y: 0,    w: 9360, h: 2100, kind: 'fence'     },
  { label: 'FUTURE EXPANSION',    x: 120,  y: 1200, w: 2480, h: 3000, kind: 'expansion' },
  { label: 'FUTURE EXPANSION',    x: 6000, y: 1200, w: 3480, h: 3000, kind: 'expansion' },
  { label: 'PARK / RIVER',        x: 2800, y: 3900, w: 4000, h: 400,  kind: 'water'     },
  { label: 'WATER / RIVER',       x: 4100, y: 2950, w: 400,  h: 100,  kind: 'water'     },
  { label: 'MOUNTAIN / WALL',     x: 120,  y: 120,  w: 1480, h: 1880, kind: 'mountain'  },
  { label: 'MOUNTAIN / WALL',     x: 8400, y: 120,  w: 1080, h: 1880, kind: 'mountain'  },
];

const ZONE_COLORS = {
  fence:     { fill: '#1a2030', opacity: 0.35, stroke: '#506070' },
  expansion: { fill: '#1a1820', opacity: 0.4,  stroke: '#806040' },
  water:     { fill: '#0a1828', opacity: 0.55, stroke: '#2a4a60' },
  mountain:  { fill: '#101418', opacity: 0.5,  stroke: '#3a4048' },
  edge:      { fill: '#080c10', opacity: 0.7,  stroke: '#c8902a' },
};

/* ─── Geometry helpers ────────────────────────────────────────────────── */
function nodeById(id) {
  const n = ROAD_NODES.find(nd => nd.id === id);
  if (!n) throw new Error(`unknown node ${id}`);
  return n;
}

function px(id) { return nodeById(id).x * W; }
function py(id) { return nodeById(id).y * H; }

function segmentRect(x1, y1, x2, y2) {
  const half = ROAD_WIDTH / 2;
  if (y1 === y2) {
    const left = Math.min(x1, x2) - half;
    const right = Math.max(x1, x2) + half;
    return { x: left, y: y1 - half, w: right - left, h: ROAD_WIDTH, kind: 'road' };
  }
  const top = Math.min(y1, y2) - half;
  const bottom = Math.max(y1, y2) + half;
  return { x: x1 - half, y: top, w: ROAD_WIDTH, h: bottom - top, kind: 'road' };
}

function buildWalkableRects() {
  const rects = [];
  for (const n of ROAD_NODES) {
    const cx = n.x * W, cy = n.y * H;
    rects.push({ x: cx - n.plaza, y: cy - n.plaza, w: n.plaza * 2, h: n.plaza * 2, kind: 'plaza' });
  }
  for (const e of ROAD_EDGES) {
    const ax = px(e.a), ay = py(e.a);
    const bx = px(e.b), by = py(e.b);
    if ((e.corner ?? 'h') === 'h') {
      rects.push(segmentRect(ax, ay, bx, ay));
      rects.push(segmentRect(bx, ay, bx, by));
    } else {
      rects.push(segmentRect(ax, ay, ax, by));
      rects.push(segmentRect(ax, by, bx, by));
    }
  }
  return rects;
}

function visualRoadRects() {
  const half = VISUAL_ROAD_HALF;
  const rects = [];
  for (const e of ROAD_EDGES) {
    const ax = px(e.a), ay = py(e.a);
    const bx = px(e.b), by = py(e.b);
    if ((e.corner ?? 'h') === 'h') {
      const left = Math.min(ax, bx) - half, right = Math.max(ax, bx) + half;
      rects.push({ x: left, y: ay - half, w: right - left, h: half * 2 });
      const top = Math.min(ay, by) - half, bottom = Math.max(ay, by) + half;
      rects.push({ x: bx - half, y: top, w: half * 2, h: bottom - top });
    } else {
      const top = Math.min(ay, by) - half, bottom = Math.max(ay, by) + half;
      rects.push({ x: ax - half, y: top, w: half * 2, h: bottom - top });
      const left = Math.min(ax, bx) - half, right = Math.max(ax, bx) + half;
      rects.push({ x: left, y: by - half, w: right - left, h: half * 2 });
    }
  }
  for (const n of ROAD_NODES) {
    const cx = n.x * W, cy = n.y * H, r = n.plaza;
    rects.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
  }
  return rects;
}

function footprintRect(lm) {
  return {
    x: lm.cx + lm.ox - lm.w / 2,
    y: lm.cy + lm.oy - lm.h / 2,
    w: lm.w,
    h: lm.h,
  };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ─── SVG builder ───────────────────────────────────────────────────── */
function buildSvg() {
  const walkable = buildWalkableRects();
  const visualRoads = visualRoadRects();
  const parts = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<title>RugTown Art Blueprint — ${W}×${H}</title>`);
  parts.push(`<desc>Final map reference. Walkable=green. Buildings=gold footprints. Do not place art over walkable lanes.</desc>`);

  // Defs: patterns + legend fonts
  parts.push(`<defs>
    <pattern id="hatch-expansion" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="40" stroke="#806040" stroke-width="2" opacity="0.35"/>
    </pattern>
    <pattern id="hatch-fence" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M0 24 L24 0 M-6 6 L6 -6 M18 30 L30 18" stroke="#506070" stroke-width="1.5" opacity="0.4"/>
    </pattern>
    <pattern id="hatch-water" width="32" height="16" patternUnits="userSpaceOnUse">
      <path d="M0 8 Q8 4 16 8 T32 8" fill="none" stroke="#2a5a70" stroke-width="1.5" opacity="0.5"/>
    </pattern>
    <pattern id="grid" width="220" height="220" patternUnits="userSpaceOnUse">
      <path d="M 220 0 L 0 0 0 220" fill="none" stroke="#1a2430" stroke-width="1" opacity="0.35"/>
    </pattern>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#c8902a"/>
    </marker>
  </defs>`);

  // Layer 0: background + grid
  parts.push(`<g id="background">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#0a0e12"/>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#grid)"/>`);
  parts.push(`</g>`);

  // Layer 1: world boundary + edge barrier
  parts.push(`<g id="world-boundary">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#c8902a" stroke-width="6"/>`);
  parts.push(`<rect x="${EDGE_BARRIER}" y="${EDGE_BARRIER}" width="${W - EDGE_BARRIER * 2}" height="${H - EDGE_BARRIER * 2}" fill="${ZONE_COLORS.edge.fill}" fill-opacity="0.25" stroke="${ZONE_COLORS.edge.stroke}" stroke-width="2" stroke-dasharray="16 10"/>`);
  parts.push(`<text x="${W / 2}" y="72" fill="#c8902a" font-size="56" font-family="Georgia, serif" text-anchor="middle" font-weight="bold">RUGTOWN WORLD — ${W} × ${H} px</text>`);
  parts.push(`<text x="${W / 2}" y="130" fill="#8a7a58" font-size="36" font-family="Georgia, serif" text-anchor="middle">Art Blueprint · Origin top-left (0,0) · Spawn (3648, 3132)</text>`);
  parts.push(`</g>`);

  // Layer 2: blocked / future zones
  parts.push(`<g id="blocked-zones" opacity="0.9">`);
  for (const z of BLOCKED_ZONES) {
    const c = ZONE_COLORS[z.kind] ?? ZONE_COLORS.expansion;
    const pattern = z.kind === 'water' ? 'url(#hatch-water)' : z.kind === 'fence' ? 'url(#hatch-fence)' : 'url(#hatch-expansion)';
    parts.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${c.fill}" fill-opacity="${c.opacity}" stroke="${c.stroke}" stroke-width="2" stroke-dasharray="12 8"/>`);
    parts.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="${pattern}" opacity="0.6"/>`);
    parts.push(`<text x="${z.x + z.w / 2}" y="${z.y + z.h / 2}" fill="#a0a8b0" font-size="42" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" opacity="0.7">${esc(z.label)}</text>`);
  }
  parts.push(`</g>`);

  // Layer 3: district boundaries
  parts.push(`<g id="districts">`);
  for (const d of DISTRICTS) {
    parts.push(`<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="none" stroke="#c8902a" stroke-width="3" stroke-dasharray="20 14" opacity="0.65"/>`);
    parts.push(`<text x="${d.x + 16}" y="${d.y + 44}" fill="#c8902a" font-size="38" font-family="Georgia, serif" opacity="0.85">${esc(d.name)}</text>`);
  }
  for (const p of DISTRICT_PLATES) {
    parts.push(`<rect x="${p.cx - p.w / 2}" y="${p.cy - p.h / 2}" width="${p.w}" height="${p.h}" fill="none" stroke="#a08030" stroke-width="2" stroke-dasharray="8 6" opacity="0.5"/>`);
  }
  parts.push(`</g>`);

  // Layer 4: player-safe walkable (collision)
  parts.push(`<g id="walkable-collision">`);
  for (const r of walkable) {
    const fill = r.kind === 'plaza' ? '#1e6a50' : '#1a5a48';
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" fill-opacity="0.42" stroke="#3ecf8e" stroke-width="1" stroke-opacity="0.35"/>`);
  }
  parts.push(`</g>`);

  // Layer 5: visual roads (art asphalt target)
  parts.push(`<g id="visual-roads">`);
  for (const r of visualRoads) {
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#1a2838" fill-opacity="0.55" stroke="#2a3848" stroke-width="1"/>`);
  }
  parts.push(`</g>`);

  // Layer 6: building footprints
  parts.push(`<g id="building-footprints">`);
  for (const lm of LANDMARKS) {
    const fp = footprintRect(lm);
    const isLocked = lm.id.startsWith('locked-') || lm.id === 'nft-shop';
    const fill = isLocked ? '#304050' : '#c8902a';
    parts.push(`<rect x="${fp.x}" y="${fp.y}" width="${fp.w}" height="${fp.h}" fill="${fill}" fill-opacity="0.22" stroke="${fill}" stroke-width="4"/>`);
    // Centre crosshair
    parts.push(`<line x1="${lm.cx - 12}" y1="${lm.cy}" x2="${lm.cx + 12}" y2="${lm.cy}" stroke="#ffe88a" stroke-width="2" opacity="0.6"/>`);
    parts.push(`<line x1="${lm.cx}" y1="${lm.cy - 12}" x2="${lm.cx}" y2="${lm.cy + 12}" stroke="#ffe88a" stroke-width="2" opacity="0.6"/>`);
  }
  parts.push(`</g>`);

  // Layer 7: labels + coordinates
  parts.push(`<g id="labels">`);
  for (const lm of LANDMARKS) {
    const fp = footprintRect(lm);
    const coordText = `(${lm.cx}, ${lm.cy}) · ${lm.w}×${lm.h}`;
    parts.push(`<text x="${lm.cx}" y="${fp.y - 18}" fill="#ffe88a" font-size="40" font-family="Georgia, serif" text-anchor="middle" font-weight="bold">${esc(lm.label)}</text>`);
    parts.push(`<text x="${lm.cx}" y="${fp.y + 24}" fill="#c8b888" font-size="28" font-family="Courier New, monospace" text-anchor="middle">${esc(coordText)}</text>`);
    parts.push(`<text x="${fp.x + 8}" y="${fp.y + fp.h - 10}" fill="#8a8070" font-size="22" font-family="Courier New, monospace">${esc(lm.id)}</text>`);
  }
  parts.push(`</g>`);

  // Layer 8: spawn marker
  parts.push(`<g id="spawn-marker">`);
  parts.push(`<circle cx="${SPAWN.x}" cy="${SPAWN.y}" r="48" fill="none" stroke="#ff4444" stroke-width="4"/>`);
  parts.push(`<circle cx="${SPAWN.x}" cy="${SPAWN.y}" r="16" fill="#ff4444"/>`);
  parts.push(`<line x1="${SPAWN.x - 70}" y1="${SPAWN.y}" x2="${SPAWN.x + 70}" y2="${SPAWN.y}" stroke="#ff4444" stroke-width="3"/>`);
  parts.push(`<line x1="${SPAWN.x}" y1="${SPAWN.y - 70}" x2="${SPAWN.x}" y2="${SPAWN.y + 70}" stroke="#ff4444" stroke-width="3"/>`);
  parts.push(`<text x="${SPAWN.x}" y="${SPAWN.y + 100}" fill="#ff6666" font-size="36" font-family="Georgia, serif" text-anchor="middle" font-weight="bold">SPAWN</text>`);
  parts.push(`<text x="${SPAWN.x}" y="${SPAWN.y + 142}" fill="#cc8888" font-size="28" font-family="Courier New, monospace" text-anchor="middle">(${SPAWN.x}, ${SPAWN.y}) · fx=${SPAWN.fx} fy=${SPAWN.fy}</text>`);
  parts.push(`</g>`);

  // Legend
  parts.push(`<g id="legend" transform="translate(140, ${H - 340})">`);
  parts.push(`<rect x="0" y="0" width="680" height="300" fill="#0c1018" fill-opacity="0.92" stroke="#c8902a" stroke-width="2" rx="8"/>`);
  const legendItems = [
    ['#1a5a48', 'Walkable lanes (collision, 88px roads + plazas)'],
    ['#1a2838', 'Visual asphalt target (128px lanes)'],
    ['#c8902a', 'Building art footprint (do not block walkable)'],
    ['#506070', 'Blocked / future / fenced zones'],
    ['#ff4444', 'Player spawn point'],
  ];
  legendItems.forEach(([color, text], i) => {
    const ly = 40 + i * 48;
    parts.push(`<rect x="24" y="${ly - 18}" width="36" height="36" fill="${color}" fill-opacity="0.7" stroke="#888" stroke-width="1"/>`);
    parts.push(`<text x="76" y="${ly + 8}" fill="#d0c8b0" font-size="26" font-family="Arial, sans-serif">${esc(text)}</text>`);
  });
  parts.push(`</g>`);

  parts.push(`</svg>`);
  return parts.join('\n');
}

/* ─── Landmark table for console + optional markdown ──────────────────── */
function printLandmarkTable() {
  console.log('\n── Landmark coordinates (art footprints) ──\n');
  console.log('| ID | Name | Centre (x,y) | Art rect (x,y) | Size (w×h) |');
  console.log('|----|------|--------------|----------------|------------|');
  for (const lm of LANDMARKS) {
    const fp = footprintRect(lm);
    console.log(`| ${lm.id} | ${lm.label} | (${lm.cx}, ${lm.cy}) | (${Math.round(fp.x)}, ${Math.round(fp.y)}) | ${lm.w}×${lm.h} |`);
  }
}

/* ─── Main ────────────────────────────────────────────────────────────── */
async function main() {
  const svg = buildSvg();
  const svgPath = join(DOCS, 'rugtown-art-blueprint-9600x5400.svg');
  writeFileSync(svgPath, svg, 'utf8');
  console.log('Wrote', svgPath);

  const pngPath = join(DOCS, 'rugtown-art-blueprint-4800x2700.png');
  try {
    const sharp = (await import('sharp')).default;
    await sharp(Buffer.from(svg))
      .resize(4800, 2700, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(pngPath);
    console.log('Wrote', pngPath);
  } catch (err) {
    console.warn('PNG export requires sharp. Installing...');
    const { execSync } = await import('child_process');
    execSync('npm install --save-dev sharp', { cwd: join(__dirname, '..'), stdio: 'inherit' });
    const sharp = (await import('sharp')).default;
    await sharp(Buffer.from(svg))
      .resize(4800, 2700, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(pngPath);
    console.log('Wrote', pngPath);
  }

  printLandmarkTable();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
