/**
 * character-body-art.mjs
 * ────────────────────────
 * Phase 13 — procedurally-generated (SVG → PNG via sharp) base body and
 * outfit art. Replaces the old ellipse+rect placeholder mannequin with
 * real anatomy (defined shoulders, neck, tapered torso, readable hands,
 * boots) and gives outfits real distinct silhouettes instead of a single
 * baked-in jacket.
 *
 * This is vector/procedural art, not hand-painted or AI-generated pixel
 * art — a genuine, inspectable improvement over the previous mannequin,
 * not a claim of "premium indie RPG" fidelity. Designed to be fully
 * replaced by real generated/painted art later (see
 * rugtown_asset_pipeline/incoming/README.md) without any code changes —
 * generateBaseBodies() in install-character-assets.mjs already prefers
 * real art over this generator when a differently-sized file exists at
 * the same path.
 *
 * Canvas: 192x288 (2x the old 96x144) for a crisper render before the
 * runtime's visible-bounds-based downscale (Phase 11C).
 */

export const BODY_CANVAS_W = 192;
export const BODY_CANVAS_H = 288;
const OUTLINE = '#241a14';

/** Renders the base body — bare torso/legs in a fitted neutral
 *  undergarment (no baked outerwear; see the 'outfit' layer for that),
 *  parametrized per skin tone. */
export function baseBodySvg(skin, skinShadow, undergarment = '#9aa0a6', undergarmentShadow = '#767c82') {
  const W = BODY_CANVAS_W, H = BODY_CANVAS_H;
  return `<?xml version="1.0"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="torsoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${undergarment}"/>
      <stop offset="100%" stop-color="${undergarmentShadow}"/>
    </linearGradient>
    <linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${skin}"/>
      <stop offset="100%" stop-color="${skinShadow}"/>
    </linearGradient>
    <radialGradient id="headGrad" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="${skin}"/>
      <stop offset="100%" stop-color="${skinShadow}"/>
    </radialGradient>
  </defs>

  <path d="M 112 160 Q 122 200 120 248 L 118 272 Q 130 276 132 272 L 134 246 Q 138 198 128 158 Z"
        fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="2"/>
  <path d="M 116 266 Q 116 260 124 260 L 136 260 Q 144 260 146 268 L 148 276 Q 148 282 140 282 L 116 282 Q 110 282 110 276 Z"
        fill="#3a2c22" stroke="${OUTLINE}" stroke-width="2"/>

  <path d="M 84 160 Q 74 200 76 248 L 78 272 Q 66 276 64 272 L 62 246 Q 58 198 68 158 Z"
        fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="2"/>
  <path d="M 60 266 Q 60 260 68 260 L 80 260 Q 88 260 90 268 L 92 276 Q 92 282 84 282 L 60 282 Q 54 282 54 276 Z"
        fill="#4a3a2c" stroke="${OUTLINE}" stroke-width="2"/>

  <path d="M 66 148 Q 64 130 96 128 Q 128 130 126 148
           L 130 176 Q 130 186 120 186 L 104 186 Q 98 184 98 176 L 97 156
           L 95 156 L 94 176 Q 94 184 88 186 L 72 186 Q 62 186 62 176 Z"
        fill="url(#torsoGrad)" stroke="${OUTLINE}" stroke-width="2.5"/>

  <path d="M 118 82 Q 152 88 156 118 L 156 152 Q 156 164 148 164 L 142 164 Q 136 162 137 152 L 138 122 Q 136 100 112 92 Z"
        fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="2"/>
  <path d="M 140 154 Q 136 152 136 158 L 136 170 Q 136 176 144 176 Q 152 176 152 170 L 152 160 Q 152 152 146 152 Z"
        fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="1.5"/>

  <path d="M 66 96 Q 62 84 78 76 Q 88 70 96 70 Q 104 70 114 76 Q 130 84 126 96
           L 132 130 Q 134 146 126 152 L 66 152 Q 58 146 60 130 Z"
        fill="url(#torsoGrad)" stroke="${OUTLINE}" stroke-width="2.5"/>
  <path d="M 78 90 Q 96 98 114 90" fill="none" stroke="${undergarmentShadow}" stroke-width="2" opacity="0.55"/>

  <path d="M 74 82 Q 40 88 36 118 L 36 152 Q 36 164 44 164 L 50 164 Q 56 162 55 152 L 54 122 Q 56 100 80 92 Z"
        fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="2"/>
  <path d="M 36 154 Q 32 152 32 158 L 32 168 Q 32 172 36 174 L 38 174 Q 40 176 42 174 L 44 174 Q 46 176 48 174
           L 49 174 Q 51 172 50 168 L 49 158 Q 48 152 42 152 Z"
        fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="1.5"/>

  <path d="M 82 62 Q 82 78 96 80 Q 110 78 110 62 L 107 52 L 85 52 Z" fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="1.5"/>

  <ellipse cx="96" cy="34" rx="25" ry="28" fill="url(#headGrad)" stroke="${OUTLINE}" stroke-width="2.5"/>
  <ellipse cx="71" cy="35" rx="4" ry="7" fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="1.5"/>
  <ellipse cx="121" cy="35" rx="4" ry="7" fill="url(#skinGrad)" stroke="${OUTLINE}" stroke-width="1.5"/>
  <ellipse cx="86" cy="34" rx="2.6" ry="3.4" fill="#1a1410"/>
  <ellipse cx="106" cy="34" rx="2.6" ry="3.4" fill="#1a1410"/>
  <path d="M 81 28 Q 86 26 91 28" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M 101 28 Q 106 26 111 28" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M 96 36 L 93 44 L 98 44" fill="none" stroke="${skinShadow}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M 88 50 Q 96 53 104 50" fill="none" stroke="#5a3a2c" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;
}

/** id -> { displayName, svg(c1,c2,trim) } — each draws ONLY clothing
 *  (no skin/head/hands), sized/posed to sit exactly on baseBodySvg()'s
 *  body (same 192x288 canvas, same shoulder/waist/hip landmarks). */
export const OUTFIT_DEFS = {
  outfit_market_tunic: {
    displayName: 'Market Tunic',
    palette: { c1: '#8a4a3a', c2: '#5c2e22', trim: '#c8902a' },
    svg: (c1, c2, trim) => `
      <path d="M 68 92 Q 64 82 80 74 Q 88 68 96 68 Q 104 68 112 74 Q 128 82 124 92
               L 132 166 Q 134 182 122 184 L 70 184 Q 58 182 60 166 Z"
            fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 68 92 Q 54 98 52 116 L 56 132 Q 58 140 66 138 L 72 136 Q 76 134 74 126 L 70 112 Q 70 100 82 94 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 124 92 Q 138 98 140 116 L 136 132 Q 134 140 126 138 L 120 136 Q 116 134 118 126 L 122 112 Q 122 100 110 94 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
      <rect x="60" y="144" width="72" height="10" rx="2" fill="${trim}" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 78 74 Q 96 84 114 74" fill="none" stroke="${c2}" stroke-width="2.5"/>
    `,
  },
  outfit_guard_vest: {
    displayName: 'Guard Vest',
    palette: { c1: '#3a4048', c2: '#20242a', trim: '#8a8f96' },
    svg: (c1, c2, trim) => `
      <path d="M 62 92 Q 58 80 78 72 Q 88 66 96 66 Q 104 66 114 72 Q 134 80 130 92
               L 136 128 Q 138 150 128 158 L 64 158 Q 54 150 56 128 Z"
            fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 60 78 Q 56 88 60 100 L 76 100 L 76 82 Z" fill="${c2}" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 132 78 Q 136 88 132 100 L 116 100 L 116 82 Z" fill="${c2}" stroke="${OUTLINE}" stroke-width="2"/>
      <rect x="60" y="140" width="72" height="12" rx="2" fill="${trim}" stroke="${OUTLINE}" stroke-width="2"/>
      <rect x="90" y="141" width="12" height="10" rx="1.5" fill="#2a2420"/>
      <path d="M 78 84 L 78 150 M 114 84 L 114 150" fill="none" stroke="${OUTLINE}" stroke-width="1.4" opacity="0.5"/>
    `,
  },
  outfit_scholar_robe: {
    displayName: 'Scholar Robe',
    palette: { c1: '#4a3a5a', c2: '#2e2440', trim: '#c8902a' },
    svg: (c1, c2, trim) => `
      <path d="M 60 88 Q 42 100 40 130 L 46 168 Q 48 178 58 176 L 66 174 Q 70 170 66 160 L 62 132 Q 64 106 80 94 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 132 88 Q 150 100 152 130 L 146 168 Q 144 178 134 176 L 126 174 Q 122 170 126 160 L 130 132 Q 128 106 112 94 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 60 88 Q 56 78 76 70 Q 88 64 96 64 Q 104 64 116 70 Q 136 78 132 88
               L 150 200 Q 152 222 140 226 L 52 226 Q 40 222 42 200 Z"
            fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 96 70 L 92 226" fill="none" stroke="${OUTLINE}" stroke-width="1.6" opacity="0.5"/>
      <circle cx="96" cy="100" r="3" fill="${trim}"/><circle cx="96" cy="114" r="3" fill="${trim}"/><circle cx="96" cy="128" r="3" fill="${trim}"/>
      <path d="M 78 70 Q 96 80 114 70" fill="none" stroke="${trim}" stroke-width="2.5"/>
    `,
  },
  outfit_merchant_coat: {
    displayName: 'Merchant Coat',
    palette: { c1: '#2a3a3a', c2: '#182626', trim: '#d4af37' },
    svg: (c1, c2, trim) => `
      <path d="M 64 90 Q 60 80 78 72 Q 88 66 96 66 Q 104 66 114 72 Q 132 80 128 90
               L 140 178 Q 142 196 130 200 L 62 200 Q 50 196 52 178 Z"
            fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 96 72 L 88 130 L 96 140 L 104 130 L 96 72" fill="${c2}" stroke="${OUTLINE}" stroke-width="1.8"/>
      <path d="M 78 72 Q 70 90 74 108 L 88 100 Z M 114 72 Q 122 90 118 108 L 104 100 Z" fill="${c2}" stroke="${OUTLINE}" stroke-width="1.5"/>
      <circle cx="96" cy="112" r="3" fill="${trim}" stroke="${OUTLINE}" stroke-width="1"/>
      <circle cx="96" cy="128" r="3" fill="${trim}" stroke="${OUTLINE}" stroke-width="1"/>
      <circle cx="96" cy="144" r="3" fill="${trim}" stroke="${OUTLINE}" stroke-width="1"/>
      <path d="M 64 92 Q 46 104 44 132 L 50 168 Q 52 178 62 176 L 66 174 Q 70 170 66 160 L 62 134 Q 64 110 80 98 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 128 92 Q 146 104 148 132 L 142 168 Q 140 178 130 176 L 126 174 Q 122 170 126 160 L 130 134 Q 128 110 112 98 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
    `,
  },
  outfit_work_apron: {
    displayName: 'Work Apron',
    palette: { c1: '#7a5a3a', c2: '#5a3f26', trim: '#c8902a' },
    svg: (c1, c2, trim) => `
      <path d="M 66 96 Q 62 84 78 76 Q 88 70 96 70 Q 104 70 114 76 Q 130 84 126 96 L 132 130 Q 134 146 126 152 L 66 152 Q 58 146 60 130 Z"
            fill="#8a8580" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 78 82 Q 96 88 114 82 L 118 108 L 74 108 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M 68 108 Q 62 140 66 186 L 126 186 Q 130 140 124 108 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 82 108 L 78 186 M 110 108 L 114 186" fill="none" stroke="${trim}" stroke-width="1.4" opacity="0.6"/>
      <rect x="86" y="126" width="20" height="16" rx="2" fill="${trim}" opacity="0.35" stroke="${OUTLINE}" stroke-width="1.2"/>
      <path d="M 80 82 Q 76 70 82 62 Q 86 58 90 60 L 88 82 Z" fill="${c1}" stroke="${OUTLINE}" stroke-width="1.6"/>
      <path d="M 112 82 Q 116 70 110 62 Q 106 58 102 60 L 104 82 Z" fill="${c1}" stroke="${OUTLINE}" stroke-width="1.6"/>
    `,
  },
  outfit_traveler_cloak: {
    displayName: "Traveler's Cloak",
    palette: { c1: '#3a4a3e', c2: '#20281f', trim: '#c8902a' },
    svg: (c1, c2, trim) => `
      <path d="M 66 96 Q 62 84 78 76 Q 88 70 96 70 Q 104 70 114 76 Q 130 84 126 96 L 132 130 Q 134 146 126 152 L 66 152 Q 58 146 60 130 Z"
            fill="#8a8580" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 58 80 Q 30 92 26 130 Q 22 172 32 214 Q 40 224 58 220 Q 66 216 62 204
               Q 52 172 56 134 Q 58 104 78 88 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 134 80 Q 162 92 166 130 Q 170 172 160 214 Q 152 224 134 220 Q 126 216 130 204
               Q 140 172 136 134 Q 134 104 114 88 Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M 78 88 Q 96 98 114 88" fill="none" stroke="${trim}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="86" cy="94" r="2.6" fill="${trim}"/><circle cx="106" cy="94" r="2.6" fill="${trim}"/>
    `,
  },
};

export function outfitSvg(id) {
  const def = OUTFIT_DEFS[id];
  if (!def) throw new Error(`unknown outfit id: ${id}`);
  const { c1, c2, trim } = def.palette;
  return `<?xml version="1.0"?><svg width="${BODY_CANVAS_W}" height="${BODY_CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
  ${def.svg(c1, c2, trim)}
</svg>`;
}
