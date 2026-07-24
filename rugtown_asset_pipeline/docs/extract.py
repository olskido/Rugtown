#!/usr/bin/env python3
"""RugTown production-sheet extraction pipeline.
Reusable: point SHEET_CONFIG at any future sheet. No manual cropping.

Method:
  1. Exterior flood-fill background removal (preserves interior whites:
     white shoes, cream clothing, highlights).
  2. Connected components; text labels / divider lines filtered by geometry.
  3. Proximity clustering merges multi-part assets (front+side pairs).
  4. Per-asset label OCR (tesseract) for deterministic semantic IDs.
  5. Soft alpha at boundaries preserves anti-aliased outlines.
  6. Canvas normalization per category; deterministic naming; metadata.
"""
import os, re, json, hashlib
import numpy as np
import cv2

try:
    import pytesseract
    OCR = True
except ImportError:
    OCR = False

UPLOADS = '/mnt/user-data/uploads'
OUT = '/home/claude/rugtown/out'

# category, slot, id-prefix, npcOnly, referenceOnly, cluster gap px, align
SHEET_CONFIG = {
 '1784308808186_image.png': dict(sheet='headwear_library_v1',  category='headwear',    slot='headwear',   prefix='headwear', npc=False, ref=False, gap=10, align='center'),
 '1784308862632_image.png': dict(sheet='hair_library_v1',      category='hair',        slot='hair',       prefix='hair',     npc=False, ref=False, gap=10, align='center'),
 '1784308875158_image.png': dict(sheet='facial_hair_library_v1',category='facial-hair',slot='facialHair', prefix='facialhair',npc=False,ref=False, gap=10, align='center'),
 '1784308882694_image.png': dict(sheet='accessories_library_v1',category='accessories',slot='accessory',  prefix='accessory',npc=False, ref=False, gap=8,  align='center'),
 '1784308898357_image.png': dict(sheet='shoes_library_v1',     category='shoes',       slot='shoes',      prefix='shoe',     npc=False, ref=False, gap=6,  align='center'),
 '1784308905168_image.png': dict(sheet='pants_library_v1',     category='pants',       slot='pants',      prefix='pants',    npc=False, ref=False, gap=12, align='center'),
 '1784308787119_image.png': dict(sheet='npc_library_v1_a',     category='npcs',        slot='npc',        prefix='npc',      npc=True,  ref=False, gap=8,  align='bottom'),
 '1784308791551_image.png': dict(sheet='npc_library_v1_b',     category='npcs',        slot='npc',        prefix='npc',      npc=True,  ref=False, gap=8,  align='bottom'),
 '1784308797690_image.png': dict(sheet='npc_library_v1_c',     category='npcs',        slot='npc',        prefix='npc',      npc=True,  ref=False, gap=8,  align='bottom'),
 '1784308819373_image.png': dict(sheet='npc_government_v1',    category='npcs',        slot='npc',        prefix='npc_gov',  npc=True,  ref=False, gap=8,  align='bottom'),
 '1784308823704_image.png': dict(sheet='character_bible_female_v1', category='reference', slot=None, prefix='ref', npc=False, ref=True, gap=8, align='center'),
 '1784308854372_image.png': dict(sheet='character_bible_master_v1', category='reference', slot=None, prefix='ref', npc=False, ref=True, gap=8, align='center'),
}

LIGHT_THRESH = 208      # page background luminance
MIN_ASSET_AREA = 220    # px
TEXT_MAX_H = 26         # blobs shorter than this = label text
LINE_MAX_H = 5          # divider lines
LABEL_STRIP_H = 26      # OCR strip below each asset


def exterior_background(gray):
    h, w = gray.shape
    light = (gray >= LIGHT_THRESH).astype(np.uint8)
    ff = light.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]
    for sx, sy in seeds:
        if ff[sy, sx] == 1:
            cv2.floodFill(ff, mask, (sx, sy), 2)
    return ff == 2


def components(fg):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 8)
    assets, junk = [], []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if h <= LINE_MAX_H and w > 150:
            junk.append(i)                       # divider line
        elif h < TEXT_MAX_H:
            junk.append(i)                       # label text / numbering
        elif area < MIN_ASSET_AREA:
            junk.append(i)                       # specks
        else:
            assets.append((x, y, w, h, i))
    return lab, assets, junk


def cluster(assets, gap):
    """Merge blobs whose bboxes are near-adjacent (multi-view items)."""
    boxes = [list(a) for a in assets]
    merged = True
    while merged:
        merged = False
        out = []
        used = [False] * len(boxes)
        for i in range(len(boxes)):
            if used[i]:
                continue
            x1, y1, w1, h1, *ids1 = boxes[i]
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                x2, y2, w2, h2, *ids2 = boxes[j]
                hgap = max(x1, x2) - min(x1 + w1, x2 + w2)
                vgap = max(y1, y2) - min(y1 + h1, y2 + h2)
                yov = min(y1 + h1, y2 + h2) - max(y1, y2)
                xov = min(x1 + w1, x2 + w2) - max(x1, x2)
                if (hgap <= gap and yov > 0.4 * min(h1, h2)) or (vgap <= 3 and xov > 0.5 * min(w1, w2)):
                    nx, ny = min(x1, x2), min(y1, y2)
                    nw = max(x1 + w1, x2 + w2) - nx
                    nh = max(y1 + h1, y2 + h2) - ny
                    x1, y1, w1, h1, ids1 = nx, ny, nw, nh, ids1 + ids2
                    used[j] = True
                    merged = True
            out.append([x1, y1, w1, h1] + ids1)
            used[i] = True
        boxes = out
    return boxes


def slugify(t):
    t = re.sub(r'^[\s\d\.\-–—]+', '', t)             # strip "1. "
    t = re.sub(r'[^a-zA-Z0-9]+', '_', t).strip('_').lower()
    return t[:40] if t else ''


def ocr_label(img_bgr, box, sheet_h):
    if not OCR:
        return ''
    x, y, w, h = box[:4]
    y0, y1 = y + h + 1, min(y + h + 1 + LABEL_STRIP_H, sheet_h)
    x0, x1 = max(0, x - 6), min(img_bgr.shape[1], x + w + 6)
    if y1 <= y0:
        return ''
    strip = img_bgr[y0:y1, x0:x1]
    strip = cv2.resize(strip, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    g = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY)
    g = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    try:
        txt = pytesseract.image_to_string(g, config='--psm 6 -c tessedit_char_whitelist="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-"').strip()
    except Exception:
        return ''
    return slugify(txt.replace('\n', ' '))


def soft_alpha(fg_bool):
    a = (fg_bool * 255).astype(np.uint8)
    return cv2.GaussianBlur(a, (3, 3), 0.6)


def run_sheet(fname, cfg, registry):
    img = cv2.imread(os.path.join(UPLOADS, fname))
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bg = exterior_background(gray)
    fg = ~bg
    lab, assets, _ = components(fg)
    keep = np.isin(lab, [a[4] for a in assets])
    boxes = cluster(assets, cfg['gap'])
    boxes = [b for b in boxes if not (b[2] > 0.50 * w or (b[2] / max(b[3], 1)) > 6)]
    boxes.sort(key=lambda b: (round(b[1] / 60), b[0]))   # row-major order

    alpha_full = soft_alpha(keep)
    results = []
    for idx, b in enumerate(boxes, 1):
        x, y, bw, bh = b[:4]
        pad = 2
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)
        rgba = np.dstack([img[y0:y1, x0:x1][:, :, ::-1], alpha_full[y0:y1, x0:x1]])
        # zero out other clusters' pixels inside this crop
        local_ids = set(b[4:])
        local_lab = lab[y0:y1, x0:x1]
        others = np.isin(local_lab, list(local_ids), invert=True) & (local_lab > 0)
        rgba[others, 3] = 0
        label = ocr_label(img, b, h)
        results.append(dict(bbox=[int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
                            label=label, rgba=rgba, order=idx,
                            edge_clipped=bool(x0 == 0 or y0 == 0 or x1 == w or y1 == h),
                            parts=len(b) - 4))
    registry[cfg['sheet']] = dict(cfg=cfg, file=fname, results=results)


def normalize_and_export(registry):
    os.makedirs(OUT, exist_ok=True)
    meta_all, id_seen = [], {}
    for sheet, data in registry.items():
        cfg = data['cfg']
        if cfg['ref']:
            continue
        cat_dir = os.path.join(OUT, 'characters', cfg['category'], 'processed')
        os.makedirs(cat_dir, exist_ok=True)
        # canvas: per-sheet max dimension, rounded to /16
        mx = max(max(r['rgba'].shape[0], r['rgba'].shape[1]) for r in data['results'])
        canvas = int(np.ceil((mx + 6) / 16) * 16)
        for r in data['results']:
            base = f"{cfg['prefix']}_{r['label']}" if r['label'] else f"{cfg['prefix']}_item"
            n = id_seen.get(base, 0) + 1
            id_seen[base] = n
            aid = f"{base}_{n:02d}"
            ch, cw = r['rgba'].shape[:2]
            cnv = np.zeros((canvas, canvas, 4), np.uint8)
            ox = (canvas - cw) // 2
            oy = (canvas - ch - 4) if cfg['align'] == 'bottom' else (canvas - ch) // 2
            cnv[oy:oy + ch, ox:ox + cw] = r['rgba']
            path = os.path.join(cat_dir, aid + '.png')
            cv2.imwrite(path, cnv[:, :, [2, 1, 0, 3]])
            meta_all.append(dict(
                id=aid,
                displayName=(r['label'] or 'UNNAMED — review').replace('_', ' ').title(),
                category=cfg['category'], slot=cfg['slot'], district=None,
                compatibleGender='any', playerUsable=not cfg['npc'], npcOnly=cfg['npc'],
                rarity='common', theme=None, atlas=f"atlas_{cfg['category']}",
                frame=aid, anchorX=0.5, anchorY=1.0 if cfg['align'] == 'bottom' else 0.5,
                canvasSize=canvas, sourceSheet=sheet, version=1,
                requiresReview=bool(not r['label'] or r['edge_clipped'] or r['parts'] > 3
                                    or re.search(r'[bcdfghjklmnpqrstvwxz]{4}', r['label'] or '')
                                    or re.search(r'\d', r['label'] or '')),
                _edgeClipped=r['edge_clipped'], _mergedParts=r['parts'], _file=path))
    json.dump(meta_all, open(os.path.join(OUT, 'metadata_assets.json'), 'w'), indent=1)
    return meta_all


if __name__ == '__main__':
    registry = {}
    for fname, cfg in SHEET_CONFIG.items():
        run_sheet(fname, cfg, registry)
        n = len(registry[cfg['sheet']]['results'])
        print(f"{cfg['sheet']:32s} extracted clusters: {n}")
    meta = normalize_and_export(registry)
    print(f"\nTotal exported assets: {len(meta)}")
    print(f"OCR-named: {sum(1 for m in meta if 'UNNAMED' not in m['displayName'])}")
    print(f"Flagged for review: {sum(1 for m in meta if m['requiresReview'])}")
