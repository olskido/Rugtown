import Phaser from 'phaser';
import { getLiveWorldObjects, toWorldPosition } from '../world/WorldObjects';
import { COLLISION_RECTS, toWorldRect } from '../world/CollisionZones';

/*
  WorldScene.ts — Player Movement + NPC Citizens Edition
  ─────────────────────────────────────────
  Source of truth:
    Image 1: rugtown-city.png — fountain is at ~38% x, 58% y of the image
    Character Bible: small pixel-art degens — dark coat/hoodie, visible head,
      gold accent details, readable silhouette at small scale
    Image 3: gameplay — player + NPCs render ON the city, camera follows player

  - WASD/arrows MOVE THE PLAYER, camera follows with smooth lerp
  - Player + NPCs rendered as pixel-art characters drawn with Phaser.Graphics,
    sharing one drawHumanoid() helper so NPCs match the player's style
  - NPCs are ambient citizens: idle/walk/pause loops anchored near landmarks,
    desynchronized per-NPC timing, occasional speech bubbles, [NPC] tag
  - Camera clamped to world bounds — can never show outside image
  - Public API preserved: panTo, setTargetZoom, getPlayerPos, teleportTo
*/

/* ─── Tuning constants ─── */
const DEFAULT_WORLD_W   = 3840;
const DEFAULT_WORLD_H   = 2160;

// Player movement — feels like Stardew Valley / Pokemon
const PLAYER_SPEED      = 280;          // px/sec at full run (was 200 — +40%, felt sluggish)
const PLAYER_ACCEL_TIME = 0.12;         // seconds to reach full speed — unchanged, keeps the ramp feel/smoothness identical
const PLAYER_DECEL_TIME = 0.08;         // seconds to stop — unchanged, keeps stops snappy (not slippery)
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
const SPAWN_FX          = 0.38;
const SPAWN_FY          = 0.58;

// Player/NPC visual footprint (world px) — unchanged so clamps stay correct
const CHAR_W            = 22;
const CHAR_H            = 34;
const SHADOW_W          = 18;
const SHADOW_H          = 7;

// Walk animation (shared by player + NPCs)
const WALK_CYCLE_SPEED   = 8;     // step frequency
const LEG_STAGGER_Y       = 3;     // alternating vertical leg offset while walking
const LEG_LIFT            = 3.5;   // how much the forward leg shortens/lifts while stepping
const BODY_BOB_WALK       = 1.8;   // torso bob amplitude while walking
const ARM_SWING_WALK      = 3.2;   // arm swing amplitude while walking

// Idle animation (shared) — always running, so characters never look frozen
const IDLE_BREATH_SPEED   = 1.7;    // breathing cycle speed
const IDLE_BREATH_SCALE   = 0.035;  // torso squash/stretch fraction while idle
const IDLE_BOB            = 0.6;    // tiny vertical bob while idle
const IDLE_SWAY           = 0.045;  // radians — gentle idle lean side to side
const IDLE_ARM_SWAY       = 0.4;    // px — barely-there arm drift while idle

// Turn smoothing — player
const LEAN_MAX            = 0.11;   // radians (~6°) max lean
const LEAN_SMOOTH         = 0.12;   // per-frame lerp factor for the lean

// Emote "pop" animation — a brief squash/stretch pulse layered on top of
// the player's existing breathing scale, doesn't touch movement at all
const EMOTE_PULSE_DURATION = 500;   // ms
const EMOTE_PULSE_AMOUNT   = 0.18;  // extra scale at the peak of the pulse

/* ─── NPC tuning ─── */
const NPC_SCALE           = 0.82;   // smaller than the player
const NPC_ALPHA           = 0.88;   // subtler than the player
const NPC_SPEED_MIN       = 46;
const NPC_SPEED_MAX       = 96;
const NPC_ACCEL_TIME      = 0.25;
const NPC_ARRIVE_DIST     = 6;      // px — close enough to call it "arrived"
const NPC_LEAN_MAX        = 0.09;
const NPC_LEAN_SMOOTH     = 0.10;
const NPC_SPEECH_MIN_GAP  = 7000;   // ms between speech attempts (min)
const NPC_SPEECH_MAX_GAP  = 16000;  // ms between speech attempts (max)
const NPC_SPEECH_DURATION = 3200;   // ms a speech bubble stays visible
const NPC_SPEECH_CHANCE   = 0.6;    // odds a given attempt actually shows a line

// Landmarks NPCs spawn around and gather near (fractions of world size)
const NPC_LANDMARKS: { name: string; fx: number; fy: number; radius: number }[] = [
  { name: 'fountain', fx: 0.38, fy: 0.58, radius: 70 },
  { name: 'market',   fx: 0.20, fy: 0.52, radius: 80 },
  { name: 'bridge',   fx: 0.55, fy: 0.46, radius: 60 },
  { name: 'road',     fx: 0.46, fy: 0.34, radius: 90 },
  { name: 'park',     fx: 0.74, fy: 0.56, radius: 90 },
];

const NPC_NAMES = [
  'JeetBot', 'PumpGoblin', 'LiquidityLarry', 'AlphaAisha', 'ChartChad',
  'BagHolderBen', 'WhaleGhost', 'RugSlayerNPC', 'MoonboyNPC', 'DumpDemon',
];

const NPC_SPEECH_LINES = [
  'GM degens',
  'Liquidity looks healthy',
  'Whale spotted near tower',
  'Trust no dev',
  'Alpha Lounge is busy',
  'Meme Market is pumping',
];

const NPC_COAT_PALETTE = [0x1a1c20, 0x202225, 0x23201a, 0x1c2024, 0x221a1c, 0x1a2024];
const NPC_SKIN_PALETTE = [0xd4a878, 0xc89868, 0xb88858, 0xe0b890];

/* ─── Interaction zones ───
   Coordinates, radii, and display names all come from the World Object
   registry (src/game/world/WorldObjects.ts) — the single source of truth
   for every landmark. This scene only turns the currently "live" subset
   of that registry into runtime trigger circles; it no longer hardcodes
   any landmark position itself. */
interface ActiveZone { id: string; name: string; wx: number; wy: number; radius: number; }

/* ─── Spawn Plaza ambience ───
   Purely cosmetic dressing around the fountain/spawn area — particles,
   tweens, and a few small Graphics props. No gameplay effect; nothing
   here is collidable or interactive. Offsets are relative to the plaza
   center (the same point the player spawns at) since the exact pixel
   layout of the background art isn't mapped out — these are tasteful,
   tunable estimates rather than precise art-matched coordinates. */
const PLAZA_RADIUS = 260;            // rough visual extent, world px

const FOUNTAIN_GLOW_COLOR  = 0x9fe8ff;
const FOUNTAIN_PULSE_MIN   = 0.16;
const FOUNTAIN_PULSE_MAX   = 0.34;

const LAMP_OFFSETS: { x: number; y: number }[] = [
  { x: -95, y: -55 },
  { x:  95, y: -55 },
  { x: -95, y:  65 },
  { x:  95, y:  65 },
];

const SIGN_OFFSETS: { x: number; y: number }[] = [
  { x: -150, y: -15 },
  { x: -165, y:  35 },
  { x:  140, y:  -5 },
];

const TREE_OFFSETS: { x: number; y: number }[] = [
  { x: -180, y: 55 },
  { x:  175, y: 40 },
];

const CANAL_OFFSET = { x: 195, y: -70, w: 90, h: 26 };

// Idle camera "breathing" — a near-imperceptible zoom wobble while the
// player stands still. Zoom controls/range are untouched; this only
// modulates the already-applied zoom by a tiny fraction.
const CAM_BREATH_SPEED  = 0.6;       // very slow cycle
const CAM_BREATH_AMOUNT = 0.004;     // ±0.4% zoom

// NPCs occasionally turn to face a nearby NPC when they pause
const NPC_FACE_RADIUS  = 70;         // px
const NPC_FACE_CHANCE  = 0.7;

// Talking to an NPC — same E key as landmarks, but landmark zones win
// if the player happens to be near both (see updateNpcProximity()).
const NPC_TALK_RADIUS = 50;          // px

/* ─── Direction enum ─── */
type Direction = 'down' | 'up' | 'left' | 'right';

/* ─── Shared humanoid pose params (player + NPC) ─── */
interface HumanoidPose {
  facing: Direction;
  bodyBob: number;
  legStagger: number;
  legLiftL: number;
  legLiftR: number;
  armSwing: number;
  rotation?: number;
  breathScale?: number;
  scale?: number;
  alpha?: number;
  coatColor?: number;
  coatHighlite?: number;
  coatShade?: number;
  goldColor?: number;
  skinColor?: number;
}

/* ─── NPC state ─── */
type NpcState = 'idle' | 'walk' | 'pause';

interface NpcData {
  name: string;
  px: number;
  py: number;
  velX: number;
  velY: number;
  facing: Direction;
  isMoving: boolean;
  speed: number;
  homeX: number;
  homeY: number;
  wanderRadius: number;
  targetX: number;
  targetY: number;
  state: NpcState;
  stateTimer: number;
  pauseMin: number;
  pauseMax: number;
  walkMin: number;
  walkMax: number;
  animTick: number;
  lean: number;
  coatColor: number;
  coatHighlite: number;
  coatShade: number;
  skinColor: number;
  speechTimerNext: number;
  speechShowUntil: number;
  shadow: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  speech: Phaser.GameObjects.Text;
}

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
  private playerSpeech!: Phaser.GameObjects.Text;
  private playerSpeechUntil = 0;
  private emotePulseUntil = 0;

  // Movement state
  private velX = 0;
  private velY = 0;
  private facing: Direction = 'down';
  private isMoving = false;
  private animTick = 0;                 // for walk cycle frame counter
  private lean = 0;                     // smoothed body lean (turn smoothing)

  // World position
  private px = 0;
  private py = 0;

  /* ── NPC citizens ── */
  private npcs: NpcData[] = [];

  /* ── Interaction zones ── */
  private zones: ActiveZone[] = [];
  private nearZoneId: string | null = null;

  /* ── NPC dialogue proximity ── */
  private nearNpcName: string | null = null;

  /* ── Reward feedback (floating text above player) ── */
  private floatingTexts: { obj: Phaser.GameObjects.Text; vy: number; life: number; maxLife: number }[] = [];

  /* ── Spawn Plaza ambience ── */
  private plazaX = 0;
  private plazaY = 0;

  /* ── Collision (player only — see requirement to leave NPCs unaffected) ── */
  private collisionRectsWorld: { x: number; y: number; w: number; h: number }[] = [];
  private collisionDebugGraphics!: Phaser.GameObjects.Graphics;
  private collisionDebugVisible = false;

  /* ── Input ── */
  private keyW!:     Phaser.Input.Keyboard.Key;
  private keyA!:     Phaser.Input.Keyboard.Key;
  private keyS!:     Phaser.Input.Keyboard.Key;
  private keyD!:     Phaser.Input.Keyboard.Key;
  private keyUp!:    Phaser.Input.Keyboard.Key;
  private keyDown!:  Phaser.Input.Keyboard.Key;
  private keyLeft!:  Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyZoomIn!:    Phaser.Input.Keyboard.Key;
  private keyZoomOut!:   Phaser.Input.Keyboard.Key;
  private keyZoomReset!: Phaser.Input.Keyboard.Key;
  private keyE!:         Phaser.Input.Keyboard.Key;
  private keyC!:         Phaser.Input.Keyboard.Key;

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

    /* ── Create player graphics layers (depth order: glow < shadow < body < label) ── */
    this.playerGlow  = this.add.graphics().setDepth(8);
    this.playerShadow = this.add.graphics().setDepth(9);
    this.playerBody  = this.add.graphics().setDepth(10);
    this.playerLabel = this.add.text(0, 0, 'You', {
      fontFamily: '"Cinzel", serif',
      fontSize:   '8px',
      color:      '#e8b84b',
      backgroundColor: 'rgba(4,8,12,0.85)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(11);

    this.playerSpeech = this.add.text(0, 0, '', {
      fontFamily: '"Cinzel", serif',
      fontSize:   '9px',
      color:      '#e8d8c0',
      backgroundColor: 'rgba(10,14,18,0.92)',
      padding: { x: 6, y: 4 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(12).setVisible(false);

    // Container for camera-follow target
    this.player = this.add.container(this.px, this.py).setDepth(10);

    /* ── Camera follow the container ── */
    this.cameras.main.startFollow(
      this.player,
      true,         // round pixels
      CAM_LERP,     // lerpX
      CAM_LERP,     // lerpY
    );
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

    /* ── NPC citizens ── */
    this.createNpcs();

    /* ── Interaction zones ── */
    this.createZones();

    /* ── Collision (player-only walkable boundaries) ── */
    this.createCollision();

    /* ── Spawn Plaza ambience ── */
    this.createPlazaAmbience();

    /* ── Initial draw ── */
    this.drawPlayer();

    /* ── Publish initial state ── */
    this.registry.set('worldW',    this.worldW);
    this.registry.set('worldH',    this.worldH);
    this.registry.set('playerX',   this.px);
    this.registry.set('playerY',   this.py);
    this.registry.set('bgMissing', this.bgMissing);
    this.registry.set('zoom',      this.currentZoom);
    this.registry.set('nearZone',  null);
    this.registry.set('nearNpc',   null);
    this.registry.set('collisionDebug', false);
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

    let tvx = 0;
    let tvy = 0;
    if (left)  tvx -= PLAYER_SPEED;
    if (right) tvx += PLAYER_SPEED;
    if (up)    tvy -= PLAYER_SPEED;
    if (down)  tvy += PLAYER_SPEED;

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

    /* ── Apply movement — clamp to world bounds, then resolve collisions.
       X and Y are resolved separately so the player slides along a
       wall/canal edge instead of stopping dead on a diagonal approach. ── */
    const rawX = Phaser.Math.Clamp(
      this.px + this.velX * dt,
      CHAR_W / 2,
      this.worldW - CHAR_W / 2
    );
    const rawY = Phaser.Math.Clamp(
      this.py + this.velY * dt,
      CHAR_H / 2,
      this.worldH - CHAR_H / 2
    );

    const newX = this.isBlockedAt(rawX, this.py) ? this.px : rawX;
    const newY = this.isBlockedAt(newX, rawY) ? this.py : rawY;

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

    /* ── Turn smoothing — subtle body lean into horizontal motion ── */
    const leanTarget = Phaser.Math.Clamp(this.velX / PLAYER_SPEED, -1, 1) * LEAN_MAX;
    this.lean = Phaser.Math.Linear(this.lean, leanTarget, LEAN_SMOOTH);

    /* ── Move the container (camera follows this) ── */
    this.player.setPosition(this.px, this.py);

    /* ── Redraw player every frame ── */
    this.drawPlayer();

    /* ── NPC citizens ── */
    this.updateNpcs(delta);

    /* ── Interaction zones ── */
    this.updateZoneProximity();

    /* ── NPC dialogue proximity ── */
    this.updateNpcProximity();

    /* ── Reward feedback (floating text) ── */
    this.updateFloatingTexts(delta);

    /* ── Chat speech bubble countdown ── */
    if (this.playerSpeechUntil > 0) {
      this.playerSpeechUntil -= delta;
      if (this.playerSpeechUntil <= 0) {
        this.playerSpeech.setVisible(false);
      }
    }

    /* ── Emote pulse countdown ── */
    if (this.emotePulseUntil > 0) {
      this.emotePulseUntil -= delta;
      if (this.emotePulseUntil < 0) this.emotePulseUntil = 0;
    }

    /* ── Zoom key input ── */
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomIn)) {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomOut)) {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomReset)) {
      this.targetZoom = ZOOM_DEFAULT;
    }

    /* ── Debug: C toggles the collision-zone overlay ── */
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this.setCollisionDebug(!this.collisionDebugVisible);
    }

    /* ── Smooth zoom ── */
    if (Math.abs(this.currentZoom - this.targetZoom) > 0.001) {
      this.currentZoom = Phaser.Math.Linear(this.currentZoom, this.targetZoom, ZOOM_LERP);
    }

    /* ── Idle camera breathing — very subtle, only while standing still.
       Purely cosmetic: a tiny modulation on top of the existing zoom
       value. Zoom range/controls are unaffected. ── */
    const breathFactor = this.isMoving
      ? 1
      : 1 + Math.sin((this.animTick / 1000) * CAM_BREATH_SPEED) * CAM_BREATH_AMOUNT;
    this.cameras.main.setZoom(this.currentZoom * breathFactor);

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
     ═══════════════════════════════════════════════════════════ */
  private drawPlayer() {
    const t = this.animTick / 1000;   // seconds

    const breathPhase = t * IDLE_BREATH_SPEED;
    const breathe      = Math.sin(breathPhase);
    const idleBob       = Math.abs(breathe) * IDLE_BOB;
    const idleSway       = Math.sin(breathPhase * 0.55) * IDLE_SWAY;
    const breathScale     = this.isMoving ? 1 : 1 + breathe * IDLE_BREATH_SCALE;

    const walkPhase = t * WALK_CYCLE_SPEED * Math.PI;
    const stepL      = Math.sin(walkPhase);
    const stepR       = -stepL;
    const legLiftL      = this.isMoving ? Math.max(0, stepL) * LEG_LIFT : 0;
    const legLiftR       = this.isMoving ? Math.max(0, stepR) * LEG_LIFT : 0;
    const legStagger        = this.isMoving ? stepL * LEG_STAGGER_Y : 0;
    const walkBob             = this.isMoving ? Math.abs(stepL) * BODY_BOB_WALK : 0;
    const armSwing              = this.isMoving
      ? stepL * ARM_SWING_WALK
      : Math.sin(breathPhase * 0.55) * IDLE_ARM_SWAY;

    const bodyBob = this.isMoving ? walkBob : idleBob;
    const sway    = this.isMoving ? 0 : idleSway;

    /* ── Emote pulse — a quick squash/stretch "pop", independent of movement ── */
    const emoteProgress = this.emotePulseUntil / EMOTE_PULSE_DURATION;
    const emotePulse = emoteProgress > 0 ? 1 + Math.sin(emoteProgress * Math.PI) * EMOTE_PULSE_AMOUNT : 1;

    /* ── Shadow — stays flat on the ground, shrinks a touch when "lifted" ── */
    this.playerShadow.clear();
    this.playerShadow.fillStyle(0x000000, 0.28);
    this.playerShadow.fillEllipse(0, CHAR_H / 2 + 2, SHADOW_W * (1 - bodyBob * 0.05), SHADOW_H);
    this.playerShadow.setPosition(this.px, this.py);

    /* ── Glow (gold pulse below feet) — player only, marks the main character ── */
    this.playerGlow.clear();
    const glowT = (Math.sin(this.animTick / 600) + 1) / 2;
    const glowA = 0.08 + glowT * 0.08;
    for (let r = 28; r > 0; r -= 5) {
      this.playerGlow.fillStyle(0xe8b84b, glowA * (1 - r / 28));
      this.playerGlow.fillCircle(0, CHAR_H / 4, r);
    }
    this.playerGlow.setPosition(this.px, this.py);

    /* ── Body — shared humanoid renderer ── */
    this.drawHumanoid(this.playerBody, this.px, this.py, {
      facing: this.facing,
      bodyBob,
      legStagger,
      legLiftL,
      legLiftR,
      armSwing,
      rotation: this.lean + sway,
      breathScale: breathScale * emotePulse,
    });

    /* ── Label / speech bubble — stay upright regardless of body lean ── */
    const headYLocal = -bodyBob - CHAR_H * 0.45;
    this.playerLabel.setPosition(this.px, this.py + headYLocal - 6);
    this.playerSpeech.setPosition(this.px, this.py + headYLocal - 18);
  }

  /* ═══════════════════════════════════════════════════════════
     DRAW HUMANOID — shared pixel-art degen renderer.
     Used by both the player and NPCs so NPCs visually match the
     player's style. Shapes are drawn relative to a local origin
     (0,0) at the character's center; the Graphics object itself is
     then positioned/rotated/scaled, so lean and breathing pivot
     naturally and `scale`/`alpha` can shrink + soften NPCs.
     ═══════════════════════════════════════════════════════════ */
  private drawHumanoid(g: Phaser.GameObjects.Graphics, x: number, y: number, p: HumanoidPose) {
    const scale       = p.scale ?? 1;
    const breathScale = p.breathScale ?? 1;
    const alpha       = p.alpha ?? 1;
    const coatColor    = p.coatColor    ?? 0x1a1c20;
    const coatHighlite = p.coatHighlite ?? 0x2c2e36;
    const coatShade    = p.coatShade    ?? 0x101216;
    const coatDetail   = p.goldColor    ?? 0xe8b84b;
    const skinColor    = p.skinColor    ?? 0xd4a878;

    const isLeft  = p.facing === 'left';
    const isRight = p.facing === 'right';
    const isBack  = p.facing === 'up';

    const by = -p.bodyBob;   // local vertical offset for bob (up = negative)

    g.clear();

    // ── Legs ──
    const legColors = [0x2a2018, 0x1e1810];
    const lx1  = -5;
    const lx2  = 5;
    const legY = by + CHAR_H * 0.28;
    const legH = CHAR_H * 0.32;
    const legH1 = legH - p.legLiftL;
    const legH2 = legH - p.legLiftR;

    g.fillStyle(legColors[0]);
    g.fillRoundedRect(lx1 - 3, legY + p.legStagger, 6, legH1, 1.5);
    g.fillStyle(legColors[1]);
    g.fillRoundedRect(lx2 - 3, legY - p.legStagger, 6, legH2, 1.5);

    g.fillStyle(0x3a3020, 0.6);
    g.fillRect(lx1 - 2, legY + legH1 - 3 + p.legStagger, 5, 3);
    g.fillRect(lx2 - 2, legY + legH2 - 3 - p.legStagger, 5, 3);

    // ── Coat / hoodie ──
    const bodyY = by - CHAR_H * 0.08;
    const bodyW = CHAR_W - 2;
    const bodyH = CHAR_H * 0.42;

    g.fillStyle(0x05060a, 0.5);
    g.fillRoundedRect(-bodyW / 2 - 1, bodyY - 1, bodyW + 2, bodyH + 2, 4);

    g.fillStyle(coatColor);
    g.fillRoundedRect(-bodyW / 2, bodyY, bodyW, bodyH, 3);

    g.fillStyle(coatShade, 0.5);
    g.fillRect(bodyW / 2 - 3, bodyY + 2, 3, bodyH - 4);
    g.fillStyle(coatHighlite, 0.55);
    g.fillRect(-bodyW / 2,     bodyY + 2, 2, bodyH - 4);

    if (!isBack) {
      g.fillStyle(coatDetail, 0.9);
      g.fillRect(-3, bodyY + 2, 6, 3);
      g.fillRect(-1, bodyY + bodyH * 0.35, 2, bodyH * 0.5);
    }

    // ── Arms ──
    const armColor = 0x161820;
    const armY = bodyY + 3;
    const armH = CHAR_H * 0.28;

    g.fillStyle(armColor);
    g.fillRoundedRect(-bodyW / 2 - 4, armY + p.armSwing,  4, armH, 1.5);
    g.fillRoundedRect( bodyW / 2,     armY - p.armSwing,  4, armH, 1.5);

    // ── Head ──
    const headColor = isBack ? 0x1a1c20 : skinColor;
    const headY  = by - CHAR_H * 0.45;
    const headW  = CHAR_W - 6;
    const headH  = CHAR_H * 0.26;
    const lookOX = isLeft ? -1.5 : isRight ? 1.5 : 0;

    g.fillStyle(0x05060a, 0.5);
    g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY - 5, headW + 4, headH + 9, 4);

    g.fillStyle(headColor);
    g.fillRoundedRect(-headW / 2 + lookOX, headY, headW, headH, 3);

    // ── Hood ──
    const hairColor = 0x1a1820;
    g.fillStyle(hairColor);
    g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 4, headW + 2, 8, 3);
    g.fillRect(-headW / 2 - 2 + lookOX, headY,     3, headH * 0.7);
    g.fillRect( headW / 2 - 1 + lookOX, headY,     3, headH * 0.7);

    // Gold drawstring tips
    g.fillStyle(coatDetail, 0.85);
    g.fillRect(-headW / 2 - 1 + lookOX, headY + headH * 0.65, 2, 2);
    g.fillRect( headW / 2 - 1 + lookOX, headY + headH * 0.65, 2, 2);

    // ── Face details (only from front / sides) ──
    if (!isBack) {
      const eyeY  = headY + headH * 0.35;
      const eyeOX = lookOX * 1.6;

      g.fillStyle(0x080808);
      g.fillRect(-4 + eyeOX, eyeY, 2, 2);
      g.fillRect( 2 + eyeOX, eyeY, 2, 2);

      g.fillStyle(0x0a2030, 0.9);
      g.fillRect(-5 + eyeOX, eyeY - 1, 5, 3);
      g.fillRect( 1 + eyeOX, eyeY - 1, 5, 3);
      g.fillStyle(0x303030);
      g.fillRect(-1 + eyeOX, eyeY,     2, 2);
    }

    g.setPosition(x, y);
    g.setRotation(p.rotation ?? 0);
    g.setScale(scale, scale * breathScale);
    g.setAlpha(alpha);
  }

  /* ═══════════════════════════════════════════════════════════
     NPC CITIZENS
     Ambient population — not real players. Each NPC is anchored to
     a landmark and wanders within a radius of it (idle ⇄ walk ⇄
     pause), with per-NPC speed/timing so nothing is synchronized.
     ═══════════════════════════════════════════════════════════ */
  private createNpcs() {
    NPC_NAMES.forEach((name, i) => {
      const landmark = NPC_LANDMARKS[i % NPC_LANDMARKS.length];
      const homeX = Phaser.Math.Clamp(this.worldW * landmark.fx + Phaser.Math.Between(-20, 20), CHAR_W, this.worldW - CHAR_W);
      const homeY = Phaser.Math.Clamp(this.worldH * landmark.fy + Phaser.Math.Between(-20, 20), CHAR_H, this.worldH - CHAR_H);

      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist  = Math.random() * landmark.radius * 0.6;
      const px = Phaser.Math.Clamp(homeX + Math.cos(spawnAngle) * spawnDist, CHAR_W, this.worldW - CHAR_W);
      const py = Phaser.Math.Clamp(homeY + Math.sin(spawnAngle) * spawnDist, CHAR_H, this.worldH - CHAR_H);

      const shadow = this.add.graphics().setDepth(6);
      const body   = this.add.graphics().setDepth(7);
      const label  = this.add.text(0, 0, `${name} [NPC]`, {
        fontFamily: '"Cinzel", serif',
        fontSize:   '7px',
        color:      '#8a9aa0',
        backgroundColor: 'rgba(4,8,12,0.78)',
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5, 1).setDepth(7.2);

      const speech = this.add.text(0, 0, '', {
        fontFamily: '"Cinzel", serif',
        fontSize:   '8px',
        color:      '#e8d8c0',
        backgroundColor: 'rgba(10,14,18,0.92)',
        padding: { x: 5, y: 3 },
        align: 'center',
      }).setOrigin(0.5, 1).setDepth(7.4).setVisible(false);

      this.npcs.push({
        name,
        px, py,
        velX: 0, velY: 0,
        facing: 'down',
        isMoving: false,
        speed: Phaser.Math.FloatBetween(NPC_SPEED_MIN, NPC_SPEED_MAX),
        homeX, homeY,
        wanderRadius: landmark.radius * Phaser.Math.FloatBetween(0.7, 1.15),
        targetX: px, targetY: py,
        state: 'idle',
        stateTimer: Phaser.Math.Between(200, 2000),          // stagger first decisions
        pauseMin: Phaser.Math.Between(900, 1800),
        pauseMax: Phaser.Math.Between(2200, 4500),
        walkMin: Phaser.Math.Between(900, 1600),
        walkMax: Phaser.Math.Between(1800, 3200),
        animTick: Phaser.Math.Between(0, 4000),               // random phase offset
        lean: 0,
        coatColor: Phaser.Utils.Array.GetRandom(NPC_COAT_PALETTE),
        coatHighlite: 0x2c2e36,
        coatShade: 0x101216,
        skinColor: Phaser.Utils.Array.GetRandom(NPC_SKIN_PALETTE),
        speechTimerNext: Phaser.Math.Between(NPC_SPEECH_MIN_GAP, NPC_SPEECH_MAX_GAP),
        speechShowUntil: 0,
        shadow, body, label, speech,
      });
    });
  }

  private updateNpcs(delta: number) {
    const dt = delta / 1000;

    for (const n of this.npcs) {
      n.animTick += delta;
      n.stateTimer -= delta;

      /* ── State machine: idle/pause → walk → idle/pause → ... ── */
      if (n.state === 'walk') {
        const dx = n.targetX - n.px;
        const dy = n.targetY - n.py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < NPC_ARRIVE_DIST || n.stateTimer <= 0) {
          n.state = 'pause';
          n.stateTimer = Phaser.Math.Between(n.pauseMin, n.pauseMax);
          // Ambience only — sometimes turn to face whoever's nearby before idling
          if (Math.random() < NPC_FACE_CHANCE) this.faceNearbyNpc(n);
        } else {
          const accel = Math.min(dt / NPC_ACCEL_TIME, 1);
          n.velX = Phaser.Math.Linear(n.velX, (dx / dist) * n.speed, accel);
          n.velY = Phaser.Math.Linear(n.velY, (dy / dist) * n.speed, accel);
        }
      } else {
        const accel = Math.min(dt / NPC_ACCEL_TIME, 1);
        n.velX = Phaser.Math.Linear(n.velX, 0, accel);
        n.velY = Phaser.Math.Linear(n.velY, 0, accel);

        if (n.stateTimer <= 0) {
          // Pick a new wander target near home — keeps the NPC gathered near its landmark
          const angle = Math.random() * Math.PI * 2;
          const dist  = Math.random() * n.wanderRadius;
          n.targetX = Phaser.Math.Clamp(n.homeX + Math.cos(angle) * dist, CHAR_W, this.worldW - CHAR_W);
          n.targetY = Phaser.Math.Clamp(n.homeY + Math.sin(angle) * dist, CHAR_H, this.worldH - CHAR_H);
          n.state = 'walk';
          n.stateTimer = Phaser.Math.Between(n.walkMin, n.walkMax);
        }
      }

      /* ── Apply movement — clamp to world bounds ── */
      const newX = Phaser.Math.Clamp(n.px + n.velX * dt, CHAR_W / 2, this.worldW - CHAR_W / 2);
      const newY = Phaser.Math.Clamp(n.py + n.velY * dt, CHAR_H / 2, this.worldH - CHAR_H / 2);
      const moved = Math.abs(newX - n.px) > 0.1 || Math.abs(newY - n.py) > 0.1;
      n.px = newX;
      n.py = newY;

      if (Math.abs(n.velX) > 6 || Math.abs(n.velY) > 6) {
        if (Math.abs(n.velX) >= Math.abs(n.velY)) {
          n.facing = n.velX > 0 ? 'right' : 'left';
        } else {
          n.facing = n.velY > 0 ? 'down' : 'up';
        }
      }
      n.isMoving = moved && (Math.abs(n.velX) > 4 || Math.abs(n.velY) > 4);

      const leanTarget = Phaser.Math.Clamp(n.velX / n.speed, -1, 1) * NPC_LEAN_MAX;
      n.lean = Phaser.Math.Linear(n.lean, leanTarget, NPC_LEAN_SMOOTH);

      /* ── Speech bubbles — occasional, desynchronized per NPC ── */
      if (n.speechShowUntil > 0) {
        n.speechShowUntil -= delta;
        if (n.speechShowUntil <= 0) {
          n.speech.setVisible(false);
        }
      } else {
        n.speechTimerNext -= delta;
        if (n.speechTimerNext <= 0) {
          n.speechTimerNext = Phaser.Math.Between(NPC_SPEECH_MIN_GAP, NPC_SPEECH_MAX_GAP);
          if (Math.random() < NPC_SPEECH_CHANCE) {
            const line = Phaser.Utils.Array.GetRandom(NPC_SPEECH_LINES);
            n.speech.setText(line);
            n.speech.setVisible(true);
            n.speechShowUntil = NPC_SPEECH_DURATION;
            // Same line also appears in the city chat panel
            this.events.emit('npc-chat', { name: n.name, text: line });
          }
        }
      }

      this.drawNpc(n);
    }
  }

  private drawNpc(n: NpcData) {
    const t = n.animTick / 1000;

    const breathPhase = t * IDLE_BREATH_SPEED;
    const breathe      = Math.sin(breathPhase);
    const idleBob       = Math.abs(breathe) * IDLE_BOB;
    const idleSway       = Math.sin(breathPhase * 0.55) * IDLE_SWAY;
    const breathScale     = n.isMoving ? 1 : 1 + breathe * IDLE_BREATH_SCALE;

    const walkPhase = t * WALK_CYCLE_SPEED * Math.PI;
    const stepL      = Math.sin(walkPhase);
    const stepR       = -stepL;
    const legLiftL      = n.isMoving ? Math.max(0, stepL) * LEG_LIFT : 0;
    const legLiftR       = n.isMoving ? Math.max(0, stepR) * LEG_LIFT : 0;
    const legStagger        = n.isMoving ? stepL * LEG_STAGGER_Y : 0;
    const walkBob             = n.isMoving ? Math.abs(stepL) * BODY_BOB_WALK : 0;
    const armSwing              = n.isMoving
      ? stepL * ARM_SWING_WALK
      : Math.sin(breathPhase * 0.55) * IDLE_ARM_SWAY;

    const bodyBob = n.isMoving ? walkBob : idleBob;
    const sway    = n.isMoving ? 0 : idleSway;

    n.shadow.clear();
    n.shadow.fillStyle(0x000000, 0.24);
    n.shadow.fillEllipse(0, CHAR_H / 2 + 2, SHADOW_W * NPC_SCALE * (1 - bodyBob * 0.05), SHADOW_H * NPC_SCALE);
    n.shadow.setPosition(n.px, n.py);

    this.drawHumanoid(n.body, n.px, n.py, {
      facing: n.facing,
      bodyBob,
      legStagger,
      legLiftL,
      legLiftR,
      armSwing,
      rotation: n.lean + sway,
      breathScale,
      scale: NPC_SCALE,
      alpha: NPC_ALPHA,
      coatColor: n.coatColor,
      coatHighlite: n.coatHighlite,
      coatShade: n.coatShade,
      skinColor: n.skinColor,
    });

    const headYLocal = -bodyBob - CHAR_H * 0.45;
    const labelY = n.py + headYLocal * NPC_SCALE - 5;
    n.label.setPosition(n.px, labelY);
    n.speech.setPosition(n.px, labelY - 12);
  }

  /**
   * Ambience only — turns `n` to face the nearest other NPC within
   * NPC_FACE_RADIUS, if any. Doesn't move anyone or change timing.
   */
  private faceNearbyNpc(n: NpcData) {
    let nearest: NpcData | null = null;
    let nearestDist = NPC_FACE_RADIUS;

    for (const other of this.npcs) {
      if (other === n) continue;
      const dx = other.px - n.px;
      const dy = other.py - n.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = other;
        nearestDist = dist;
      }
    }

    if (!nearest) return;

    const dx = nearest.px - n.px;
    const dy = nearest.py - n.py;
    if (Math.abs(dx) >= Math.abs(dy)) {
      n.facing = dx > 0 ? 'right' : 'left';
    } else {
      n.facing = dy > 0 ? 'down' : 'up';
    }
  }

  /* ═══════════════════════════════════════════════════════════
     INTERACTION ZONES
     Invisible trigger circles around landmarks. When the player is
     inside one, we publish it to the registry so the React HUD can
     show a "Press E to interact" prompt; pressing E emits a scene
     event so the HUD can open the matching modal. Nothing is drawn
     in the world — the zones are not visible.
     ═══════════════════════════════════════════════════════════ */
  private createZones() {
    this.zones = getLiveWorldObjects().map(o => {
      const { wx, wy } = toWorldPosition(o, this.worldW, this.worldH);
      return {
        id:     o.id,
        name:   o.displayName,
        wx,
        wy,
        radius: o.interactionRadius,
      };
    });
  }

  private updateZoneProximity() {
    let nearest: ActiveZone | null = null;
    let nearestDist = Infinity;

    for (const z of this.zones) {
      const dx = this.px - z.wx;
      const dy = this.py - z.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= z.radius && dist < nearestDist) {
        nearest = z;
        nearestDist = dist;
      }
    }

    const nearestId = nearest?.id ?? null;
    if (nearestId !== this.nearZoneId) {
      this.nearZoneId = nearestId;
      this.registry.set('nearZone', nearest ? { id: nearest.id, name: nearest.name } : null);
    }

    if (nearest && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.events.emit('zone-interact', { id: nearest.id, name: nearest.name });
    }
  }

  /**
   * Same E-key proximity pattern as updateZoneProximity(), but for talking
   * to NPCs. Landmark zones take priority — if one is active this frame,
   * we clear/skip NPC proximity entirely rather than racing both prompts.
   */
  private updateNpcProximity() {
    if (this.nearZoneId) {
      if (this.nearNpcName !== null) {
        this.nearNpcName = null;
        this.registry.set('nearNpc', null);
      }
      return;
    }

    let nearest: NpcData | null = null;
    let nearestDist = NPC_TALK_RADIUS;

    for (const n of this.npcs) {
      const dx = this.px - n.px;
      const dy = this.py - n.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = n;
        nearestDist = dist;
      }
    }

    const nearestName = nearest?.name ?? null;
    if (nearestName !== this.nearNpcName) {
      this.nearNpcName = nearestName;
      this.registry.set('nearNpc', nearest ? { name: nearest.name } : null);
    }

    if (nearest && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.events.emit('npc-interact', { name: nearest.name });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     COLLISION
     Player-only walkable boundaries — buildings and water canals are
     blocked, everything else (roads, plaza, bridges, open ground) is
     walkable by default. Geometry comes entirely from CollisionZones.ts
     (src/game/world/CollisionZones.ts); nothing is hardcoded here.
     NPCs are intentionally unaffected — updateNpcs() never calls
     isBlockedAt(), per this task's scope.
     ═══════════════════════════════════════════════════════════ */
  private createCollision() {
    this.collisionRectsWorld = COLLISION_RECTS.map(r => toWorldRect(r, this.worldW, this.worldH));

    this.collisionDebugGraphics = this.add.graphics().setDepth(50).setVisible(false);
    for (const r of this.collisionRectsWorld) {
      this.collisionDebugGraphics.fillStyle(0xff2222, 0.32);
      this.collisionDebugGraphics.fillRect(r.x, r.y, r.w, r.h);
      this.collisionDebugGraphics.lineStyle(1, 0xff2222, 0.8);
      this.collisionDebugGraphics.strokeRect(r.x, r.y, r.w, r.h);
    }
  }

  /** True if a CHAR_W×CHAR_H box centered at (x,y) overlaps any collision rect. */
  private isBlockedAt(x: number, y: number): boolean {
    const left   = x - CHAR_W / 2;
    const right  = x + CHAR_W / 2;
    const top    = y - CHAR_H / 2;
    const bottom = y + CHAR_H / 2;

    for (const r of this.collisionRectsWorld) {
      if (left < r.x + r.w && right > r.x && top < r.y + r.h && bottom > r.y) {
        return true;
      }
    }
    return false;
  }

  /** Single place that actually flips the debug overlay — used by both
   *  the C key and the Settings panel's toggle, so they stay in sync. */
  private setCollisionDebug(visible: boolean) {
    this.collisionDebugVisible = visible;
    this.collisionDebugGraphics.setVisible(visible);
    this.registry.set('collisionDebug', visible);
  }

  /* ═══════════════════════════════════════════════════════════
     REWARD FEEDBACK
     World-space floating text (e.g. "+5 REP") plus a brief camera
     flash, used for reward claims. Does not touch player/NPC motion,
     zoom, or world bounds — purely an additive visual effect layered
     above the existing player rendering.
     ═══════════════════════════════════════════════════════════ */
  private spawnFloatingText(text: string, color = '#e8b84b') {
    const obj = this.add.text(this.px, this.py - CHAR_H * 0.9, text, {
      fontFamily: '"Cinzel", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(20);

    this.floatingTexts.push({ obj, vy: -26, life: 1100, maxLife: 1100 });
  }

  private updateFloatingTexts(delta: number) {
    const dt = delta / 1000;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= delta;
      ft.obj.y += ft.vy * dt;
      ft.obj.setAlpha(Math.max(0, ft.life / ft.maxLife));
      if (ft.life <= 0) {
        ft.obj.destroy();
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  /**
   * Plays a reward claim effect: floating text above the player's head
   * plus a brief, subtle gold camera flash. Called by the HUD when a
   * reward (e.g. the fountain's daily REP) is claimed.
   */
  playRewardEffect(text = '+5 REP') {
    this.spawnFloatingText(text);
    this.cameras.main.flash(320, 232, 184, 75);
  }

  /**
   * Shows a small speech bubble above the player's head for `duration` ms.
   * Used by the chat panel — sending a message echoes it here.
   */
  showPlayerSpeech(text: string, duration = 3000) {
    this.playerSpeech.setText(text);
    this.playerSpeech.setVisible(true);
    this.playerSpeechUntil = duration;
  }

  /**
   * Brief squash/stretch "pop" on the player sprite — used by emotes as
   * their local animation. Purely cosmetic; doesn't touch movement.
   */
  playEmoteAnimation() {
    this.emotePulseUntil = EMOTE_PULSE_DURATION;
  }

  /**
   * Shows `text` in a random NPC's existing speech bubble (same fields
   * the NPC's own ambient chatter already uses). Used by simulated city
   * events that want to surface "from" a citizen — doesn't touch NPC
   * movement/behavior, just borrows the bubble for a moment.
   */
  showNpcEventSpeech(text: string) {
    if (this.npcs.length === 0) return;
    const n = Phaser.Utils.Array.GetRandom(this.npcs);
    n.speech.setText(text);
    n.speech.setVisible(true);
    n.speechShowUntil = NPC_SPEECH_DURATION;
  }

  /* ═══════════════════════════════════════════════════════════
     SPAWN PLAZA AMBIENCE
     Purely decorative — particles, tweens, and a few static-looking
     props layered around the fountain/spawn point. Everything here
     is self-driving (Phaser's tween/particle/time systems tick it),
     so nothing needs to be called from update() except the camera
     breathing line above and the NPC face-check already wired into
     updateNpcs(). No collision, no interaction, no gameplay effect.
     ═══════════════════════════════════════════════════════════ */
  private createPlazaAmbience() {
    this.plazaX = this.worldW * SPAWN_FX;
    this.plazaY = this.worldH * SPAWN_FY;

    this.createFountainAmbience();
    this.createLampAmbience();
    this.createDustAndPollen();
    this.createLeafAmbience();
    this.createMarketSigns();
    this.createCanalShimmer();
    this.scheduleNextBird();
  }

  /** Fountain: a breathing glow plus tiny drifting specks for shimmer/reflections. */
  private createFountainAmbience() {
    const { plazaX: x, plazaY: y } = this;

    const glow = this.add.graphics().setDepth(2).setPosition(x, y);
    for (let r = 34; r > 0; r -= 6) {
      glow.fillStyle(FOUNTAIN_GLOW_COLOR, 0.05 * (1 - r / 34));
      glow.fillCircle(0, 0, r);
    }
    glow.setAlpha(FOUNTAIN_PULSE_MIN);
    this.tweens.add({
      targets: glow,
      alpha: FOUNTAIN_PULSE_MAX,
      scale: 1.12,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add.particles(x, y, '__WHITE', {
      x: { min: -26, max: 26 },
      y: { min: -14, max: 14 },
      lifespan: { min: 900, max: 1600 },
      speedX: { min: -6, max: 6 },
      speedY: { min: -4, max: 4 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: [ 0xbfe9ff, 0xffffff, 0x8fd8f0 ],
      frequency: 90,
      quantity: 1,
      blendMode: 'ADD',
    }).setDepth(3);
  }

  /** Lamps: a handful of warm glows, each flickering independently. */
  private createLampAmbience() {
    for (const off of LAMP_OFFSETS) {
      const glow = this.add.graphics()
        .setDepth(2)
        .setPosition(this.plazaX + off.x, this.plazaY + off.y);

      for (let r = 22; r > 0; r -= 4) {
        glow.fillStyle(0xe8b84b, 0.10 * (1 - r / 22));
        glow.fillCircle(0, 0, r);
      }
      glow.setAlpha(0.7);

      const flicker = () => {
        this.tweens.add({
          targets: glow,
          alpha: Phaser.Math.FloatBetween(0.45, 0.9),
          scale: Phaser.Math.FloatBetween(0.92, 1.08),
          duration: Phaser.Math.Between(180, 520),
          ease: 'Sine.easeInOut',
          onComplete: flicker,
        });
      };
      flicker();
    }
  }

  /** Environment: faint drifting dust and warm pollen across the plaza. */
  private createDustAndPollen() {
    const x = this.plazaX;
    const y = this.plazaY;
    const halfW = PLAZA_RADIUS;
    const halfH = PLAZA_RADIUS * 0.6;

    this.add.particles(0, 0, '__WHITE', {
      x: { min: x - halfW, max: x + halfW },
      y: { min: y - halfH, max: y + halfH },
      lifespan: { min: 6000, max: 11000 },
      speedX: { min: -4, max: 4 },
      speedY: { min: -6, max: -1 },
      scale: { min: 0.5, max: 1.1 },
      alpha: { start: 0.22, end: 0 },
      tint: 0xc8b89a,
      frequency: 700,
      quantity: 1,
    }).setDepth(2);

    this.add.particles(0, 0, '__WHITE', {
      x: { min: x - halfW * 0.8, max: x + halfW * 0.8 },
      y: { min: y - halfH, max: y + halfH },
      lifespan: { min: 5000, max: 9000 },
      speedX: { min: -8, max: 8 },
      speedY: { min: -10, max: -3 },
      scale: { min: 0.7, max: 1.3 },
      alpha: { start: 0.3, end: 0 },
      tint: [ 0xe8d8a0, 0xf0e0b0 ],
      frequency: 900,
      quantity: 1,
      blendMode: 'ADD',
    }).setDepth(2);
  }

  /** Trees: slow tiny falling/drifting leaves near a couple of canopy spots. */
  private createLeafAmbience() {
    for (const off of TREE_OFFSETS) {
      const tx = this.plazaX + off.x;
      const ty = this.plazaY + off.y;

      this.add.particles(0, 0, '__WHITE', {
        x: { min: tx - 22, max: tx + 22 },
        y: { min: ty - 30, max: ty - 10 },
        lifespan: { min: 3200, max: 5200 },
        speedX: { min: -6, max: 6 },
        speedY: { min: 10, max: 22 },
        rotate: { min: 0, max: 360 },
        scale: { min: 0.55, max: 1 },
        alpha: { start: 0.55, end: 0 },
        tint: [ 0x6a8a3a, 0x8aa84a, 0xb08a3a ],
        frequency: 1100,
        quantity: 1,
      }).setDepth(3);
    }
  }

  /** Marketplace: a few small signs hanging and swaying from a hook point. */
  private createMarketSigns() {
    for (const off of SIGN_OFFSETS) {
      const sign = this.add.graphics()
        .setDepth(4)
        .setPosition(this.plazaX + off.x, this.plazaY + off.y);

      sign.fillStyle(0x2a1c10, 0.85);
      sign.fillRect(-9, 0, 18, 12);
      sign.lineStyle(1, 0xc8902a, 0.6);
      sign.strokeRect(-9, 0, 18, 12);
      sign.lineStyle(1, 0x6a4c14, 0.8);
      sign.lineBetween(0, -6, 0, 0);

      const swayAmt = Phaser.Math.FloatBetween(3, 5);
      sign.angle = -swayAmt;
      this.tweens.add({
        targets: sign,
        angle: swayAmt,
        duration: Phaser.Math.Between(2200, 3200),
        delay: Phaser.Math.Between(0, 800),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** Water canals: a very faint shimmer strip near the plaza's edge. */
  private createCanalShimmer() {
    const cx = this.plazaX + CANAL_OFFSET.x;
    const cy = this.plazaY + CANAL_OFFSET.y;

    this.add.particles(0, 0, '__WHITE', {
      x: { min: cx - CANAL_OFFSET.w / 2, max: cx + CANAL_OFFSET.w / 2 },
      y: { min: cy - CANAL_OFFSET.h / 2, max: cy + CANAL_OFFSET.h / 2 },
      lifespan: { min: 1400, max: 2200 },
      speedX: { min: -3, max: 3 },
      speedY: { min: -2, max: 2 },
      scale: { min: 0.4, max: 0.8 },
      alpha: { start: 0.18, end: 0 },
      tint: [ 0x9fcbe0, 0xffffff ],
      frequency: 260,
      quantity: 1,
      blendMode: 'ADD',
    }).setDepth(2);
  }

  /** A small bird-shape glides across the plaza's sky every so often. */
  private spawnBird() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const spanX = 360;
    const startX = this.plazaX - dir * spanX;
    const endX   = this.plazaX + dir * spanX;
    const baseY  = this.plazaY - 200 - Math.random() * 70;
    const endY   = baseY + (Math.random() - 0.5) * 50;

    const bird = this.add.graphics().setDepth(15).setPosition(startX, baseY);
    bird.lineStyle(2, 0x161616, 0.5);
    bird.beginPath();
    bird.moveTo(-6, 0);
    bird.lineTo(0, -3);
    bird.lineTo(6, 0);
    bird.strokePath();

    this.tweens.add({
      targets: bird,
      x: endX,
      y: endY,
      duration: Phaser.Math.Between(7000, 11000),
      ease: 'Sine.easeInOut',
      onComplete: () => bird.destroy(),
    });
  }

  private scheduleNextBird() {
    this.time.delayedCall(Phaser.Math.Between(10000, 20000), () => {
      this.spawnBird();
      this.scheduleNextBird();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     FALLBACK BACKGROUND (when PNG is missing)
     ═══════════════════════════════════════════════════════════ */
  private drawFallback() {
    const g = this.add.graphics().setDepth(0);

    g.fillGradientStyle(0x030a0c, 0x04090e, 0x050c10, 0x030709, 1);
    g.fillRect(0, 0, this.worldW, this.worldH);

    for (let r = 600; r > 0; r -= 60) {
      g.fillStyle(0xc87020, 0.015 * (600 - r) / 600);
      g.fillCircle(this.worldW * 0.38, this.worldH * 0.58, r);
    }

    g.lineStyle(1, 0x1a2830, 0.25);
    for (let x = 0; x < this.worldW; x += 200) g.lineBetween(x, 0, x, this.worldH);
    for (let y = 0; y < this.worldH; y += 200) g.lineBetween(0, y, this.worldW, y);

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
    this.keyZoomIn    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
    this.keyZoomOut   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);
    this.keyZoomReset = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
    this.keyE         = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyC         = kb.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD).on('down', () => {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT).on('down', () => {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP * 2, ZOOM_MIN, ZOOM_MAX);
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO).on('down', () => {
      this.targetZoom = ZOOM_DEFAULT;
    });
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — called from GamePage.tsx / RugTownGame.ts
     ═══════════════════════════════════════════════════════════ */

  teleportTo(x: number, y: number) {
    this.px = Phaser.Math.Clamp(x, 0, this.worldW);
    this.py = Phaser.Math.Clamp(y, 0, this.worldH);
    this.player.setPosition(this.px, this.py);
    this.velX = 0;
    this.velY = 0;
    this.registry.set('playerX', this.px);
    this.registry.set('playerY', this.py);
  }

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

  setTargetZoom(z: number) {
    this.targetZoom = Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX);
  }

  getPlayerPos() {
    return { x: this.px, y: this.py };
  }

  getWorldSize() {
    return { w: this.worldW, h: this.worldH };
  }

  /**
   * Suspends/resumes this scene's keyboard input (movement, zoom, E, C —
   * everything). Used while the chat text input has focus so typing
   * doesn't also move the player or toggle the collision overlay.
   * resetKeys() on re-enable clears any key held down while disabled, so
   * nothing gets stuck "pressed".
   */
  setKeyboardEnabled(enabled: boolean) {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.enabled = enabled;
    if (enabled) kb.resetKeys();
  }

  /** Settings panel's collision-debug toggle — mirrors the C key. */
  setCollisionDebugVisible(visible: boolean) {
    this.setCollisionDebug(visible);
  }
}
