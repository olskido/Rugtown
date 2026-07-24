/**
 * WorldAssetLoader.ts
 * ───────────────────
 * Loads and renders PNG world assets from rugtown-world-placement-manifest.json.
 * Visual only — does not alter road collision, interactions, or gameplay.
 */

import Phaser from 'phaser';
import manifest from '../data/world-placement-manifest.json';
import { buildWalkableRects, ROAD_WIDTH } from '../world/RoadNetwork';
import { getWorldObject } from '../world/WorldObjects';

/**
 * When true, procedural building/district placeholders (HubLandmarks) are
 * skipped in favor of the manifest below. Phase 8C: re-enabled —
 * world-placement-manifest.json is now generated from canonical
 * WorldObjects.ts anchors for the compact 3600×2400 world (see
 * scripts/generate-compact-world-placement-manifest.mjs), not stale
 * 9600×5400 terrain-art pixel measurements.
 */
export const WORLD_ASSETS_ENABLED = true;

export interface WorldPlacementEntry {
  assetId: string;
  sourceImagePath: string;
  district: string;
  x: number;
  y: number;
  scale: number;
  /** Per-building visual scale (overrides `scale` when set). */
  scaleOverride?: number;
  depth: number;
  collisionType: string;
  notes: string;
  kind?: 'building' | 'prop';
  /** Semantic classification (Phase 8F) — distinct from `kind`, which only
   *  controls anchor math. Filler buildings use kind:'building' (for the
   *  same foundation-centroid placement math as landmarks) but are NOT
   *  gameplay landmarks: they carry no landmarkId and are invisible to
   *  every landmarkId-keyed system (interaction, minimap, missions). */
  placementType?: 'landmark' | 'prop' | 'filler_building';
  footprintPx?: { w: number; h: number };
  landmarkId?: string;
}

export interface WorldAssetLoadStats {
  totalPlacements: number;
  queued: number;
  rendered: number;
  missingTextures: string[];
  failedPaths: string[];
}

export interface WorldAssetDebugFlags {
  bounds: boolean;
  anchors: boolean;
  roadClearance: boolean;
  playerDepth: boolean;
}

const Y_SORT_FACTOR = 0.0001;
const ROAD_CLEARANCE_MARGIN = 12;
const DEBUG_DEPTH = 55;
const PLAYER_DEPTH = 10;
const HIGHLIGHT_TINT = 0xffe88a;
const HIGHLIGHT_ALPHA = 0.22;

/** docs/... path → browser URL under /assets/world/ */
export function toWorldAssetUrl(sourceImagePath: string): string {
  return `/assets/world/${sourceImagePath.replace(/^docs\//, '')}`;
}

function effectiveScale(entry: WorldPlacementEntry): number {
  return entry.scaleOverride ?? entry.scale;
}

function depthFor(entry: WorldPlacementEntry): number {
  return entry.depth + entry.y * Y_SORT_FACTOR;
}

/** Buildings: bottom-center on foundation; props: ground contact. */
function originFor(entry: WorldPlacementEntry): { x: number; y: number } {
  return entry.kind === 'building' ? { x: 0.5, y: 1 } : { x: 0.5, y: 1 };
}

/** Manifest x,y is foundation centroid — shift to bottom-center anchor. */
function placementFor(entry: WorldPlacementEntry): { x: number; y: number } {
  const fh = entry.footprintPx?.h ?? 0;
  if (entry.kind === 'building' && fh > 0) {
    return { x: entry.x, y: entry.y + fh / 2 };
  }
  return { x: entry.x, y: entry.y };
}

function footprintRect(
  entry: WorldPlacementEntry,
  estimateW: (e: WorldPlacementEntry) => number,
  estimateH: (e: WorldPlacementEntry) => number,
): { x: number; y: number; w: number; h: number } {
  const w = entry.footprintPx?.w ?? estimateW(entry);
  const h = entry.footprintPx?.h ?? estimateH(entry);
  const pos = placementFor(entry);
  return {
    x: pos.x - w * 0.5,
    y: pos.y - h,
    w,
    h,
  };
}

interface PlacedSprite {
  entry: WorldPlacementEntry;
  image: Phaser.GameObjects.Image;
}

export class WorldAssetLoader {
  private scene: Phaser.Scene;
  private placed: PlacedSprite[] = [];
  private boundsGfx: Phaser.GameObjects.Graphics;
  private anchorGfx: Phaser.GameObjects.Graphics;
  private highlightGfx: Phaser.GameObjects.Graphics;
  private roadGfx: Phaser.GameObjects.Graphics;
  private playerGfx: Phaser.GameObjects.Graphics;
  private playerDepthLabel: Phaser.GameObjects.Text;
  private debug: WorldAssetDebugFlags = {
    bounds: false,
    anchors: false,
    roadClearance: false,
    playerDepth: false,
  };
  private stats: WorldAssetLoadStats = {
    totalPlacements: 0,
    queued: 0,
    rendered: 0,
    missingTextures: [],
    failedPaths: [],
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.boundsGfx = scene.add.graphics().setDepth(DEBUG_DEPTH).setVisible(false);
    this.anchorGfx = scene.add.graphics().setDepth(DEBUG_DEPTH + 0.1).setVisible(false);
    this.highlightGfx = scene.add.graphics().setDepth(DEBUG_DEPTH - 0.5);
    this.roadGfx = scene.add.graphics().setDepth(DEBUG_DEPTH - 0.2).setVisible(false);
    this.playerGfx = scene.add.graphics().setDepth(DEBUG_DEPTH + 0.2).setVisible(false);
    this.playerDepthLabel = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ff88cc',
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: { x: 4, y: 2 },
      })
      .setDepth(DEBUG_DEPTH + 0.3)
      .setVisible(false);
  }

  /** Queue all manifest textures during WorldScene.preload(). */
  static preloadScene(scene: Phaser.Scene): void {
    if (!WORLD_ASSETS_ENABLED) return;

    const placements = manifest.placements as WorldPlacementEntry[];
    const seen = new Set<string>();

    scene.load.on('loaderror', (file: { key?: string; url?: string }) => {
      console.warn('[WorldAssetLoader] Failed to load:', file.key, file.url);
    });

    for (const entry of placements) {
      if (seen.has(entry.assetId)) continue;
      seen.add(entry.assetId);
      scene.load.image(entry.assetId, toWorldAssetUrl(entry.sourceImagePath));
    }
  }

  /** Place every manifest entry as a Phaser Image. */
  generate(worldW: number, worldH: number): WorldAssetLoadStats {
    const placements = manifest.placements as WorldPlacementEntry[];
    this.stats = {
      totalPlacements: placements.length,
      queued: new Set(placements.map((p) => p.assetId)).size,
      rendered: 0,
      missingTextures: [],
      failedPaths: [],
    };

    if (!WORLD_ASSETS_ENABLED) return this.stats;

    for (const entry of placements) {
      if (!this.scene.textures.exists(entry.assetId)) {
        this.stats.missingTextures.push(entry.assetId);
        this.stats.failedPaths.push(entry.sourceImagePath);
        continue;
      }

      const origin = originFor(entry);
      const pos = placementFor(entry);
      const img = this.scene.add
        .image(pos.x, pos.y, entry.assetId)
        .setOrigin(origin.x, origin.y)
        .setScale(effectiveScale(entry))
        .setDepth(depthFor(entry));

      this.placed.push({ entry, image: img });
      this.stats.rendered += 1;
    }

    this.drawRoadClearance(worldW, worldH);
    this.redrawDebug();
    console.info(
      `[WorldAssetLoader] Rendered ${this.stats.rendered}/${this.stats.totalPlacements} placements`,
      this.stats.missingTextures.length ? { missing: this.stats.missingTextures } : '',
    );
    return this.stats;
  }

  /** Subtle gold wash on interactable buildings when the player is in range. */
  updateInteractableHighlight(px: number, py: number, worldW: number, worldH: number): void {
    this.highlightGfx.clear();
    for (const { entry, image } of this.placed) {
      if (!entry.landmarkId) {
        image.clearTint();
        continue;
      }
      const obj = getWorldObject(entry.landmarkId);
      if (!obj) {
        image.clearTint();
        continue;
      }
      const wx = obj.x * worldW;
      const wy = obj.y * worldH;
      const dist = Math.hypot(px - wx, py - wy);
      const inRange = dist <= obj.interactionRadius;
      if (inRange) {
        image.setTint(HIGHLIGHT_TINT);
        const box = footprintRect(entry, (e) => this.estimateWidth(e), (e) => this.estimateHeight(e));
        this.highlightGfx.fillStyle(HIGHLIGHT_TINT, HIGHLIGHT_ALPHA);
        this.highlightGfx.fillRect(box.x, box.y, box.w, box.h);
      } else {
        image.clearTint();
      }
    }
  }

  /** Read-only access to placed sprites — Phase 8E ambience (lamp glow /
   *  vegetation sway) looks up specific props by asset path to animate the
   *  real placed sprite instead of drawing a duplicate overlay. */
  getPlacedSprites(): ReadonlyArray<{ entry: WorldPlacementEntry; image: Phaser.GameObjects.Image }> {
    return this.placed;
  }

  getStats(): Readonly<WorldAssetLoadStats> {
    return this.stats;
  }

  getDebugFlags(): Readonly<WorldAssetDebugFlags> {
    return { ...this.debug };
  }

  setBoundsDebugVisible(visible: boolean): void {
    this.debug.bounds = visible;
    this.scene.registry.set('assetBoundsDebug', visible);
    this.redrawDebug();
  }

  setAnchorsDebugVisible(visible: boolean): void {
    this.debug.anchors = visible;
    this.scene.registry.set('assetAnchorsDebug', visible);
    this.redrawDebug();
  }

  setRoadClearanceDebugVisible(visible: boolean): void {
    this.debug.roadClearance = visible;
    this.scene.registry.set('assetRoadDebug', visible);
    this.redrawDebug();
  }

  setPlayerDepthDebugVisible(visible: boolean): void {
    this.debug.playerDepth = visible;
    this.scene.registry.set('assetPlayerDepthDebug', visible);
    this.playerGfx.setVisible(visible);
    this.playerDepthLabel.setVisible(visible);
    if (!visible) {
      this.playerGfx.clear();
      this.playerDepthLabel.setText('');
    }
  }

  isBoundsDebugVisible(): boolean {
    return this.debug.bounds;
  }

  updatePlayerDepthDebug(px: number, py: number): void {
    if (!this.debug.playerDepth) return;
    const g = this.playerGfx;
    g.clear();
    g.lineStyle(2, 0xff66cc, 0.95);
    g.strokeCircle(px, py, 14);
    g.lineStyle(1, 0xffffff, 0.8);
    g.lineBetween(px - 18, py, px + 18, py);
    g.lineBetween(px, py - 22, px, py + 6);
    this.playerDepthLabel
      .setPosition(px + 20, py - 28)
      .setText(`player depth ${PLAYER_DEPTH}`);
  }

  private drawRoadClearance(worldW: number, worldH: number): void {
    this.roadGfx.clear();
    const rects = buildWalkableRects(worldW, worldH);
    for (const r of rects) {
      if (r.kind !== 'road') continue;
      const pad = ROAD_CLEARANCE_MARGIN;
      this.roadGfx.fillStyle(0x3ecf8e, 0.07);
      this.roadGfx.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
      this.roadGfx.lineStyle(1, 0x3ecf8e, 0.35);
      this.roadGfx.strokeRect(r.x, r.y, r.w, r.h);
    }
    this.roadGfx.lineStyle(1, 0xff4444, 0.25);
    for (const r of rects) {
      if (r.kind !== 'road') continue;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const half = ROAD_WIDTH / 2;
      if (r.w > r.h) {
        this.roadGfx.lineBetween(r.x, cy - half, r.x + r.w, cy - half);
        this.roadGfx.lineBetween(r.x, cy + half, r.x + r.w, cy + half);
      } else {
        this.roadGfx.lineBetween(cx - half, r.y, cx - half, r.y + r.h);
        this.roadGfx.lineBetween(cx + half, r.y, cx + half, r.y + r.h);
      }
    }
  }

  private redrawDebug(): void {
    const showBounds = this.debug.bounds;
    const showAnchors = this.debug.anchors;
    const showRoad = this.debug.roadClearance;

    this.boundsGfx.setVisible(showBounds);
    this.anchorGfx.setVisible(showAnchors);
    this.roadGfx.setVisible(showRoad);

    this.boundsGfx.clear();
    this.anchorGfx.clear();

    if (!showBounds && !showAnchors) return;

    for (const { entry } of this.placed) {
      if (showBounds) {
        const box = footprintRect(entry, (e) => this.estimateWidth(e), (e) => this.estimateHeight(e));
        const color = entry.kind === 'building' ? 0xc8902a : 0x3ecf8e;
        this.boundsGfx.lineStyle(2, color, 0.85);
        this.boundsGfx.strokeRect(box.x, box.y, box.w, box.h);
        if (entry.kind === 'building') {
          this.boundsGfx.fillStyle(color, 0.08);
          this.boundsGfx.fillRect(box.x, box.y, box.w, box.h);
        }
      }
      if (showAnchors) {
        const pos = placementFor(entry);
        const color = entry.kind === 'building' ? 0xffcc66 : 0x66ffcc;
        this.anchorGfx.fillStyle(color, 1);
        this.anchorGfx.fillCircle(pos.x, pos.y, 4);
        this.anchorGfx.lineStyle(1, color, 0.9);
        this.anchorGfx.lineBetween(pos.x - 8, pos.y, pos.x + 8, pos.y);
        this.anchorGfx.lineBetween(pos.x, pos.y - 8, pos.x, pos.y + 8);
      }
    }
  }

  private estimateWidth(entry: WorldPlacementEntry): number {
    if (!this.scene.textures.exists(entry.assetId)) return 48;
    const frame = this.scene.textures.get(entry.assetId).get();
    return frame.width * effectiveScale(entry);
  }

  private estimateHeight(entry: WorldPlacementEntry): number {
    if (!this.scene.textures.exists(entry.assetId)) return 48;
    const frame = this.scene.textures.get(entry.assetId).get();
    return frame.height * effectiveScale(entry);
  }
}
