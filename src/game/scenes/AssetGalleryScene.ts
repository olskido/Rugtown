/**
 * AssetGalleryScene.ts
 * ────────────────────
 * Phase 7A/7B — Dev-only gallery to QA the world PNG library.
 * RAW CANVAS = full transparent frame; NORMALIZED = visible-content crop preview.
 * Does not place assets in the live world.
 */

import Phaser from 'phaser';
import {
  WORLD_LIBRARY_CATEGORIES,
  WORLD_LIBRARY_MANIFEST,
  getAssetsByCategory,
  preloadWorldLibraryAssets,
  validateWorldLibraryTextures,
  type WorldLibraryAsset,
  type WorldAssetValidationReport,
} from '../assets/WorldAssetManifest';
import {
  WORLD_ASSET_VISUAL_BOUNDS,
  applyNormalizedPreviewCrop,
  clearPreviewCrop,
  getVisualBounds,
} from '../assets/WorldAssetBounds';

const BG = 0x0c1014;
const CELL = 148;
const CELL_PAD = 12;
const COLS = 6;
const HEADER_H = 96;
const FILTER_H = 44;
const VIEW_H = 40;
const LABEL_H = 48;

type PreviewMode = 'raw' | 'normalized';

export class AssetGalleryScene extends Phaser.Scene {
  private category: string | 'all' = 'all';
  private previewMode: PreviewMode = 'normalized';
  private scrollY = 0;
  private maxScroll = 0;
  private contentRoot!: Phaser.GameObjects.Container;
  private headerText!: Phaser.GameObjects.Text;
  private filterButtons: Phaser.GameObjects.Text[] = [];
  private viewButtons: Phaser.GameObjects.Text[] = [];
  private report: WorldAssetValidationReport | null = null;
  private loadErrors: string[] = [];

  constructor() {
    super({ key: 'AssetGalleryScene' });
  }

  preload(): void {
    this.load.on('loaderror', (file: { key?: string; url?: string }) => {
      const msg = `${file.key ?? '?'} ← ${file.url ?? ''}`;
      this.loadErrors.push(msg);
      console.warn('[AssetGallery] loaderror', msg);
    });
    preloadWorldLibraryAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);
    this.report = validateWorldLibraryTextures(this);

    this.contentRoot = this.add.container(0, HEADER_H + FILTER_H + VIEW_H);

    this.headerText = this.add
      .text(16, 10, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e8d5a3',
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.buildFilterBar();
    this.buildViewToggle();
    this.rebuildGrid();
    this.refreshHeader();

    this.input.on('wheel', (_p: unknown, _go: unknown, _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.55, 0, this.maxScroll);
      this.contentRoot.y = HEADER_H + FILTER_H + VIEW_H - this.scrollY;
    });

    this.input.keyboard?.on('keydown-ESC', () => this.exitGallery());
    this.input.keyboard?.on('keydown-F8', () => this.exitGallery());
    this.input.keyboard?.on('keydown-N', () => this.setPreviewMode('normalized'));
    this.input.keyboard?.on('keydown-R', () => this.setPreviewMode('raw'));

    this.scale.on('resize', () => {
      this.rebuildGrid();
      this.refreshHeader();
    });
  }

  private setPreviewMode(mode: PreviewMode): void {
    if (this.previewMode === mode) return;
    this.previewMode = mode;
    this.scrollY = 0;
    this.rebuildGrid();
    this.refreshHeader();
    this.updateViewStyles();
  }

  private exitGallery(): void {
    if (this.scene.isSleeping('WorldScene') || this.scene.isPaused('WorldScene')) {
      this.scene.stop();
      this.scene.wake('WorldScene');
      return;
    }
    if (this.scene.get('WorldScene')) {
      this.scene.start('WorldScene');
      return;
    }
  }

  private buildFilterBar(): void {
    const labels = ['all', ...WORLD_LIBRARY_CATEGORIES];
    let x = 16;
    for (const lab of labels) {
      const btn = this.add
        .text(x, HEADER_H + 8, lab.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#c8902a',
          backgroundColor: '#1a222c',
          padding: { x: 8, y: 4 },
        })
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(100);

      btn.on('pointerdown', () => {
        this.category = lab as string | 'all';
        this.scrollY = 0;
        this.rebuildGrid();
        this.refreshHeader();
        this.updateFilterStyles();
      });

      this.filterButtons.push(btn);
      x += btn.width + 10;
    }
    this.updateFilterStyles();
  }

  private buildViewToggle(): void {
    const y = HEADER_H + FILTER_H + 6;
    const modes: { id: PreviewMode; label: string }[] = [
      { id: 'raw', label: 'RAW CANVAS' },
      { id: 'normalized', label: 'NORMALIZED VIEW' },
    ];
    let x = 16;
    this.add
      .text(x, y + 2, 'Preview:', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#7a8490',
      })
      .setScrollFactor(0)
      .setDepth(100);
    x += 72;

    for (const m of modes) {
      const btn = this.add
        .text(x, y, m.label, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#c8902a',
          backgroundColor: '#1a222c',
          padding: { x: 10, y: 4 },
        })
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(100);

      btn.on('pointerdown', () => this.setPreviewMode(m.id));
      this.viewButtons.push(btn);
      x += btn.width + 12;
    }
    this.updateViewStyles();
  }

  private updateFilterStyles(): void {
    for (const btn of this.filterButtons) {
      const active = btn.text.toLowerCase() === this.category;
      btn.setColor(active ? '#0c1014' : '#c8902a');
      btn.setBackgroundColor(active ? '#c8902a' : '#1a222c');
    }
  }

  private updateViewStyles(): void {
    for (const btn of this.viewButtons) {
      const id = btn.text.includes('RAW') ? 'raw' : 'normalized';
      const active = id === this.previewMode;
      btn.setColor(active ? '#0c1014' : '#c8902a');
      btn.setBackgroundColor(active ? '#c8902a' : '#1a222c');
    }
  }

  private refreshHeader(): void {
    const r = this.report;
    const failed = r?.failedMissing.length ?? 0;
    const bounds = WORLD_ASSET_VISUAL_BOUNDS;
    const lines = [
      `RugTown Asset Gallery  |  ${WORLD_LIBRARY_MANIFEST.totalAssets} assets  |  ` +
        `${r?.successfullyLoaded ?? 0} loaded  |  bounds ${bounds.validBounds}/${bounds.totalAssets}  |  ` +
        `view: ${this.previewMode.toUpperCase()}  |  filter: ${this.category}`,
      `Low occupancy (<5%): ${bounds.lowOccupancyCount}  ·  Tiny visible: ${bounds.tinyVisibleCount}  ·  ` +
        `Bounds failures: ${bounds.failedCount}  ·  Load errors: ${this.loadErrors.length}  ·  R/N toggle · ESC exit`,
    ];
    if (failed) {
      lines.push(`MISSING: ${r!.failedMissing.slice(0, 4).join(', ')}${failed > 4 ? '…' : ''}`);
    }
    this.headerText.setText(lines.join('\n'));
  }

  private contentTop(): number {
    return HEADER_H + FILTER_H + VIEW_H;
  }

  private rebuildGrid(): void {
    this.contentRoot.removeAll(true);

    const list = getAssetsByCategory(this.category);
    const viewW = this.scale.width;
    const cols = Math.max(3, Math.min(COLS, Math.floor((viewW - 32) / (CELL + CELL_PAD))));
    const startX = 24;
    const startY = 8;

    list.forEach((asset, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (CELL + CELL_PAD);
      const y = startY + row * (CELL + CELL_PAD + LABEL_H);
      this.drawCell(asset, x, y);
    });

    const rows = Math.ceil(list.length / cols) || 1;
    const contentH = rows * (CELL + CELL_PAD + LABEL_H) + 40;
    const viewH = this.scale.height - this.contentTop();
    this.maxScroll = Math.max(0, contentH - viewH);
    this.contentRoot.y = this.contentTop() - this.scrollY;
  }

  private drawCell(asset: WorldLibraryAsset, x: number, y: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x141a22, 1);
    g.fillRect(x, y, CELL, CELL);
    g.fillStyle(0x1c2430, 1);
    const chk = 12;
    for (let cy = 0; cy < CELL; cy += chk) {
      for (let cx = 0; cx < CELL; cx += chk) {
        if (((cx / chk) + (cy / chk)) % 2 === 0) {
          g.fillRect(x + cx, y + cy, chk, chk);
        }
      }
    }
    g.lineStyle(1, 0x2a3440, 1);
    g.strokeRect(x, y, CELL, CELL);
    this.contentRoot.add(g);

    const bounds = getVisualBounds(asset.key);
    const exists = this.textures.exists(asset.key);
    const maxInner = CELL - 16;

    if (exists) {
      const img = this.add.image(x + CELL / 2, y + CELL / 2, asset.key);
      if (this.previewMode === 'normalized') {
        applyNormalizedPreviewCrop(img, asset.key, maxInner, maxInner);
      } else {
        clearPreviewCrop(img);
        const sx = maxInner / Math.max(1, img.width);
        const sy = maxInner / Math.max(1, img.height);
        img.setScale(Math.min(sx, sy, 1));
        img.setOrigin(0.5, 0.5);
      }
      this.contentRoot.add(img);
    } else {
      const miss = this.add
        .text(x + CELL / 2, y + CELL / 2, 'MISSING', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ff5566',
          align: 'center',
        })
        .setOrigin(0.5);
      this.contentRoot.add(miss);
    }

    const src = `${asset.width}×${asset.height}`;
    const vis = bounds?.ok
      ? `${bounds.visibleWidth}×${bounds.visibleHeight}`
      : 'no-bounds';
    const occ = bounds ? `${(bounds.occupancyRatio * 100).toFixed(1)}%` : '—';
    const label = this.add
      .text(
        x + CELL / 2,
        y + CELL + 2,
        `${asset.filename}\nsrc ${src}  vis ${vis}\nocc ${occ}`,
        {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: exists ? '#a8b0bc' : '#ff7788',
          align: 'center',
          wordWrap: { width: CELL + 4 },
        },
      )
      .setOrigin(0.5, 0);
    this.contentRoot.add(label);
  }
}
