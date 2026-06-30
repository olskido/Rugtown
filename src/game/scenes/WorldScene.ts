import Phaser from 'phaser';
import { getLiveWorldObjects, getWorldObject, toWorldPosition, WORLD_OBJECTS } from '../world/WorldObjects';
import { COLLISION_RECTS, toWorldRect } from '../world/CollisionZones';
import { CHARACTER_STYLES, getCharacterStyle, DEFAULT_CHARACTER_STYLE_ID } from '../world/CharacterStyles';
import { EventManager } from '../events/EventManager';
import { EVENT_DEFINITIONS } from '../events/EventDefinitions';
import type { EventDefinition, EventInstance, EventPhase } from '../events/EventTypes';
import { soundManager } from '../../audio/SoundManager';

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
const PLAYER_SPEED      = 330;          // px/sec at full run (reduced from 420)
const PLAYER_ACCEL_TIME = 0.12;         // seconds to reach full speed — unchanged, keeps the ramp feel/smoothness identical
const PLAYER_DECEL_TIME = 0.08;         // seconds to stop — unchanged, keeps stops snappy (not slippery)
const PLAYER_DIAG       = 0.7071;       // diagonal normalization

// Camera follow
const CAM_LERP          = 0.10;         // 0=instant, 1=never catches up
const CAM_DEADZONE_X    = 80;           // px of camera deadzone around player
const CAM_DEADZONE_Y    = 60;

// Zoom
const ZOOM_MIN          = 0.35;        // absolute floor; the dynamic per-frame zoomMin (see computeZoomMin) is usually the binding constraint and is normally higher than this
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
const LEG_STAGGER_Y       = 4;     // alternating vertical leg offset while walking (was 3 — more visible)
const LEG_LIFT            = 5;     // how much the forward leg shortens/lifts while stepping (was 3.5)
const LEG_SWING_X         = 2.2;   // alternating fore/aft leg offset — reads as an actual stride, not just marching in place
const BODY_BOB_WALK       = 2;     // torso bob amplitude while walking (was 1.8 — kept subtle per spec)
const ARM_SWING_WALK      = 3.6;   // arm swing amplitude while walking (was 3.2)

// Idle animation (shared) — always running, so characters never look frozen
const IDLE_BREATH_SPEED   = 1.7;    // breathing cycle speed
const IDLE_BREATH_SCALE   = 0.035;  // torso squash/stretch fraction while idle
const IDLE_BOB            = 0.6;    // tiny vertical bob while idle
const IDLE_SWAY           = 0.045;  // radians — gentle idle lean side to side
const IDLE_ARM_SWAY       = 0.4;    // px — barely-there arm drift while idle
const IDLE_HEAD_BOB       = 0.5;    // px — tiny independent head movement, separate from body sway

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
const NPC_SPEED_MIN       = 40;
const NPC_SPEED_MAX       = 100;
const NPC_ACCEL_TIME      = 0.25;
const NPC_ARRIVE_DIST     = 6;      // px — close enough to call it "arrived"
const NPC_LEAN_MAX        = 0.09;
const NPC_LEAN_SMOOTH     = 0.10;
const NPC_SPEECH_MIN_GAP  = 7000;   // ms between ONE NPC's own speech attempts (min)
const NPC_SPEECH_MAX_GAP  = 18000;  // ms between ONE NPC's own speech attempts (max)
const NPC_SPEECH_DURATION = 3200;   // ms a speech bubble stays visible
const NPC_SPEECH_CHANCE   = 0.55;   // odds a given attempt actually shows a line

// Population is randomized once per session, not fixed — see createNpcs().
const NPC_POPULATION_MIN = 40;
const NPC_POPULATION_MAX = 60;

// Ambient speech bubbles also get pushed into the city chat panel, but
// that must NOT scale with population — this is a single GLOBAL cooldown
// shared by all citizens, independent of how many of them exist.
const NPC_CHAT_GLOBAL_COOLDOWN = 5500; // ms minimum between any two ambient npc-chat posts

/* ─── RugTown Citizen names ───
   A large pool so 40-60 citizens can each get a unique one — shuffled
   and sliced down to the session's population count in createNpcs(). */
const NPC_NAMES = [
  'JeetBot', 'PumpGoblin', 'LiquidityLarry', 'AlphaAisha', 'ChartChad',
  'BagHolderBen', 'WhaleGhost', 'RugSlayerNPC', 'MoonboyNPC', 'DumpDemon',
  'DiamondHandDan', 'PaperHandPaula', 'SnipeKing', 'GasFeeGary', 'SlippageSam',
  'ApeInAndy', 'FudFiona', 'ShillShane', 'RektRicky', 'CopeCarl',
  'YieldYara', 'StakeSteve', 'FarmerFelix', 'BridgeBetty', 'AirdropAva',
  'WenLambo', 'ToTheMoonTia', 'BearMarketBob', 'BullRunBella', 'HodlHank',
  'DexDexter', 'CexCindy', 'OracleOwen', 'ValidatorVic', 'NodeNina',
  'GweiGwen', 'MempoolMax', 'BlockBlake', 'ChainChloe', 'TokenTara',
  'NftNeil', 'FloorPriceFay', 'MintMia', 'WhitelistWill', 'PresaleParker',
  'LaunchLuna', 'VestingVince', 'TreasuryTrent', 'DaoDana', 'GovernanceGus',
  'PumpAndDumpPete', 'RugPullRita', 'HoneypotHugo', 'ScamSentinel', 'AuditAaron',
  'KycKyle', 'AnonAlex', 'DegenDave', 'SerSerena', 'FrenFreddy',
  'GmGabby', 'WagmiWyatt', 'NgmiNoel', 'ProbablyNothingPaz', 'BasedBea',
  'CopiumCody', 'HopiumHazel', 'MaxiMaya', 'LaserEyesLeo', 'OgOliver',
];

const NPC_SKIN_PALETTE = [0xd4a878, 0xc89868, 0xb88858, 0xe0b890];

/* ─── Personalities ───
   Drives which outfit (from the shared CharacterStyles registry) a
   citizen wears and which slice of the ambient speech pool they draw
   lines from. Combined with the reaction/district/reply/welcome lines
   GamePage owns for the chat panel, the full system spans 80+ lines. */
export type NpcPersonality = 'degen' | 'whale' | 'alpha' | 'trader' | 'informant' | 'builder' | 'memelord';

const NPC_PERSONALITIES: NpcPersonality[] = ['degen', 'whale', 'alpha', 'trader', 'informant', 'builder', 'memelord'];

const NPC_PERSONALITY_STYLE: Record<NpcPersonality, string> = {
  degen:     'degenHoodie',
  whale:     'whaleSuit',
  alpha:     'alphaAnalyst',
  trader:    'marketTrader',
  informant: 'rugAlleyInformant',
  builder:   'builderJacket',
  memelord:  'memeLord',
};

export const NPC_SPEECH_BY_PERSONALITY: Record<NpcPersonality, string[]> = {
  degen: [
    'GM degens',
    'I bought the top again',
    'Sold the bottom last week',
    "Red candles don't scare me... much",
    "I'm not selling until zero",
    'Diamond hands, paper plans',
    "It'll come back. It always does",
    'Buy the dip, theoretically',
  ],
  whale: [
    'Big wallets move quietly',
    "I've seen things in the mempool",
    'Watch the wallets, not the charts',
    'Whale spotted near the tower',
    "I don't chase, I accumulate",
    'Liquidity looks healthy today',
    "Just moved a bag, don't ask",
    "Whales don't sleep",
  ],
  alpha: [
    'Real alpha is patience',
    'The best calls are quiet ones',
    "Don't chase, let it come to you",
    'That candle looks suspicious',
    'This pattern never lies',
    'Alpha Lounge is busy tonight',
    'Quiet alpha is the best alpha',
    'Position before the news, not after',
  ],
  trader: [
    'Meme Market is pumping',
    'Slippage is under control today',
    'Pools are looking deep tonight',
    'Spread is tight this morning',
    'Volume is picking up at the Market',
    'Liquidity looks healthy today',
    'Order book looks thin up here',
    'Buy low, panic sell high — works every time',
  ],
  informant: [
    'Trust no dev',
    'Always check the liquidity lock',
    "If it sounds too good, it's a rug",
    'Rug warning near Rug Alley',
    'Someone always exits first',
    'Every pump needs a dump',
    'Dev wallet just moved, watch out',
    'Contract looks unverified to me',
  ],
  builder: [
    'Still shipping, still building',
    'Code compiles, vibes immaculate',
    'Audits take time, be patient',
    'Mainnet soon, probably',
    'Builder Jacket, builder mindset',
    'Testnet looked good today',
    'Gas fees optimized this week',
    'Roadmap update coming soon',
  ],
  memelord: [
    'To the moon, eventually',
    'We are so back',
    'This is the way',
    'Probably nothing',
    'WAGMI, fren',
    'Patience is the real rocket fuel',
    'Number go up technology',
    'Ser, this whole town is a casino',
  ],
};

/* ─── Behavior types ───
   Tunes the existing idle/walk/pause wander loop per citizen rather
   than adding a new state machine — "idle"-leaning citizens just pause
   longer and wander less, "roamers" occasionally pick a brand new
   landmark as their home instead of always returning to the same one. */
export type NpcBehaviorType = 'idle' | 'wander' | 'gatherer' | 'roamer';

const NPC_BEHAVIOR_WEIGHTS: { type: NpcBehaviorType; weight: number }[] = [
  { type: 'idle',     weight: 25 },
  { type: 'wander',   weight: 40 },
  { type: 'gatherer', weight: 20 },
  { type: 'roamer',   weight: 15 },
];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return items[items.length - 1];
}

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

// Opening the Treasure Hunt event's chest — same E key, lowest priority
// of the three (see updateTreasureProximity()).
const TREASURE_INTERACT_RADIUS = 60; // px

// Inspecting the Whale Alert event's marker — same E key/priority tier
// as the treasure chest (see updateWhaleProximity()). Treasure Hunt and
// Whale Alert can never be Live at the same time (EventManager only
// ever runs one event), so the two never compete for the prompt.
const WHALE_INTERACT_RADIUS = 60; // px

// Town Crier — appears during any event's Announcement phase.
const TOWN_CRIER_LINE_DURATION = 2600; // ms each speech-bubble line stays up
const TOWN_CRIER_FACE_RADIUS = 220;    // px — citizens within this radius briefly face him

// Inspecting a Hall of Fame statue — same E key, lowest priority (after
// landmark zones, NPCs, the treasure chest, and the whale marker).
const STATUE_INTERACT_RADIUS = 55; // px

// Rank-colored glow — gold/silver/bronze (req. 6).
const STATUE_RANK_COLOR: Record<number, number> = {
  1: 0xe8b84b,
  2: 0xc9d2da,
  3: 0xb5712b,
};

// Crowd reaction — speech bubbles for the larger wave of citizens
// converging on a major-event moment (req. 6).
const CROWD_REACTION_LINES = [
  'I heard something!',
  "Let's go!",
  'Where?',
  'Follow the crowd!',
  'This city is alive.',
];

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
  legSwingX?: number;
  headBob?: number;
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
  styleId: string;
  skinColor: number;
  personality: NpcPersonality;
  behaviorType: NpcBehaviorType;
  homeLandmarkIndex: number;
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
  private outfitId: string = DEFAULT_CHARACTER_STYLE_ID;

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
  private npcLandmarks: { name: string; fx: number; fy: number; radius: number }[] = [];
  /** Global cross-citizen cooldown so ambient speech forwarded into the
   *  city chat panel doesn't scale (and spam) with population size. */
  private npcChatCooldownRemaining = 0;

  /* ── Interaction zones ── */
  private zones: ActiveZone[] = [];
  private nearZoneId: string | null = null;

  /* ── NPC dialogue proximity ── */
  private nearNpcName: string | null = null;

  /* ── Mobile virtual controls (joystick + interact button) ──
     Both default to "nothing pressed" so desktop keyboard play is
     completely unaffected when nothing on mobile is touching them. */
  private virtualMoveX = 0;   // -1..1
  private virtualMoveY = 0;   // -1..1
  private virtualInteractRequested = false;

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
  /** Recomputed every frame so the world image always covers the
   *  viewport, on any screen size/orientation/fullscreen state. */
  private zoomMin = ZOOM_MIN;

  /* ── Misc ── */
  private tick = 0;               // ms accumulator for registry publish rate

  /* ── Event Engine (Phase 2) ──
     The reusable lifecycle engine (src/game/events/) — framework-agnostic,
     owns its own timers. WorldScene's job is just to: publish its state
     to the registry for React, and apply the three local "effects" an
     event can ask for (weather/music/citizen behaviour). Everything else
     about an event (rarity, rewards, dialogue) is pure data it carries. */
  private eventManager = new EventManager(EVENT_DEFINITIONS);
  private eventManagerUnsubscribe: (() => void) | null = null;
  private activeWeather: string | null = null;
  private weatherGraphics!: Phaser.GameObjects.Graphics;
  private rainDrops: { ox: number; oy: number; len: number; speed: number }[] = [];
  private eventGatherSnapshot: { npc: NpcData; homeX: number; homeY: number; wanderRadius: number }[] | null = null;

  /* ── Treasure Hunt chest — only ever exists while the 'treasure-hunt'
     definition is Live; spawned/despawned from handleEventPhaseChange. ── */
  private treasureChest: {
    wx: number;
    wy: number;
    glow: Phaser.GameObjects.Graphics;
    body: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
  } | null = null;
  private nearTreasure = false;

  /* ── Whale Alert marker — only ever exists while the 'whale-alert'
     definition is Live; spawned/despawned from handleEventPhaseChange. ── */
  private whaleMarker: {
    wx: number;
    wy: number;
    glow: Phaser.GameObjects.Graphics;
    body: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
  } | null = null;
  private nearWhale = false;

  /* ── Town Crier — only ever exists during the Announcement phase of
     ANY event (not tied to one definition id, unlike the chest/whale
     marker); spawned/despawned from handleEventPhaseChange. ── */
  private townCrier: {
    wx: number;
    wy: number;
    shadow: Phaser.GameObjects.Graphics;
    body: Phaser.GameObjects.Graphics;
    bell: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
    speech: Phaser.GameObjects.Text;
    lines: string[];
    lineIndex: number;
    lineTimer: number;
    animTick: number;
  } | null = null;

  /* ── Hall of Fame statues — a permanent (not event-driven) fixture
     near the 'fame' landmark. Rebuilt whenever GamePage pushes fresh
     top-3 leaderboard data via setHallOfFameStatues(); empty until the
     first push arrives shortly after the scene is ready. ── */
  private hallOfFameStatues: {
    rank: number;
    name: string;
    rep: number;
    isPlayer: boolean;
    wx: number;
    wy: number;
    glow: Phaser.GameObjects.Graphics;
    body: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
  }[] = [];
  private nearStatueRank: number | null = null;

  /* ── Crowd reaction — a second, larger wave of citizens pulled toward
     a major-event moment (Town Crier announcing, Whale Alert/Treasure
     Hunt/Fireworks/Dance Festival going Live). Deliberately separate
     from eventGatherSnapshot (the existing small "inner circle" gather)
     so the two never fight over the same citizen's home/wanderRadius —
     triggerCrowdReaction() always samples from NPCs NOT already in
     eventGatherSnapshot. ── */
  private crowdReactionSnapshot: { npc: NpcData; homeX: number; homeY: number; wanderRadius: number }[] | null = null;

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
        this.zoomMin, ZOOM_MAX
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

    /* ── Event Engine (Phase 2) ── */
    this.weatherGraphics = this.add.graphics().setDepth(40).setVisible(false);
    this.eventManagerUnsubscribe = this.eventManager.onChange((instance, prevPhase) => {
      this.handleEventPhaseChange(instance, prevPhase);
    });
    this.eventManager.scheduleNext();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.eventManagerUnsubscribe?.();
      this.eventManager.destroy();
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

    /* ── Mobile virtual joystick — analog, only overrides when actually
       being touched (both axes 0 otherwise), so desktop keyboard input
       above is untouched when nothing on mobile is pressed. ── */
    if (this.virtualMoveX !== 0 || this.virtualMoveY !== 0) {
      tvx = this.virtualMoveX * PLAYER_SPEED;
      tvy = this.virtualMoveY * PLAYER_SPEED;
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

    /* ── Event Engine weather overlay (purely cosmetic, additive layer) ── */
    this.updateWeatherEffect(delta);
    this.updateTreasureChest();
    this.updateWhaleMarker();
    this.updateTownCrier(delta);
    this.updateHallOfFameStatues();

    /* ── Interaction zones ── */
    this.updateZoneProximity();

    /* ── NPC dialogue proximity ── */
    this.updateNpcProximity();

    /* ── Treasure Hunt chest proximity (no-op unless one exists) ── */
    this.updateTreasureProximity();

    /* ── Whale Alert marker proximity (no-op unless one exists) ── */
    this.updateWhaleProximity();

    /* ── Hall of Fame statue proximity (no-op unless any exist) ── */
    this.updateStatueProximity();

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

    /* ── Dynamic minimum zoom — keeps the city image covering the full
       viewport on any screen size/orientation. Re-clamping both values
       every frame (not just on new input) means a resize, rotation, or
       fullscreen toggle can never leave empty space showing, even if
       nothing zooms in response. ── */
    this.zoomMin = this.computeZoomMin();
    if (this.targetZoom < this.zoomMin) this.targetZoom = this.zoomMin;
    if (this.currentZoom < this.zoomMin) this.currentZoom = this.zoomMin;

    /* ── Zoom key input ── */
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomIn)) {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP * 2, this.zoomMin, ZOOM_MAX);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomOut)) {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP * 2, this.zoomMin, ZOOM_MAX);
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
    const legSwingX           = this.isMoving ? stepL * LEG_SWING_X : 0;
    const walkBob             = this.isMoving ? Math.abs(stepL) * BODY_BOB_WALK : 0;
    const armSwing              = this.isMoving
      ? stepL * ARM_SWING_WALK
      : Math.sin(breathPhase * 0.55) * IDLE_ARM_SWAY;
    const idleHeadBob            = this.isMoving ? 0 : Math.sin(breathPhase * 0.8 + 1) * IDLE_HEAD_BOB;

    const bodyBob = this.isMoving ? walkBob : idleBob;
    const sway    = this.isMoving ? 0 : idleSway;

    /* ── Emote pulse — a quick squash/stretch "pop", independent of movement ── */
    const emoteProgress = this.emotePulseUntil / EMOTE_PULSE_DURATION;
    const emotePulse = emoteProgress > 0 ? 1 + Math.sin(emoteProgress * Math.PI) * EMOTE_PULSE_AMOUNT : 1;

    /* ── Shadow — two layers (soft halo + denser core) for a stronger,
       more grounded look. Stays flat on the ground regardless of lean. ── */
    this.playerShadow.clear();
    this.playerShadow.fillStyle(0x000000, 0.20);
    this.playerShadow.fillEllipse(0, CHAR_H / 2 + 2, (SHADOW_W + 5) * (1 - bodyBob * 0.05), SHADOW_H + 2);
    this.playerShadow.fillStyle(0x000000, 0.42);
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

    /* ── Body — shared humanoid renderer. Player uses the selected outfit
       (CharacterStyles.ts) and is drawn at full scale/alpha (no NPC_SCALE/
       NPC_ALPHA), keeping the player slightly more prominent than citizens. ── */
    const outfit = getCharacterStyle(this.outfitId);
    this.drawHumanoid(this.playerBody, this.px, this.py, {
      facing: this.facing,
      bodyBob,
      legStagger,
      legLiftL,
      legLiftR,
      armSwing,
      legSwingX,
      headBob: idleHeadBob,
      rotation: this.lean + sway,
      breathScale: breathScale * emotePulse,
      coatColor: outfit.coatColor,
      coatHighlite: outfit.coatHighlite,
      coatShade: outfit.coatShade,
      goldColor: outfit.accentColor,
    });

    /* ── Label / speech bubble — stay upright regardless of body lean ── */
    const headYLocal = -bodyBob - CHAR_H * 0.5;
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
    const accentColor  = p.goldColor    ?? 0xe8b84b;
    const skinColor    = p.skinColor    ?? 0xd4a878;
    const legSwingX    = p.legSwingX    ?? 0;
    const headBob      = p.headBob      ?? 0;

    const isLeft  = p.facing === 'left';
    const isRight = p.facing === 'right';
    const isBack  = p.facing === 'up';

    const by = -p.bodyBob;   // local vertical offset for bob (up = negative)

    g.clear();

    // ── Legs + feet ── (wider stance, fore/aft swing so steps actually
    // alternate forward/back instead of just bobbing up and down)
    const legColors = [0x2a2018, 0x1e1810];
    const shoeColor = 0x0c0c0e;
    const lx1  = -6;
    const lx2  = 6;
    const legY = by + CHAR_H * 0.30;
    const legH = CHAR_H * 0.28;
    const legH1 = Math.max(4, legH - p.legLiftL);
    const legH2 = Math.max(4, legH - p.legLiftR);

    g.fillStyle(legColors[0]);
    g.fillRoundedRect(lx1 - 3 + legSwingX, legY + p.legStagger, 6, legH1, 1.5);
    g.fillStyle(legColors[1]);
    g.fillRoundedRect(lx2 - 3 - legSwingX, legY - p.legStagger, 6, legH2, 1.5);

    // Shoes — small distinct blocks at each foot, clearer than a tint strip
    g.fillStyle(shoeColor);
    g.fillRoundedRect(lx1 - 4 + legSwingX, legY + legH1 - 2.5 + p.legStagger, 8, 4, 1.5);
    g.fillRoundedRect(lx2 - 4 - legSwingX, legY + legH2 - 2.5 - p.legStagger, 8, 4, 1.5);
    g.fillStyle(0x4a3a24, 0.55);
    g.fillRect(lx1 - 3 + legSwingX, legY + legH1 - 1.5 + p.legStagger, 6, 1.5);
    g.fillRect(lx2 - 3 - legSwingX, legY + legH2 - 1.5 - p.legStagger, 6, 1.5);

    // ── Coat / hoodie ── (tapered waist instead of one flat box, a bit
    // less boxy/robotic)
    const bodyY = by - CHAR_H * 0.06;
    const bodyW = CHAR_W;
    const bodyH = CHAR_H * 0.40;

    g.fillStyle(0x05060a, 0.55);
    g.fillRoundedRect(-bodyW / 2 - 1, bodyY - 1, bodyW + 2, bodyH + 2, 5);

    g.fillStyle(coatColor);
    g.fillRoundedRect(-bodyW / 2, bodyY, bodyW, bodyH * 0.65, 4);
    g.fillRoundedRect(-bodyW / 2 + 1.5, bodyY + bodyH * 0.55, bodyW - 3, bodyH * 0.45, 4);

    g.fillStyle(coatShade, 0.55);
    g.fillRect(bodyW / 2 - 3, bodyY + 2, 3, bodyH - 4);
    g.fillStyle(coatHighlite, 0.6);
    g.fillRect(-bodyW / 2,     bodyY + 2, 2, bodyH - 4);

    if (!isBack) {
      // Collar + zipper — the per-variant accent color (gold by default)
      g.fillStyle(accentColor, 0.95);
      g.fillRoundedRect(-3, bodyY + 1, 6, 3, 1);
      g.fillRect(-1, bodyY + bodyH * 0.32, 2, bodyH * 0.55);
    } else {
      // From behind: a thin accent stripe across the shoulders instead
      g.fillStyle(accentColor, 0.55);
      g.fillRect(-bodyW / 2 + 2, bodyY + 2, bodyW - 4, 1.5);
    }

    // ── Arms + hands ──
    const armColor = 0x14161c;
    const armY = bodyY + 2;
    const armH = CHAR_H * 0.27;

    g.fillStyle(armColor);
    g.fillRoundedRect(-bodyW / 2 - 4, armY + p.armSwing,  4, armH, 2);
    g.fillRoundedRect( bodyW / 2,     armY - p.armSwing,  4, armH, 2);
    g.fillStyle(skinColor, 0.95);
    g.fillCircle(-bodyW / 2 - 2, armY + p.armSwing + armH, 2);
    g.fillCircle( bodyW / 2 + 2, armY - p.armSwing + armH, 2);

    // ── Head ── (bigger and rounder so it reads clearly at small scale)
    const headColor = isBack ? 0x1a1c20 : skinColor;
    const headY  = by - CHAR_H * 0.50 + headBob;
    const headW  = CHAR_W - 2;
    const headH  = CHAR_H * 0.32;
    const lookOX = isLeft ? -2.2 : isRight ? 2.2 : 0;

    g.fillStyle(0x05060a, 0.55);
    g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY - 5, headW + 4, headH + 9, 5);

    g.fillStyle(headColor);
    g.fillRoundedRect(-headW / 2 + lookOX, headY, headW, headH, 5);

    // ── Hood ──
    const hairColor = 0x171720;
    g.fillStyle(hairColor);
    g.fillRoundedRect(-headW / 2 - 1 + lookOX, headY - 5, headW + 2, 9, 4);
    g.fillRoundedRect(-headW / 2 - 2 + lookOX, headY,     4, headH * 0.75, 2);
    g.fillRoundedRect( headW / 2 - 2 + lookOX, headY,     4, headH * 0.75, 2);

    // Drawstring tips — per-variant accent color
    g.fillStyle(accentColor, 0.9);
    g.fillCircle(-headW / 2 + lookOX, headY + headH * 0.68, 1.3);
    g.fillCircle( headW / 2 + lookOX, headY + headH * 0.68, 1.3);

    // ── Face details (front/side only — back view stays a plain hood) ──
    if (!isBack) {
      const eyeY  = headY + headH * 0.4;
      const eyeOX = lookOX * 1.3;

      g.fillStyle(0x0a0a0a);
      g.fillRect(-4.5 + eyeOX, eyeY, 2.5, 2.5);
      g.fillRect( 2 + eyeOX,   eyeY, 2.5, 2.5);

      g.fillStyle(0x0a2030, 0.92);
      g.fillRoundedRect(-5.5 + eyeOX, eyeY - 1, 6, 3.5, 1);
      g.fillRoundedRect( 0.5 + eyeOX, eyeY - 1, 6, 3.5, 1);
      g.fillStyle(0x303030);
      g.fillRect(-0.5 + eyeOX, eyeY + 0.5, 2, 1.5);
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
    // Population re-rolled each session — not the same headcount every time.
    const population = Phaser.Math.Between(NPC_POPULATION_MIN, NPC_POPULATION_MAX);
    const names = Phaser.Utils.Array.Shuffle(NPC_NAMES.slice()).slice(0, population);

    // Anchor citizens across ALL registered landmarks (not just the 5 with
    // live interactions), so the population spreads across the whole city
    // instead of clustering only around the fountain/market/etc.
    const landmarks = WORLD_OBJECTS.map(o => ({
      name: o.id,
      fx: o.x,
      fy: o.y,
      radius: Math.max(70, o.interactionRadius * 0.85),
    }));
    this.npcLandmarks = landmarks;

    names.forEach((name, i) => {
      const personality = Phaser.Utils.Array.GetRandom(NPC_PERSONALITIES);
      const styleId = NPC_PERSONALITY_STYLE[personality];
      const behaviorType = pickWeighted(NPC_BEHAVIOR_WEIGHTS).type;

      // Round-robin through landmarks first (guarantees every landmark gets
      // citizens), then random for the remainder once every landmark has one.
      const homeLandmarkIndex = i < landmarks.length
        ? i
        : Phaser.Math.Between(0, landmarks.length - 1);
      const landmark = landmarks[homeLandmarkIndex];

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

      // Idle-leaning citizens pause longer and wander less; gatherers stay
      // tighter to their landmark; roamers get a wider radius since they'll
      // also periodically re-home to a different landmark entirely.
      const pauseScale = behaviorType === 'idle' ? 1.8 : behaviorType === 'gatherer' ? 1.2 : 1;
      const radiusScale = behaviorType === 'gatherer' ? 0.55 : behaviorType === 'roamer' ? 1.6 : 1;

      this.npcs.push({
        name,
        px, py,
        velX: 0, velY: 0,
        facing: 'down',
        isMoving: false,
        speed: Phaser.Math.FloatBetween(NPC_SPEED_MIN, NPC_SPEED_MAX) * (behaviorType === 'idle' ? 0.8 : 1),
        homeX, homeY,
        wanderRadius: landmark.radius * Phaser.Math.FloatBetween(0.7, 1.15) * radiusScale,
        targetX: px, targetY: py,
        state: 'idle',
        stateTimer: Phaser.Math.Between(200, 2000),          // stagger first decisions
        pauseMin: Phaser.Math.Between(900, 1800) * pauseScale,
        pauseMax: Phaser.Math.Between(2200, 4500) * pauseScale,
        walkMin: Phaser.Math.Between(900, 1600),
        walkMax: Phaser.Math.Between(1800, 3200),
        animTick: Phaser.Math.Between(0, 4000),               // random phase offset
        lean: 0,
        styleId,
        skinColor: Phaser.Utils.Array.GetRandom(NPC_SKIN_PALETTE),
        personality,
        behaviorType,
        homeLandmarkIndex,
        speechTimerNext: Phaser.Math.Between(NPC_SPEECH_MIN_GAP, NPC_SPEECH_MAX_GAP),
        speechShowUntil: 0,
        shadow, body, label, speech,
      });
    });

    // Published once so React (chat-activity simulator, citizen-count HUD)
    // can reference real citizen names/count without duplicating this list.
    this.registry.set('npcNames', this.npcs.map(n => n.name));
    this.registry.set('npcCount', this.npcs.length);
  }

  private updateNpcs(delta: number) {
    const dt = delta / 1000;

    // Camera-view culling bounds (with a margin so characters don't pop
    // in/out right at the screen edge). Computed once per frame, not
    // per-NPC, so scaling to 60 citizens stays cheap.
    const view = this.cameras.main.worldView;
    const cullMargin = 140;
    const viewLeft   = view.x - cullMargin;
    const viewRight  = view.x + view.width + cullMargin;
    const viewTop    = view.y - cullMargin;
    const viewBottom = view.y + view.height + cullMargin;

    this.npcChatCooldownRemaining = Math.max(0, this.npcChatCooldownRemaining - delta);

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

          // Roamers occasionally adopt a different landmark as their new
          // home so they move between districts instead of staying glued
          // to their spawn area forever.
          if (n.behaviorType === 'roamer' && this.npcLandmarks.length > 1 && Math.random() < 0.3) {
            let idx = n.homeLandmarkIndex;
            while (idx === n.homeLandmarkIndex) idx = Phaser.Math.Between(0, this.npcLandmarks.length - 1);
            const lm = this.npcLandmarks[idx];
            n.homeLandmarkIndex = idx;
            n.homeX = Phaser.Math.Clamp(this.worldW * lm.fx + Phaser.Math.Between(-20, 20), CHAR_W, this.worldW - CHAR_W);
            n.homeY = Phaser.Math.Clamp(this.worldH * lm.fy + Phaser.Math.Between(-20, 20), CHAR_H, this.worldH - CHAR_H);
            n.wanderRadius = lm.radius * Phaser.Math.FloatBetween(0.7, 1.15) * 1.6;
          }
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

      /* ── Viewport culling — citizens far outside the camera view skip
         redraw + go invisible. Cheap with 10 NPCs, necessary at 40-60. ── */
      const onScreen = n.px >= viewLeft && n.px <= viewRight && n.py >= viewTop && n.py <= viewBottom;
      if (!onScreen) {
        if (n.body.visible) {
          n.body.setVisible(false);
          n.shadow.setVisible(false);
          n.label.setVisible(false);
          n.speech.setVisible(false);
        }
        continue;
      }
      if (!n.body.visible) {
        n.body.setVisible(true);
        n.shadow.setVisible(true);
        n.label.setVisible(true);
      }

      /* ── Speech bubbles — occasional, desynchronized per NPC. The bubble
         itself is per-NPC and unthrottled (so the city always feels alive
         up close); forwarding into the city chat panel is rate-limited by
         a single GLOBAL cooldown so 60 citizens don't spam 6x harder than
         10 used to. ── */
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
            const pool = NPC_SPEECH_BY_PERSONALITY[n.personality];
            const line = Phaser.Utils.Array.GetRandom(pool);
            n.speech.setText(line);
            n.speech.setVisible(true);
            n.speechShowUntil = NPC_SPEECH_DURATION;
            if (this.npcChatCooldownRemaining <= 0) {
              this.npcChatCooldownRemaining = NPC_CHAT_GLOBAL_COOLDOWN;
              this.events.emit('npc-chat', { name: n.name, text: line });
            }
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
    const legSwingX           = n.isMoving ? stepL * LEG_SWING_X : 0;
    const walkBob             = n.isMoving ? Math.abs(stepL) * BODY_BOB_WALK : 0;
    const armSwing              = n.isMoving
      ? stepL * ARM_SWING_WALK
      : Math.sin(breathPhase * 0.55) * IDLE_ARM_SWAY;
    const idleHeadBob            = n.isMoving ? 0 : Math.sin(breathPhase * 0.8 + 1) * IDLE_HEAD_BOB;

    const bodyBob = n.isMoving ? walkBob : idleBob;
    const sway    = n.isMoving ? 0 : idleSway;

    n.shadow.clear();
    n.shadow.fillStyle(0x000000, 0.16);
    n.shadow.fillEllipse(0, CHAR_H / 2 + 2, (SHADOW_W + 4) * NPC_SCALE * (1 - bodyBob * 0.05), (SHADOW_H + 2) * NPC_SCALE);
    n.shadow.fillStyle(0x000000, 0.34);
    n.shadow.fillEllipse(0, CHAR_H / 2 + 2, SHADOW_W * NPC_SCALE * (1 - bodyBob * 0.05), SHADOW_H * NPC_SCALE);
    n.shadow.setPosition(n.px, n.py);

    const style = getCharacterStyle(n.styleId);
    this.drawHumanoid(n.body, n.px, n.py, {
      facing: n.facing,
      bodyBob,
      legStagger,
      legLiftL,
      legLiftR,
      armSwing,
      legSwingX,
      headBob: idleHeadBob,
      rotation: n.lean + sway,
      breathScale,
      scale: NPC_SCALE,
      alpha: NPC_ALPHA,
      coatColor: style.coatColor,
      coatHighlite: style.coatHighlite,
      coatShade: style.coatShade,
      goldColor: style.accentColor,
      skinColor: n.skinColor,
    });

    const headYLocal = -bodyBob - CHAR_H * 0.5;
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

  /**
   * True once for an E key press OR a mobile interact-button tap —
   * whichever happened. The virtual flag is consumed (reset) on read so
   * a single tap can't fire twice across the same frame's two proximity
   * checks (zone vs NPC), matching how Keyboard.JustDown already behaves.
   */
  private consumeInteractPress(): boolean {
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) return true;
    if (this.virtualInteractRequested) {
      this.virtualInteractRequested = false;
      return true;
    }
    return false;
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

    if (nearest && this.consumeInteractPress()) {
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

    if (nearest && this.consumeInteractPress()) {
      this.events.emit('npc-interact', { name: nearest.name, personality: nearest.personality });
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

  /**
   * The zoom level below which the camera's view area would exceed the
   * world image in either dimension — i.e. the point past which empty
   * background starts showing. Below this, `viewport / zoom` (the area
   * actually visible) would be bigger than the world image, so the
   * floor is whichever axis needs the most zoom to still cover it.
   * Called every frame so resize/rotate/fullscreen are always correct.
   */
  private computeZoomMin(): number {
    if (this.worldW <= 0 || this.worldH <= 0) return ZOOM_MIN;
    const vw = this.scale.width;
    const vh = this.scale.height;
    if (vw <= 0 || vh <= 0) return ZOOM_MIN;
    return Math.max(vw / this.worldW, vh / this.worldH, ZOOM_MIN);
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
     EVENT ENGINE (Phase 2)
     WorldScene's side of the EventManager contract: publish lifecycle
     state to the registry so React can read it, and apply/revert the
     three local effects a data-driven event can ask for — weather,
     music, and citizen behaviour. EventManager itself knows nothing
     about Phaser; this is the one place that bridges the two.
     ═══════════════════════════════════════════════════════════ */

  /** Read-only passthrough — lets React (or anything else holding the
   *  scene) inspect the current event without reaching into the
   *  registry, mirroring getPlayerPos()/getWorldSize() below. */
  getCurrentEvent(): EventInstance | null {
    return this.eventManager.getCurrentEvent();
  }

  private dialogueFor(instance: EventInstance, phase: EventPhase): string | null {
    const match = instance.definition.dialogue.find(d => d.phase === phase);
    return match?.text ?? null;
  }

  private handleEventPhaseChange(instance: EventInstance | null, _prevPhase: EventPhase) {
    this.registry.set('eventPhase', instance?.phase ?? 'idle');
    this.registry.set('currentEvent', instance ? {
      id: instance.definition.id,
      title: instance.definition.title,
      description: instance.definition.description,
      rarity: instance.definition.rarity,
      phase: instance.phase,
      phaseDuration: instance.phaseDuration,
      phaseStartedAt: instance.phaseStartedAt,
      reward: instance.definition.reward,
      location: instance.definition.location,
      dialogue: this.dialogueFor(instance, instance.phase),
      chainedFrom: instance.chainedFrom ?? null,
    } : null);

    if (!instance) {
      this.revertEventOverrides();
      this.despawnTreasureChest();
      this.despawnWhaleMarker();
      this.despawnTownCrier();
      this.revertCrowdReaction();
      return;
    }

    if (instance.phase === 'announcement') {
      // Every event gets a Town Crier during Announcement — unlike the
      // treasure chest/whale marker, this one isn't tied to a specific
      // event id (req. 1/2). spawnTownCrier() triggers its own (smaller,
      // tighter) crowd reaction internally.
      this.spawnTownCrier(instance);
    } else if (instance.phase === 'live') {
      this.applyEventOverrides(instance.definition);
      // Only their own definition ever spawns a marker — every other
      // event leaves both untouched (treasure-hunt req. 11 / same rule
      // for whale-alert).
      if (instance.definition.id === 'treasure-hunt') {
        this.spawnTreasureChest(instance.definition);
      }
      if (instance.definition.id === 'whale-alert') {
        this.spawnWhaleMarker(instance.definition);
      }
      // The Crier's job (and his crowd) is done the moment the event
      // goes Live — clear it before the Live-phase crowd (if any)
      // takes over, so the two never overlap.
      this.despawnTownCrier();
      this.revertCrowdReaction();
      this.triggerLiveCrowdReaction(instance.definition);
    } else if (instance.phase === 'completed') {
      this.revertEventOverrides();
      this.despawnTreasureChest();
      this.despawnWhaleMarker();
      this.despawnTownCrier(); // safety net in case Live was skipped somehow
      this.revertCrowdReaction();
    }

    // Citizens get a chance to "say" the event's line for this phase,
    // reusing the existing ambient speech-bubble helper — no new UI.
    const line = this.dialogueFor(instance, instance.phase);
    if (line && (instance.phase === 'announcement' || instance.phase === 'live' || instance.phase === 'completed')) {
      this.showNpcEventSpeech(line);
    }
  }

  private applyEventOverrides(def: EventDefinition) {
    this.activeWeather = def.weatherOverride ?? null;
    if (!this.activeWeather) this.weatherGraphics.setVisible(false);

    // Music override: SoundManager only supports one-shot named effects
    // today (no per-track switching) — playing the existing 'event' cue
    // is the honest stand-in until a real per-event track system exists.
    // def.musicOverride is still carried through to the registry above
    // so a future audio layer has the id to key off of immediately.
    if (def.musicOverride) soundManager.play('event');

    if (def.citizenBehaviour.mode === 'gather') {
      this.applyEventCitizenGather(def);
    }
  }

  private revertEventOverrides() {
    this.activeWeather = null;
    this.weatherGraphics.setVisible(false);
    this.revertEventCitizenGather();
  }

  /** Pulls a sample of citizens toward the event's location for the
   *  Live phase. Snapshots each one's home/wander radius first so
   *  revertEventCitizenGather() can put them back exactly as they were
   *  — this never permanently changes an NPC's normal routine. */
  private applyEventCitizenGather(def: EventDefinition) {
    if (this.npcs.length === 0) return;
    const landmark = def.location.landmarkId ? getWorldObject(def.location.landmarkId) : undefined;
    const { wx, wy } = landmark
      ? toWorldPosition(landmark, this.worldW, this.worldH)
      : { wx: this.plazaX, wy: this.plazaY };

    const count = Math.min(def.citizenBehaviour.citizenCount ?? 8, this.npcs.length);
    const sample = Phaser.Utils.Array.Shuffle(this.npcs.slice()).slice(0, count);

    this.eventGatherSnapshot = sample.map(npc => ({
      npc, homeX: npc.homeX, homeY: npc.homeY, wanderRadius: npc.wanderRadius,
    }));

    sample.forEach(npc => {
      npc.homeX = Phaser.Math.Clamp(wx + Phaser.Math.Between(-40, 40), CHAR_W, this.worldW - CHAR_W);
      npc.homeY = Phaser.Math.Clamp(wy + Phaser.Math.Between(-40, 40), CHAR_H, this.worldH - CHAR_H);
      npc.wanderRadius = 60;
      npc.state = 'walk';
      npc.targetX = npc.homeX;
      npc.targetY = npc.homeY;
      npc.stateTimer = Phaser.Math.Between(800, 1600);
    });
  }

  private revertEventCitizenGather() {
    if (!this.eventGatherSnapshot) return;
    this.eventGatherSnapshot.forEach(({ npc, homeX, homeY, wanderRadius }) => {
      npc.homeX = homeX;
      npc.homeY = homeY;
      npc.wanderRadius = wanderRadius;
      npc.state = 'pause';
      npc.stateTimer = Phaser.Math.Between(400, 1200);
    });
    this.eventGatherSnapshot = null;
  }

  /** Lazily builds a small fixed pool of rain drops, positioned later
   *  each frame as fractions (0-1) of the current camera view — cheap
   *  at any zoom level since it never depends on world size directly. */
  private ensureRainDrops() {
    if (this.rainDrops.length > 0) return;
    for (let i = 0; i < 90; i++) {
      this.rainDrops.push({
        ox: Math.random(),
        oy: Math.random(),
        len: 10 + Math.random() * 8,
        speed: 280 + Math.random() * 160,
      });
    }
  }

  /** Purely cosmetic overlay — never touches collision/camera/background.
   *  No-ops (and hides the layer) whenever no weather event is Live. */
  private updateWeatherEffect(delta: number) {
    if (this.activeWeather !== 'rain') {
      if (this.weatherGraphics.visible) this.weatherGraphics.setVisible(false);
      return;
    }

    this.ensureRainDrops();
    this.weatherGraphics.setVisible(true);
    this.weatherGraphics.clear();
    this.weatherGraphics.lineStyle(1, 0x9fd0e8, 0.35);

    const view = this.cameras.main.worldView;
    const dt = delta / 1000;

    for (const drop of this.rainDrops) {
      drop.oy += (drop.speed * dt) / Math.max(1, view.height);
      if (drop.oy > 1) { drop.oy -= 1; drop.ox = Math.random(); }
      const x = view.x + drop.ox * view.width;
      const y = view.y + drop.oy * view.height;
      this.weatherGraphics.lineBetween(x, y, x - 3, y + drop.len);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TREASURE HUNT CHEST
     Only ever exists while the 'treasure-hunt' event definition is
     Live — spawned/despawned from handleEventPhaseChange(). Everything
     here is gated on `this.treasureChest` being non-null, so it's a
     true no-op for every other event (req. 11).
     ═══════════════════════════════════════════════════════════ */

  /** Picks a world position for the chest. Treasure Hunt has no fixed
   *  landmark (location.landmarkId is null — "somewhere in RugTown"),
   *  so this tries random open spots (not inside collision) before
   *  falling back to the plaza if it somehow can't find one. Events
   *  anchored to a real landmark would just spawn there instead. */
  private pickTreasureSpawnPosition(def: EventDefinition): { wx: number; wy: number } {
    const landmark = def.location.landmarkId ? getWorldObject(def.location.landmarkId) : undefined;
    if (landmark) return toWorldPosition(landmark, this.worldW, this.worldH);

    const margin = 160;
    for (let attempt = 0; attempt < 30; attempt++) {
      const wx = Phaser.Math.Between(margin, this.worldW - margin);
      const wy = Phaser.Math.Between(margin, this.worldH - margin);
      if (!this.isBlockedAt(wx, wy)) return { wx, wy };
    }
    return { wx: this.plazaX, wy: this.plazaY };
  }

  /** Simple pixel-art chest — code-generated Graphics, same technique
   *  as every character/prop in the game (no sprite assets). */
  private drawTreasureChestGraphics(g: Phaser.GameObjects.Graphics) {
    g.clear();
    g.fillStyle(0x5a3a1e);
    g.fillRoundedRect(-14, -6, 28, 16, 3);
    g.fillStyle(0x3a2410);
    g.fillRoundedRect(-15, -14, 30, 10, 4);
    g.fillStyle(0xe8b84b);
    g.fillRect(-15, -14, 30, 2);
    g.fillRect(-15, -6, 28, 2);
    g.fillStyle(0xe8b84b);
    g.fillRoundedRect(-3, -8, 6, 6, 1);
    g.fillStyle(0x3a2410, 0.85);
    g.fillRect(-1, -6, 2, 3);
  }

  private spawnTreasureChest(def: EventDefinition) {
    this.despawnTreasureChest(); // never let two chests stack

    const { wx, wy } = this.pickTreasureSpawnPosition(def);

    const glow = this.add.graphics().setDepth(13).setPosition(wx, wy);
    const body = this.add.graphics().setDepth(14).setPosition(wx, wy);
    this.drawTreasureChestGraphics(body);
    const label = this.add.text(wx, wy - 24, '✦ Treasure Chest ✦', {
      fontFamily: '"Cinzel", serif',
      fontSize: '8px',
      color: '#e8b84b',
      backgroundColor: 'rgba(4,8,12,0.78)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(14.2);

    this.treasureChest = { wx, wy, glow, body, label };
    this.registry.set('treasureChest', { wx, wy });
  }

  private despawnTreasureChest() {
    if (!this.treasureChest) return;
    this.treasureChest.glow.destroy();
    this.treasureChest.body.destroy();
    this.treasureChest.label.destroy();
    this.treasureChest = null;
    this.registry.set('treasureChest', null);
    if (this.nearTreasure) {
      this.nearTreasure = false;
      this.registry.set('nearTreasure', false);
    }
  }

  /** Gold pulse — alpha/scale driven by the same always-running
   *  animTick used for the player's idle breathing, redrawn cheaply
   *  each frame (cheap: it's just a handful of concentric circles). */
  private updateTreasureChest() {
    if (!this.treasureChest) return;
    const t = this.animTick / 1000;
    const pulse = (Math.sin(t * 2.4) + 1) / 2; // 0..1

    this.treasureChest.glow.clear();
    const glowA = 0.12 + pulse * 0.18;
    for (let r = 26; r > 0; r -= 5) {
      this.treasureChest.glow.fillStyle(0xe8b84b, glowA * (1 - r / 26));
      this.treasureChest.glow.fillCircle(0, 0, r);
    }
    this.treasureChest.glow.setScale(1 + pulse * 0.18);
    this.treasureChest.body.setScale(1 + pulse * 0.06);
  }

  /** Same E-key proximity pattern as updateZoneProximity()/
   *  updateNpcProximity(), lowest priority of the three — only checked
   *  when neither a landmark zone nor an NPC claimed this frame's
   *  proximity/E-press already. */
  private updateTreasureProximity() {
    if (!this.treasureChest) return;

    if (this.nearZoneId || this.nearNpcName) {
      if (this.nearTreasure) {
        this.nearTreasure = false;
        this.registry.set('nearTreasure', false);
      }
      return;
    }

    const dx = this.px - this.treasureChest.wx;
    const dy = this.py - this.treasureChest.wy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const near = dist <= TREASURE_INTERACT_RADIUS;

    if (near !== this.nearTreasure) {
      this.nearTreasure = near;
      this.registry.set('nearTreasure', near);
    }

    if (near && this.consumeInteractPress()) {
      // Reward comes from the live engine state, not a stale snapshot —
      // req. 10 (no double-claim) is enforced by destroying the chest
      // (and its proximity/registry state) immediately, synchronously,
      // before the event is even emitted.
      const reward = this.eventManager.getCurrentEvent()?.definition.reward;
      this.despawnTreasureChest();
      this.events.emit('treasure-interact', {
        rewardAmount: reward?.amount ?? 0,
        rewardLabel: reward?.label ?? 'Treasure found!',
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WHALE ALERT MARKER
     Only ever exists while the 'whale-alert' event definition is Live —
     spawned/despawned from handleEventPhaseChange(). Citizens gathering
     toward Whale Tower is already handled by the existing, generic
     applyEventCitizenGather() (whale-alert's citizenBehaviour.mode is
     'gather' in EventDefinitions.ts) — nothing new needed for that part.
     ═══════════════════════════════════════════════════════════ */

  /** Simple pixel-art whale — code-generated Graphics, same technique
   *  as every character/prop in the game (no sprite assets). */
  private drawWhaleMarkerGraphics(g: Phaser.GameObjects.Graphics) {
    g.clear();
    g.fillStyle(0x1e4a6e);
    g.fillEllipse(0, 0, 34, 18);
    g.fillStyle(0x3a7aa8, 0.85);
    g.fillEllipse(2, 5, 24, 9);
    g.fillStyle(0x1e4a6e);
    g.fillTriangle(14, -2, 27, -11, 27, 9);
    g.fillStyle(0x0a0a0a);
    g.fillCircle(-11, -3, 1.6);
    g.fillStyle(0x9fd0e8, 0.85);
    g.fillRect(-15, -15, 2, 6);
    g.fillRect(-17, -17, 2, 4);
    g.fillRect(-13, -17, 2, 4);
  }

  /** Clearly-fake flavor data for the Whale Alert modal — generated
   *  fresh at inspection time, never tied to any real wallet/chain. */
  private generateFakeWhaleIntel(): { wallet: string; buySol: number; tokenSymbol: string; riskLevel: string } {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const chunk = (n: number) => {
      let s = '';
      for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    };
    const tokens = ['$RUG', '$MOON', '$DEGEN', '$ALPHA', '$WHALE', '$PUMP', '$GHOST'];
    const risks = ['Low', 'Medium', 'High', 'Extreme'];

    return {
      wallet: `${chunk(6)}...${chunk(4)}`,
      buySol: Math.round((40 + Math.random() * 860) * 10) / 10,
      tokenSymbol: Phaser.Utils.Array.GetRandom(tokens),
      riskLevel: Phaser.Utils.Array.GetRandom(risks),
    };
  }

  private spawnWhaleMarker(def: EventDefinition) {
    this.despawnWhaleMarker(); // never let two markers stack

    const landmark = def.location.landmarkId ? getWorldObject(def.location.landmarkId) : undefined;
    const { wx, wy } = landmark
      ? toWorldPosition(landmark, this.worldW, this.worldH)
      : { wx: this.plazaX, wy: this.plazaY };

    const glow = this.add.graphics().setDepth(13).setPosition(wx, wy);
    const body = this.add.graphics().setDepth(14).setPosition(wx, wy);
    this.drawWhaleMarkerGraphics(body);
    const label = this.add.text(wx, wy - 26, '✦ Whale Alert ✦', {
      fontFamily: '"Cinzel", serif',
      fontSize: '8px',
      color: '#5cb8ec',
      backgroundColor: 'rgba(4,8,12,0.78)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(14.2);

    this.whaleMarker = { wx, wy, glow, body, label };
    this.registry.set('whaleMarker', { wx, wy });
  }

  private despawnWhaleMarker() {
    if (!this.whaleMarker) return;
    this.whaleMarker.glow.destroy();
    this.whaleMarker.body.destroy();
    this.whaleMarker.label.destroy();
    this.whaleMarker = null;
    this.registry.set('whaleMarker', null);
    if (this.nearWhale) {
      this.nearWhale = false;
      this.registry.set('nearWhale', false);
    }
  }

  /** Two-tone gold/blue pulse — feels distinct from the treasure chest's
   *  plain gold glow, "special" per req. 2, via a slow crossfade between
   *  the two colors layered under the alpha pulse. */
  private updateWhaleMarker() {
    if (!this.whaleMarker) return;
    const t = this.animTick / 1000;
    const pulse = (Math.sin(t * 2.0) + 1) / 2;       // 0..1, fast alpha/scale pulse
    const colorMix = (Math.sin(t * 0.8) + 1) / 2;     // 0..1, slow gold↔blue crossfade

    this.whaleMarker.glow.clear();
    for (let r = 34; r > 0; r -= 6) {
      const a = (0.10 + pulse * 0.16) * (1 - r / 34);
      this.whaleMarker.glow.fillStyle(0xe8b84b, a * colorMix);
      this.whaleMarker.glow.fillCircle(0, 0, r);
      this.whaleMarker.glow.fillStyle(0x5cb8ec, a * (1 - colorMix));
      this.whaleMarker.glow.fillCircle(0, 0, r);
    }
    this.whaleMarker.glow.setScale(1 + pulse * 0.16);
    this.whaleMarker.body.setScale(1 + pulse * 0.05);
  }

  /** Same E-key proximity pattern as updateTreasureProximity() — lowest
   *  priority, only checked when neither a landmark zone nor an NPC
   *  claimed this frame's proximity/E-press already. */
  private updateWhaleProximity() {
    if (!this.whaleMarker) return;

    if (this.nearZoneId || this.nearNpcName) {
      if (this.nearWhale) {
        this.nearWhale = false;
        this.registry.set('nearWhale', false);
      }
      return;
    }

    const dx = this.px - this.whaleMarker.wx;
    const dy = this.py - this.whaleMarker.wy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const near = dist <= WHALE_INTERACT_RADIUS;

    if (near !== this.nearWhale) {
      this.nearWhale = near;
      this.registry.set('nearWhale', near);
    }

    if (near && this.consumeInteractPress()) {
      // Same one-shot-claim pattern as the treasure chest: destroy the
      // marker synchronously before emitting, so "grants REP once per
      // event" (req. 8) is enforced by there being nothing left to
      // press E on a second time.
      const reward = this.eventManager.getCurrentEvent()?.definition.reward;
      const intel = this.generateFakeWhaleIntel();
      this.despawnWhaleMarker();
      this.events.emit('whale-interact', {
        wallet: intel.wallet,
        buySol: intel.buySol,
        tokenSymbol: intel.tokenSymbol,
        riskLevel: intel.riskLevel,
        rewardAmount: reward?.amount ?? 0,
        rewardLabel: reward?.label ?? 'Whale spotted!',
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TOWN CRIER
     Appears during the Announcement phase of ANY event — unlike the
     treasure chest/whale marker, this isn't tied to one definition id.
     Purely ambient: no proximity prompt, no E-press, no reward. Drawn
     with the same shared drawHumanoid() renderer as the player/citizens
     for visual consistency, just in the "Gold Holder Coat" outfit plus
     a bell marker so he reads as a special character at a glance.
     ═══════════════════════════════════════════════════════════ */

  /** "Somewhere in RugTown"-style events have no fixed landmark, so the
   *  Crier defaults to Spawn Fountain (req. 3); events with a real
   *  landmark get him posted right there instead. */
  private pickTownCrierSpawnPosition(def: EventDefinition): { wx: number; wy: number } {
    const landmark = def.location.landmarkId ? getWorldObject(def.location.landmarkId) : undefined;
    if (landmark) return toWorldPosition(landmark, this.worldW, this.worldH);
    return { wx: this.plazaX, wy: this.plazaY };
  }

  private spawnTownCrier(instance: EventInstance) {
    this.despawnTownCrier(); // never let two stack (e.g. a very fast re-announce)

    const def = instance.definition;
    const { wx, wy } = this.pickTownCrierSpawnPosition(def);

    const shadow = this.add.graphics().setDepth(13);
    const body = this.add.graphics().setDepth(14);
    const bell = this.add.text(wx, wy, '🔔', { fontSize: '13px' })
      .setOrigin(0.5, 1).setDepth(14.3);
    const label = this.add.text(wx, wy, 'Town Crier [NPC]', {
      fontFamily: '"Cinzel", serif',
      fontSize: '7px',
      fontStyle: 'bold',
      color: '#1a1408',
      backgroundColor: 'rgba(232,184,75,0.92)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(14.2);
    const speech = this.add.text(wx, wy, '', {
      fontFamily: '"Cinzel", serif',
      fontSize: '9px',
      color: '#e8d8c0',
      backgroundColor: 'rgba(10,14,18,0.92)',
      padding: { x: 6, y: 4 },
      align: 'center',
      wordWrap: { width: 160 },
    }).setOrigin(0.5, 1).setDepth(14.4).setVisible(false);

    const shortDescription = def.description.length > 70
      ? `${def.description.slice(0, 67)}...`
      : def.description;

    this.townCrier = {
      wx, wy, shadow, body, bell, label, speech,
      lines: ['Hear ye! Hear ye!', def.title, shortDescription],
      lineIndex: 0,
      lineTimer: 0,
      animTick: 0,
    };
    this.registry.set('townCrier', { wx, wy });

    this.showTownCrierLine(0);
    this.faceNpcsTowardTownCrier(wx, wy);
    // Nearby citizens don't just turn to face him — a crowd actually
    // gathers closer for the announcement (req. 1), tighter/closer than
    // the bigger Live-phase crowd reactions below.
    this.triggerCrowdReaction(wx, wy, 10, 15, 55);

    soundManager.play('bell');
    this.events.emit('town-crier-announce', { title: def.title });
  }

  private despawnTownCrier() {
    if (!this.townCrier) return;
    this.townCrier.shadow.destroy();
    this.townCrier.body.destroy();
    this.townCrier.bell.destroy();
    this.townCrier.label.destroy();
    this.townCrier.speech.destroy();
    this.townCrier = null;
    this.registry.set('townCrier', null);
  }

  private showTownCrierLine(index: number) {
    if (!this.townCrier) return;
    this.townCrier.lineIndex = index;
    this.townCrier.speech.setText(this.townCrier.lines[index]);
    this.townCrier.speech.setVisible(true);
    this.townCrier.lineTimer = TOWN_CRIER_LINE_DURATION;
  }

  /** Ambience only — a one-time nudge when the Crier shows up, not a
   *  continuous force. Citizens already mid-walk will naturally turn
   *  away again the next time their own movement updates `facing`. */
  private faceNpcsTowardTownCrier(wx: number, wy: number) {
    for (const n of this.npcs) {
      const dx = wx - n.px;
      const dy = wy - n.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > TOWN_CRIER_FACE_RADIUS) continue;
      if (Math.abs(dx) >= Math.abs(dy)) {
        n.facing = dx > 0 ? 'right' : 'left';
      } else {
        n.facing = dy > 0 ? 'down' : 'up';
      }
    }
  }

  private updateTownCrier(delta: number) {
    const tc = this.townCrier;
    if (!tc) return;
    tc.animTick += delta;

    const t = tc.animTick / 1000;
    const breathPhase = t * IDLE_BREATH_SPEED;
    const breathe = Math.sin(breathPhase);
    const idleBob = Math.abs(breathe) * IDLE_BOB;
    const idleSway = Math.sin(breathPhase * 0.55) * IDLE_SWAY;
    const breathScale = 1 + breathe * IDLE_BREATH_SCALE;
    const idleHeadBob = Math.sin(breathPhase * 0.8 + 1) * IDLE_HEAD_BOB;

    tc.shadow.clear();
    tc.shadow.fillStyle(0x000000, 0.18);
    tc.shadow.fillEllipse(0, CHAR_H / 2 + 2, (SHADOW_W + 4) * (1 - idleBob * 0.05), SHADOW_H + 2);
    tc.shadow.setPosition(tc.wx, tc.wy);

    const goldOutfit = getCharacterStyle('goldHolderCoat');
    this.drawHumanoid(tc.body, tc.wx, tc.wy, {
      facing: 'down',
      bodyBob: idleBob,
      legStagger: 0,
      legLiftL: 0,
      legLiftR: 0,
      armSwing: 0,
      headBob: idleHeadBob,
      rotation: idleSway,
      breathScale,
      coatColor: goldOutfit.coatColor,
      coatHighlite: goldOutfit.coatHighlite,
      coatShade: goldOutfit.coatShade,
      goldColor: goldOutfit.accentColor,
    });

    const headYLocal = -idleBob - CHAR_H * 0.5;
    const labelY = tc.wy + headYLocal - 6;
    tc.label.setPosition(tc.wx, labelY);
    tc.bell.setPosition(tc.wx, labelY - 14);
    tc.speech.setPosition(tc.wx, labelY - 26);

    tc.lineTimer -= delta;
    if (tc.lineTimer <= 0) {
      this.showTownCrierLine((tc.lineIndex + 1) % tc.lines.length);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     HALL OF FAME STATUES
     A permanent fixture near the 'fame' landmark, NOT event-driven —
     unlike the chest/whale/crier, these always exist once GamePage has
     pushed leaderboard data at least once. GamePage owns the actual
     leaderboard (local-only, no backend, no real users — see
     LEADERBOARD_NPCS in GamePage.tsx); this is purely the read-only
     world-rendering side of it.
     ═══════════════════════════════════════════════════════════ */

  /**
   * Rebuilds the 3 statues from fresh top-3 leaderboard rows. Safe to
   * call repeatedly (e.g. every time REP changes the ranking) — always
   * tears down and redraws rather than trying to patch in place, since
   * with only 3 statues that's simpler and cheap.
   */
  setHallOfFameStatues(rows: { rank: number; name: string; rep: number; isPlayer: boolean }[]) {
    this.despawnHallOfFameStatues();

    const fame = getWorldObject('fame');
    if (!fame) return;
    const { wx: baseX, wy: baseY } = toWorldPosition(fame, this.worldW, this.worldH);

    // #1 front-center, #2/#3 flanking slightly behind — reads as a
    // podium without needing any new art.
    const offsets = [
      { dx: 0, dy: -46 },
      { dx: -58, dy: 6 },
      { dx: 58, dy: 6 },
    ];

    rows.slice(0, 3).forEach((row, i) => {
      const offset = offsets[i] ?? { dx: 0, dy: 0 };
      const wx = baseX + offset.dx;
      const wy = baseY + offset.dy;
      const accentColor = STATUE_RANK_COLOR[row.rank] ?? STATUE_RANK_COLOR[3];

      const glow = this.add.graphics().setDepth(11).setPosition(wx, wy);
      const body = this.add.graphics().setDepth(12).setPosition(wx, wy);
      this.drawStatueGraphics(body, accentColor);

      const label = this.add.text(wx, wy - 28, `#${row.rank} ${row.name}${row.isPlayer ? ' (You)' : ''}`, {
        fontFamily: '"Cinzel", serif',
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#1a1408',
        backgroundColor: `#${accentColor.toString(16).padStart(6, '0')}`,
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 1).setDepth(12.2);

      this.hallOfFameStatues.push({
        rank: row.rank, name: row.name, rep: row.rep, isPlayer: row.isPlayer,
        wx, wy, glow, body, label,
      });
    });
  }

  private despawnHallOfFameStatues() {
    if (this.hallOfFameStatues.length === 0) return;
    for (const s of this.hallOfFameStatues) {
      s.glow.destroy();
      s.body.destroy();
      s.label.destroy();
    }
    this.hallOfFameStatues = [];
    if (this.nearStatueRank !== null) {
      this.nearStatueRank = null;
      this.registry.set('nearStatue', null);
    }
  }

  /** Simple stone pedestal + bust — code-generated Graphics, same
   *  technique as every character/prop in the game. Deliberately plain
   *  stone-gray (not an outfit color) so the rank-colored glow/trim is
   *  what reads as "gold/silver/bronze", not the statue material. */
  private drawStatueGraphics(g: Phaser.GameObjects.Graphics, accentColor: number) {
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 19, 26, 7);

    g.fillStyle(0x2a2a2e);
    g.fillRoundedRect(-15, 6, 30, 13, 2);
    g.fillStyle(accentColor, 0.95);
    g.fillRect(-15, 6, 30, 2);

    g.fillStyle(0x9a9aa0);
    g.fillRoundedRect(-9, -10, 18, 18, 3);
    g.fillStyle(0x7a7a80, 0.6);
    g.fillRect(2, -10, 7, 18);

    g.fillStyle(0xaaaaae);
    g.fillCircle(0, -16, 7);
    g.fillStyle(0x7a7a80, 0.5);
    g.fillCircle(3, -15, 5);
  }

  /** Slow, calm pulse — statues are a permanent fixture, not a
   *  time-limited event marker, so the glow is gentler than the
   *  treasure chest/whale marker's. */
  private updateHallOfFameStatues() {
    if (this.hallOfFameStatues.length === 0) return;
    const t = this.animTick / 1000;
    const pulse = (Math.sin(t * 1.1) + 1) / 2;

    for (const s of this.hallOfFameStatues) {
      const accentColor = STATUE_RANK_COLOR[s.rank] ?? STATUE_RANK_COLOR[3];
      s.glow.clear();
      const glowA = 0.08 + pulse * 0.1;
      for (let r = 22; r > 0; r -= 5) {
        s.glow.fillStyle(accentColor, glowA * (1 - r / 22));
        s.glow.fillCircle(0, -4, r);
      }
      s.glow.setScale(1 + pulse * 0.1);
    }
  }

  /** Same E-key proximity pattern as the other markers — lowest
   *  priority of all of them (zones → NPCs → treasure → whale → statue),
   *  checked against whichever statue is nearest. */
  private updateStatueProximity() {
    if (this.hallOfFameStatues.length === 0) return;

    if (this.nearZoneId || this.nearNpcName || this.nearTreasure || this.nearWhale) {
      if (this.nearStatueRank !== null) {
        this.nearStatueRank = null;
        this.registry.set('nearStatue', null);
      }
      return;
    }

    let nearest: (typeof this.hallOfFameStatues)[number] | null = null;
    let nearestDist = STATUE_INTERACT_RADIUS;
    for (const s of this.hallOfFameStatues) {
      const dx = this.px - s.wx;
      const dy = this.py - s.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= nearestDist) {
        nearest = s;
        nearestDist = dist;
      }
    }

    const nearRank = nearest?.rank ?? null;
    if (nearRank !== this.nearStatueRank) {
      this.nearStatueRank = nearRank;
      this.registry.set('nearStatue', nearest ? { rank: nearest.rank, name: nearest.name } : null);
    }

    if (nearest && this.consumeInteractPress()) {
      this.events.emit('statue-interact', {
        rank: nearest.rank,
        name: nearest.name,
        rep: nearest.rep,
        isPlayer: nearest.isPlayer,
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     CROWD REACTION
     A second, larger wave of citizens reacting to a major-event moment
     — Town Crier announcing, or Whale Alert/Treasure Hunt/Fireworks/
     Dance Festival going Live. Reuses the same home/wanderRadius/state
     nudge technique as the existing (smaller) applyEventCitizenGather(),
     but with its own snapshot array and its own NPC sample (always
     excluding whoever that system already pulled in), so the two never
     collide over the same citizen.
     ═══════════════════════════════════════════════════════════ */

  /**
   * Pulls `count` citizens (not already part of the existing event-gather
   * sample) toward (wx, wy), each with a randomized offset/speed/timing
   * so the crowd reads as organic rather than a single-file line (req. 5),
   * plus a staggered "crowd reaction" speech bubble per citizen (req. 6).
   * Always reverts any previous crowd reaction first — only one is ever
   * active at a time.
   */
  private triggerCrowdReaction(wx: number, wy: number, count: number, spreadMin = 20, spreadMax = 100) {
    this.revertCrowdReaction();
    if (this.npcs.length === 0) return;

    const alreadyGathered = new Set(this.eventGatherSnapshot?.map(e => e.npc) ?? []);
    const pool = this.npcs.filter(n => !alreadyGathered.has(n));
    if (pool.length === 0) return;

    const sample = Phaser.Utils.Array.Shuffle(pool.slice()).slice(0, Math.min(count, pool.length));
    this.crowdReactionSnapshot = sample.map(npc => ({
      npc, homeX: npc.homeX, homeY: npc.homeY, wanderRadius: npc.wanderRadius,
    }));

    sample.forEach(npc => {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(spreadMin, spreadMax);
      npc.homeX = Phaser.Math.Clamp(wx + Math.cos(angle) * dist, CHAR_W, this.worldW - CHAR_W);
      npc.homeY = Phaser.Math.Clamp(wy + Math.sin(angle) * dist, CHAR_H, this.worldH - CHAR_H);
      npc.wanderRadius = 50;
      npc.state = 'walk';
      npc.targetX = npc.homeX;
      npc.targetY = npc.homeY;
      // Generous + randomized per-citizen — long enough for most to
      // actually arrive given their own (also randomized) speed, short
      // enough to naturally vary who gets there first.
      npc.stateTimer = Phaser.Math.Between(7000, 14000);

      this.time.delayedCall(Phaser.Math.Between(300, 3500), () => {
        const line = Phaser.Utils.Array.GetRandom(CROWD_REACTION_LINES);
        npc.speech.setText(line);
        npc.speech.setVisible(true);
        npc.speechShowUntil = NPC_SPEECH_DURATION;
      });
    });
  }

  private revertCrowdReaction() {
    if (!this.crowdReactionSnapshot) return;
    this.crowdReactionSnapshot.forEach(({ npc, homeX, homeY, wanderRadius }) => {
      npc.homeX = homeX;
      npc.homeY = homeY;
      npc.wanderRadius = wanderRadius;
      npc.state = 'pause';
      npc.stateTimer = Phaser.Math.Between(400, 1200);
    });
    this.crowdReactionSnapshot = null;
  }

  /** Dispatches the Live-phase crowd reaction for the 4 named events
   *  (req. 2/3/4) — every other event simply doesn't match any case, so
   *  it gets no crowd reaction beyond the existing small gather, if any. */
  private triggerLiveCrowdReaction(def: EventDefinition) {
    switch (def.id) {
      case 'whale-alert': {
        const whale = getWorldObject('whale');
        if (whale) {
          const { wx, wy } = toWorldPosition(whale, this.worldW, this.worldH);
          this.triggerCrowdReaction(wx, wy, 18);
        }
        break;
      }
      case 'treasure-hunt':
        if (this.treasureChest) {
          this.triggerCrowdReaction(this.treasureChest.wx, this.treasureChest.wy, 16);
        }
        break;
      case 'fireworks':
      case 'dance-festival':
        this.triggerCrowdReaction(this.plazaX, this.plazaY, 20);
        break;
      default:
        break;
    }
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
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP * 2, this.zoomMin, ZOOM_MAX);
    });
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT).on('down', () => {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP * 2, this.zoomMin, ZOOM_MAX);
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
    this.targetZoom = Phaser.Math.Clamp(z, this.zoomMin, ZOOM_MAX);
  }

  /**
   * "Reset camera" (the ⌂ button) — resets zoom back to default and
   * makes sure the camera is actively following the player again. Does
   * NOT move the player: the camera already centers on the player via
   * startFollow, so there's nothing else to "recenter". Deliberately
   * does not use panTo()/tweens, which animate the player's own
   * position and would fight live joystick/keyboard input.
   */
  resetCamera() {
    this.setTargetZoom(ZOOM_DEFAULT);
    // Unconditional re-affirm — idempotent (same target/values) when
    // follow was already active, and recovers it if it somehow wasn't.
    this.cameras.main.startFollow(this.player, true, CAM_LERP, CAM_LERP);
    this.cameras.main.setDeadzone(CAM_DEADZONE_X, CAM_DEADZONE_Y);
  }

  /**
   * Player outfit, chosen on the pre-game outfit-select screen. Safe to
   * call before or after create() — RugTownGame calls it right after
   * construction, before the Phaser.Game boots, so create()'s first
   * drawPlayer() already picks it up; also safe to call later (e.g. if
   * a future settings screen lets the player re-pick).
   */
  setOutfit(id: string) {
    this.outfitId = id;
    if (this.playerBody) this.drawPlayer();
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

  /**
   * Mobile virtual joystick — x/y each -1..1, combined magnitude already
   * clamped to <=1 by the caller. (0, 0) means "not touched", which is
   * the default and leaves keyboard movement completely unaffected.
   */
  setVirtualMove(x: number, y: number) {
    this.virtualMoveX = Phaser.Math.Clamp(x, -1, 1);
    this.virtualMoveY = Phaser.Math.Clamp(y, -1, 1);
  }

  /** Mobile interact button — same effect as a single E key press. */
  requestInteract() {
    this.virtualInteractRequested = true;
  }
}
