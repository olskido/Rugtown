import Phaser from 'phaser';

/*
  WorldScene.ts — Player Movement Edition
  ─────────────────────────────────────────
  Source of truth:
    Image 1: rugtown-city.png — fountain is at ~38% x, 58% y of the image
    Image 2: character sprites — small pixel-art degen ~32×48px, dark coat
    Image 3: gameplay — player renders ON the city, camera follows

  Changes from world-view version:
  - WASD/arrows now MOVE THE PLAYER, not the camera
  - Camera follows player with smooth lerp (Stardew Valley feel)
  - Player rendered as pixel-art character drawn with Phaser.Graphics
  - Idle bob animation, walk direction facing, shadow underfoot
  - Camera clamped to world bounds — can never show outside image
  - Drag-to-pan removed (would conflict with player movement)
  - panTo() now moves the PLAYER to that location
  - Public API preserved: panTo, setTargetZoom, getPlayerPos, teleportTo
*/

/* ─── Tuning constants ─── */
const DEFAULT_WORLD_W   = 3840;
const DEFAULT_WORLD_H   = 2160;

// Player movement — feels like Stardew Valley / Pokemon
const PLAYER_SPEED      = 200;          // px/sec at full run
const PLAYER_ACCEL_TIME = 0.12;         // seconds to reach full speed
const PLAYER_DECEL_TIME = 0.08;         // seconds to stop
const PLAYER_DIAG       = 0.7071;       // diagonal normalization

// Camera follow
const CAM_LERP          = 0.10;         // 0=instant, 1=never catches up
const CAM_DEADZONE_X    = 80;           // px of camera deadzone around player
const CAM_DEADZONE_Y    = 60;

// Zoom
const ZOOM_MIN          = 0.35;
const ZOOM_MAX          = 2.2;
const ZOOM_STEP         = 0.08;
const ZOOM_LERP         = 0.10;
const ZOOM_DEFAULT      = 1.0;          // Start zoomed in more — player is tiny

// Spawn — fountain area (~38% x, 58% y of the city image)
// These are fractions; actual coords calculated after image loads
const SPAWN_FX          = 0.38;
const SPAWN_FY          = 0.58;

// Player visual
const CHAR_W            = 22;           // logical character width (px in world)
const CHAR_H            = 34;           // logical character height
const SHADOW_W          = 18;
const SHADOW_H          = 7;

/* ─── Direction enum ─── */
type Direction = 'down' | 'up' | 'left' | 'right';

export class WorldScene extends Phaser.Scene {

  /* ── Background ── */
  private background!: Phaser.GameObjects.Image;
  private worldW = DEFAULT_WORLD_W;
  private worldH = DEFAULT_WORLD_H;
  private bgMissing = false;

  /* ── Player ── */
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Graphics;
  private playerGlow!: Phaser.GameObjects.Graphics;   // depth below player
  private playerLabel!: Phaser.GameObjects.Text;

  // Movement state
  private velX = 0;
  private velY = 0;
  private facing: Direction = 'down';
  private isMoving = false;
  private animTick = 0;                 // for walk cycle frame counter

  // World position
  private px = 0;
  private py = 0;

  /* ── Input ── */
  private keyW!:     Phaser.Input.Keyboard.Key;
  private keyA!:     Phaser.Input.Keyboard.Key;
  private keyS!:     Phaser.Input.Keyboard.Key;
  private keyD!:     Phaser.Input.Keyboard.Key;
  private keyUp!:    Phaser.Input.Keyboard.Key;
  private keyDown!:  Phaser.Input.Keyboard.Key;
  private keyLeft!:  Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyZoomIn!:  Phaser.Input.Keyboard.Key;
  private keyZoomOut!: Phaser.Input.Keyboard.Key;

  /* ── Zoom ── */
  private targetZoom  = ZOOM_DEFAULT;
  private currentZoom = ZOOM_DEFAULT;

  /* ── Misc ── */
  private tick = 0;               // ms accumulator for registry publish rate

  constructor() { super({ key: 'WorldScene' }); }

  /* ═══════════════════════════════════════════════════════════
     PRELOAD
     ═══════════════════════════════════════════════════════════ */
  preload() {
    this.load.on('loaderror', () => { this.bgMissing = true; });
    this.load.image('rugtown-city', '/assets/backgrounds/rugtown-city.png');
  }

  /* ═══════════════════════════════════════════════════════════
     CREATE
     ═══════════════════════════════════════════════════════════ */
  create() {
    const { width: vw, height: vh } = this.scale;

    /* ── Background ── */
    if (!this.bgMissing && this.textures.exists('rugtown-city')) {
      this.background = this.add.image(0, 0, 'rugtown-city')
        .setOrigin(0, 0)
        .setDepth(0);

      this.worldW = this.background.width;
      this.worldH = this.background.height;

      // If image is unusually small, scale up so there's room to pan
      if (this.worldW < 1920) {
        const s = Math.max(1920 / this.worldW, 1080 / this.worldH);
        this.background.setScale(s);
        this.worldW = Math.round(this.worldW * s);
        this.worldH = Math.round(this.worldH * s);
      }
    } else {
      this.bgMissing = true;
      this.worldW = DEFAULT_WORLD_W;
      this.worldH = DEFAULT_WORLD_H;
      this.drawFallback();
    }

    /* ── Camera bounds — player can walk to edge but camera clamps ── */
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setZoom(this.currentZoom);

    /* ── Spawn player at fountain area ── */
    this.px = this.worldW * SPAWN_FX;
    this.py = this.worldH * SPAWN_FY;

    /* ── Create player graphics layers (depth order: shadow < glow < body < label) ── */
    this.playerGlow  = this.add.graphics().setDepth(8);
    this.playerShadow = this.add.graphics().setDepth(9);
    this.playerBody  = this.add.graphics().setDepth(10);
    this.playerLabel = this.add.text(0, 0, 'YOU', {
      fontFamily: '"Cinzel", serif',
      fontSize:   '8px',
      color:      '#e8b84b',
      backgroundColor: 'rgba(4,8,12,0.85)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(11);

    // Container for camera-follow target
    this.player = this.add.container(this.px, this.py).setDepth(10);

    /* ── Camera follow the container ── */
    // We use startFollow with lerp for smooth tracking
    this.cameras.main.startFollow(
      this.player,
      true,         // round pixels
      CAM_LERP,     // lerpX
      CAM_LERP,     // lerpY
    );
    // Deadzone — camera doesn't start moving until player reaches this margin
    this.cameras.main.setDeadzone(CAM_DEADZONE_X, CAM_DEADZONE_Y);

    /* ── Input ── */
    this.setupInput();

    /* ── Scroll-wheel zoom ── */
    this.input.on('wheel', (_p: unknown, _g: unknown, _dx: number, dy: number) => {
      const dir = dy > 0 ? -1 : 1;
      this.targetZoom = Phaser.Math.Clamp(
        this.targetZoom + dir * ZOOM_STEP * 1.5,
        ZOOM_MIN, ZOOM_MAX
      );
    });

    /* ── Initial draw ── */
    this.drawPlayer();

    /* ── Publish initial state ── */
    this.registry.set('worldW',    this.worldW);
    this.registry.set('worldH',    this.worldH);
    this.registry.set('playerX',   this.px);
    this.registry.set('playerY',   this.py);
    this.registry.set('bgMissing', this.bgMissing);
    this.registry.set('zoom',      this.currentZoom);
  }

  /* ═══════════════════════════════════════════════════════════
     UPDATE — called every frame
     ═══════════════════════════════════════════════════════════ */
  update(_time: number, delta: number) {
    const dt = delta / 1000;  // seconds
    this.tick += delta;
    this.animTick += delta;

    /* ── Read input direction ── */
    const left  = this.keyA.isDown    || this.keyLeft.isDown;
    const right = this.keyD.isDown    || this.keyRight.isDown;
    const up    = this.keyW.isDown    || this.keyUp.isDown;
    const down  = this.keyS.isDown    || this.keyDown.isDown;

    // Determine target velocity
    let tvx = 0;
    let tvy = 0;
    if (left)  tvx -= PLAYER_SPEED;
    if (right) tvx += PLAYER_SPEED;
    if (up)    tvy -= PLAYER_SPEED;
    if (down)  tvy += PLAYER_SPEED;

    // Diagonal normalization
    if (tvx !== 0 && tvy !== 0) {
      tvx *= PLAYER_DIAG;
      tvy *= PLAYER_DIAG;
    }

    /* ── Smooth acceleration / deceleration ── */
    const accel = tvx !== 0 || tvy !== 0
      ? dt / PLAYER_ACCEL_TIME
      : dt / PLAYER_DECEL_TIME;

    this.velX = Phaser.Math.Linear(this.velX, tvx, Math.min(accel, 1));
    this.velY = Phaser.Math.Linear(this.velY, tvy, Math.min(accel, 1));

    /* ── Apply movement — clamp to world bounds ── */
    const newX = Phaser.Math.Clamp(
      this.px + this.velX * dt,
      CHAR_W / 2,
      this.worldW - CHAR_W / 2
    );
    const newY = Phaser.Math.Clamp(
      this.py + this.velY * dt,
      CHAR_H / 2,
      this.worldH - CHAR_H / 2
    );

    const moved = Math.abs(newX - this.px) > 0.1 || Math.abs(newY - this.py) > 0.1;
    this.px = newX;
    this.py = newY;

    /* ── Update facing direction ── */
    if (Math.abs(this.velX) > 10 || Math.abs(this.velY) > 10) {
      if (Math.abs(this.velX) >= Math.abs(this.velY)) {
        this.facing = this.velX > 0 ? 'right' : 'left';
      } else {
        this.facing = this.velY > 0 ? 'down' : 'up';
      }
    }
    this.isMoving = moved && (Math.abs(this.velX) > 8 || Math.abs(this.velY) > 8);

    /* ── Move the container (camera follows this) ── */
    this.player.setPosition(this.px, this.py);

    /* ── Redraw player every frame ── */
    this.drawPlayer();

    /* ── Zoom key input ── */
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomIn)) {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomOut)) {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    }

    /* ── Smooth zoom ── */
    if (Math.abs(this.currentZoom - this.targetZoom) > 0.001) {
      this.currentZoom = Phaser.Math.Linear(this.currentZoom, this.targetZoom, ZOOM_LERP);
      this.cameras.main.setZoom(this.currentZoom);
    }

    /* ── Publish state to React (throttled to every ~100ms) ── */
    if (this.tick > 100) {
      this.tick = 0;
      this.registry.set('playerX', this.px);
      this.registry.set('playerY', this.py);
      this.registry.set('camX',    this.cameras.main.scrollX);
      this.registry.set('camY',    this.cameras.main.scrollY);
      this.registry.set('zoom',    this.currentZoom);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DRAW PLAYER
     Pixel-art degen character matching Image 2 style.
     Drawn procedurally with Phaser.Graphics — no sprite sheet needed.
     Redrawn every frame so we can animate walk cycle cheaply.
     ═══════════════════════════════════════════════════════════ */
  private drawPlayer() {
    const cx = this.px;
    const cy = this.py;

    /* ── Walk cycle ── */
    // 8-frame walk cycle at ~8fps
    const WALK_FPS  = 8;
    const walkFrame = this.isMoving
      ? Math.floor((this.animTick / 1000) * WALK_FPS) % 8
      : 0;

    // Leg offset — alternates left/right
    const legSwing  = this.isMoving ? Math.sin((this.animTick / 1000) * WALK_FPS * Math.PI) * 4 : 0;
    // Body bob
    const bodyBob   = this.isMoving ? Math.abs(legSwing) * 0.3 : 0;

    /* ── Shadow ── */
    this.playerShadow.clear();
    this.playerShadow.fillStyle(0x000000, 0.28);
    this.playerShadow.fillEllipse(cx, cy + CHAR_H / 2 + 2, SHADOW_W, SHADOW_H);

    /* ── Glow (gold pulse below feet) ── */
    this.playerGlow.clear();
    const glowT  = (Math.sin(this.animTick / 600) + 1) / 2;  // 0-1 pulse
    const glowA  = 0.08 + glowT * 0.08;
    for (let r = 28; r > 0; r -= 5) {
      this.playerGlow.fillStyle(0xe8b84b, glowA * (1 - r / 28));
      this.playerGlow.fillCircle(cx, cy + CHAR_H / 4, r);
    }

    /* ── Character body ── */
    this.playerBody.clear();

    // Direction-dependent offsets
    const isLeft   = this.facing === 'left';
    const isRight  = this.facing === 'right';
    const isFacing = this.facing === 'down';
    const isBack   = this.facing === 'up';

    // Body Y base (adjusted for bob)
    const by = cy - bodyBob;

    // ── Legs ──
    // Two legs, left and right, swinging opposite phase
    const legColors = [0x2a2018, 0x1e1810];   // dark boots
    const lx1 = cx - 5;
    const lx2 = cx + 5;
    const legY = by + CHAR_H * 0.28;
    const legH = CHAR_H * 0.32;

    this.playerBody.fillStyle(legColors[0]);
    this.playerBody.fillRect(lx1 - 3, legY + legSwing,   6, legH);
    this.playerBody.fillStyle(legColors[1]);
    this.playerBody.fillRect(lx2 - 3, legY - legSwing,   6, legH);

    // Boot highlight
    this.playerBody.fillStyle(0x3a3020, 0.6);
    this.playerBody.fillRect(lx1 - 2, legY + legH - 3 + legSwing,  5, 3);
    this.playerBody.fillRect(lx2 - 2, legY + legH - 3 - legSwing,  5, 3);

    // ── Coat / body ──
    // Dark degen coat matching Image 2 characters
    const coatColor   = 0x1a1c20;    // dark charcoal coat
    const coatHighlite = 0x262830;   // lighter edge
    const coatDetail  = 0xc8902a;    // gold accent (collar detail)
    const bodyY  = by - CHAR_H * 0.08;
    const bodyW  = CHAR_W - 2;
    const bodyH  = CHAR_H * 0.42;

    // Coat main
    this.playerBody.fillStyle(coatColor);
    this.playerBody.fillRect(cx - bodyW / 2, bodyY, bodyW, bodyH);

    // Coat edge highlights (left and right)
    this.playerBody.fillStyle(coatHighlite, 0.5);
    this.playerBody.fillRect(cx - bodyW / 2,      bodyY + 2, 2, bodyH - 4);
    this.playerBody.fillRect(cx + bodyW / 2 - 2,  bodyY + 2, 2, bodyH - 4);

    // Gold collar accent — visible from front and sides (Image 2 gold trim)
    if (!isBack) {
      this.playerBody.fillStyle(coatDetail, 0.85);
      this.playerBody.fillRect(cx - 3, bodyY + 2, 6, 3);
    }

    // Arms
    const armColor = 0x161820;
    const armY = bodyY + 3;
    const armH = CHAR_H * 0.28;
    const armSwingL = isMoving ? legSwing * 0.5 : 0;
    const armSwingR = -armSwingL;

    // Left arm
    this.playerBody.fillStyle(armColor);
    this.playerBody.fillRect(cx - bodyW / 2 - 4, armY + armSwingL, 4, armH);
    // Right arm
    this.playerBody.fillRect(cx + bodyW / 2,      armY + armSwingR, 4, armH);

    // ── Head ──
    const headColor = isBack ? 0x1a1c20 : 0xd4a878;   // skin or hat-from-behind
    const headY  = by - CHAR_H * 0.45;
    const headW  = CHAR_W - 6;
    const headH  = CHAR_H * 0.26;

    // Head (neck + face)
    this.playerBody.fillStyle(headColor);
    this.playerBody.fillRect(cx - headW / 2, headY, headW, headH);

    // ── Hair / Hood (dark, matching Image 2 hoodie characters) ──
    const hairColor = 0x1a1820;
    // Hood/hair on top
    this.playerBody.fillStyle(hairColor);
    this.playerBody.fillRect(cx - headW / 2 - 1, headY - 4, headW + 2, 8);
    // Hood sides
    this.playerBody.fillRect(cx - headW / 2 - 2, headY,     3, headH * 0.7);
    this.playerBody.fillRect(cx + headW / 2 - 1, headY,     3, headH * 0.7);

    // ── Face details (only from front / sides) ──
    if (!isBack) {
      // Eyes (two small dots)
      this.playerBody.fillStyle(0x080808);
      const eyeY  = headY + headH * 0.35;
      const eyeOX = isLeft ? 2 : isRight ? -2 : 0;
      this.playerBody.fillRect(cx - 4 + eyeOX, eyeY, 2, 2);
      this.playerBody.fillRect(cx + 2 + eyeOX, eyeY, 2, 2);

      // Sunglasses (Image 2 has many characters with shades)
      this.playerBody.fillStyle(0x0a2030, 0.9);
      this.playerBody.fillRect(cx - 5 + eyeOX, eyeY - 1, 5, 3);
      this.playerBody.fillRect(cx + 1 + eyeOX, eyeY - 1, 5, 3);
      // Bridge
      this.playerBody.fillStyle(0x303030);
      this.playerBody.fillRect(cx - 1 + eyeOX, eyeY,     2, 2);
    }

    /* ── Label ── */
    // "YOU" label above player head
    this.playerLabel.setPosition(cx, headY - 6);
  }

  /* ═══════════════════════════════════════════════════════════
     FALLBACK BACKGROUND (when PNG is missing)
     ═══════════════════════════════════════════════════════════ */
  private drawFallback() {
    const g = this.add.graphics().setDepth(0);

    // Dark city atmosphere
    g.fillGradientStyle(0x030a0c, 0x04090e, 0x050c10, 0x030709, 1);
    g.fillRect(0, 0, this.worldW, this.worldH);

    // Warm glow pools
    for (let r = 600; r > 0; r -= 60) {
      g.fillStyle(0xc87020, 0.015 * (600 - r) / 600);
      g.fillCircle(this.worldW * 0.38, this.worldH * 0.58, r);
    }

    // Grid
    g.lineStyle(1, 0x1a2830, 0.25);
    for (let x = 0; x < this.worldW; x += 200) g.lineBetween(x, 0, x, this.worldH);
    for (let y = 0; y < this.worldH; y += 200) g.lineBetween(0, y, this.worldW, y);

    // Instruction text
    this.add.text(this.worldW / 2, this.worldH / 2 - 80,
      'Place rugtown-city.png in:', {
        fontFamily: 'Courier New', fontSize: '22px', color: '#c8902a', align: 'center',
      }
    ).setOrigin(0.5).setDepth(1);

    this.add.text(this.worldW / 2, this.worldH / 2 - 36,
      'public/assets/backgrounds/rugtown-city.png', {
        fontFamily: 'Courier New', fontSize: '16px', color: '#e8b84b', align: 'center',
        backgroundColor: '#0d1a1e', padding: { x: 14, y: 8 },
      }
    ).setOrigin(0.5).setDepth(1);

    this.add.text(this.worldW / 2, this.worldH / 2 + 16,
      'Player spawns at fountain area.\nWASD to move. Scroll to zoom.', {
        fontFamily: 'Courier New', fontSize: '14px', color: '#7a6a52',
        align: 'center', lineSpacing: 6,
      }
    ).setOrigin(0.5).setDepth(1);
  }

  /* ═══════════════════════════════════════════════════════════
     INPUT SETUP
     ═══════════════════════════════════════════════════════════ */
  private setupInput() {
    const kb = this.input.keyboard!;

    this.keyW     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyUp    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyLeft  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyZoomIn  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
    this.keyZoomOut = kb.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);

    kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD).on('down', () => {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT).on('down', () => {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — called from GamePage.tsx / RugTownGame.ts
     ═══════════════════════════════════════════════════════════ */

  /**
   * Move player to world coordinates instantly.
   * Camera snaps (used for minimap clicks that should feel responsive).
   */
  teleportTo(x: number, y: number) {
    this.px = Phaser.Math.Clamp(x, 0, this.worldW);
    this.py = Phaser.Math.Clamp(y, 0, this.worldH);
    this.player.setPosition(this.px, this.py);
    this.velX = 0;
    this.velY = 0;
    this.registry.set('playerX', this.px);
    this.registry.set('playerY', this.py);
  }

  /**
   * Smoothly move player toward world coordinates.
   * Uses Phaser tween on the container.
   */
  panTo(x: number, y: number, duration = 600) {
    const tx = Phaser.Math.Clamp(x, 0, this.worldW);
    const ty = Phaser.Math.Clamp(y, 0, this.worldH);
    this.tweens.add({
      targets:  this.player,
      x:        tx,
      y:        ty,
      duration,
      ease:     'Sine.easeInOut',
      onUpdate: () => {
        this.px = this.player.x;
        this.py = this.player.y;
      },
      onComplete: () => {
        this.px = tx;
        this.py = ty;
        this.velX = 0;
        this.velY = 0;
      },
    });
  }

  /** Set zoom target — smooth lerp applied each frame */
  setTargetZoom(z: number) {
    this.targetZoom = Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX);
  }

  /** Get player world position for minimap dot */
  getPlayerPos() {
    return { x: this.px, y: this.py };
  }

  /** Get world size after image load */
  getWorldSize() {
    return { w: this.worldW, h: this.worldH };
  }
}
