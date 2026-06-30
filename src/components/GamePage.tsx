import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RugTownGame } from '../game/RugTownGame';
import { WorldScene, NPC_SPEECH_BY_PERSONALITY, type NpcPersonality } from '../game/scenes/WorldScene';
import { getWorldObject, WORLD_OBJECTS } from '../game/world/WorldObjects';
import { soundManager, type SoundChannel } from '../audio/SoundManager';
import type { EventRarity, EventReward, EventLocation, EventPhase as EnginePhase } from '../game/events/EventTypes';
import { EVENT_DEFINITIONS } from '../game/events/EventDefinitions';

/*
  GamePage.tsx
  ────────────
  Mounts the Phaser canvas fullscreen with a React HUD overlay on top.

  Layout from Image 2 (gameplay-master):
  ┌──────────────────────────────────────────────────────────────────┐
  │ TOP-LEFT: logo + player card                                     │
  │ TOP-RIGHT: [not needed for world view]                           │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  LEFT SIDEBAR (narrow)    │  PHASER CANVAS  │  RIGHT SIDEBAR    │
  │  Player card              │  fills center   │  Minimap          │
  │  Quick stats              │                 │  Camera info      │
  │                           │                 │                   │
  ├──────────────────────────────────────────────────────────────────┤
  │ BOTTOM ACTION BAR — gold-bordered icon row (Image 2 bottom)      │
  └──────────────────────────────────────────────────────────────────┘

  UI style from Image 3 (ui-bible):
  - Dark near-black panels (#0a0c0e to #0d1117)
  - Thick gold borders with filigree/ornament corners
  - Gold header bars at top of each panel
  - Cinzel serif font for all headings
  - Gold shimmer on hover states
*/

/* ─── Types ─── */
interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface NearZone {
  id: string;
  name: string;
}

interface NearNpc {
  name: string;
}

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  kind: 'player' | 'npc' | 'event';
}

/* ─── Event HUD (Phase 2 Event Engine) ───
   Shape WorldScene publishes to the registry's 'currentEvent' key (see
   handleEventPhaseChange in WorldScene.ts) — a flattened, JSON-friendly
   snapshot of the engine's EventInstance, not the instance itself. Reusing
   the engine's own field types (EventRarity/EventReward/EventLocation)
   keeps this in sync with EventDefinitions.ts without duplicating them. */
interface RegistryCurrentEvent {
  id: string;
  title: string;
  description: string;
  rarity: EventRarity;
  phase: EnginePhase;
  phaseDuration: number;
  phaseStartedAt: number;
  reward: EventReward;
  location: EventLocation;
  dialogue: string | null;
  /** id of the event that chained into this one (Phase 4 Event Chain
   *  System), or null if it was picked the normal random way. */
  chainedFrom: string | null;
}

const EVENT_PHASE_LABELS: Record<EnginePhase, string> = {
  idle: 'Idle',
  countdown: 'Starting Soon',
  announcement: 'Announcement',
  live: 'Live Now',
  completed: 'Completed',
  cooldown: 'Cooldown',
};

function formatEventTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

/** One city-chat line per phase the event is worth announcing for —
 *  Idle/Cooldown are deliberately silent so the chat doesn't spam on
 *  every event's wind-down. */
function eventChatLine(evt: RegistryCurrentEvent): { icon: string; text: string } | null {
  switch (evt.phase) {
    case 'countdown':
      return { icon: '⏳', text: `${evt.title} is brewing near ${evt.location.displayName}...` };
    case 'announcement':
      return { icon: '📢', text: `Citizens of RugTown — ${evt.description}` };
    case 'live':
      return { icon: '🔥', text: `${evt.title} is live now at ${evt.location.displayName}!` };
    case 'completed':
      return {
        icon: '✅',
        text: evt.reward.type !== 'none' ? `${evt.title} has ended. Reward: ${evt.reward.label}` : `${evt.title} has ended.`,
      };
    default:
      return null;
  }
}

/* ─── Event Chain System (Phase 4) ───
   Fires once, the first time a chained event's countdown shows up, in
   addition to (not instead of) the normal eventChatLine() above — see
   the poll loop. `sourceTitle` is resolved from EVENT_DEFINITIONS by
   the chainedFrom id WorldScene published. ─── */
const CHAIN_TRIGGER_LINES: ((sourceTitle: string) => string)[] = [
  () => 'One event has triggered another...',
  (sourceTitle) => `The city reacts to the ${sourceTitle}.`,
  (sourceTitle) => `Word spreads fast after the ${sourceTitle}.`,
  () => 'The story of RugTown continues...',
];

/** Short "Today's Story" log line for an event reaching its Live phase
 *  — deliberately terser than eventChatLine()'s chat phrasing. Other
 *  phases don't get an automatic entry; the rest of the story log is
 *  filled in by player actions (treasure/whale claims). */
function storyLogLineForLive(evt: RegistryCurrentEvent): string {
  const verbs = ['started', 'began', 'is underway'];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  return `${evt.title} ${verb}`;
}

/* ─── Action bar items matching Image 2 bottom bar ─── */
const ACTION_BAR_ITEMS = [
  { icon: '💬', label: 'Chat',        key: 'C' },
  { icon: '😄', label: 'Emotes',      key: 'E' },
  { icon: '🎒', label: 'Inventory',   key: 'I' },
  { icon: '📋', label: 'Quests',      key: 'Q' },
  { icon: '🏆', label: 'Leaderboard', key: 'L' },
  { icon: '💎', label: 'Holder',      key: 'H' },
  { icon: '🗺️',  label: 'Map',         key: 'M' },
  { icon: '📜', label: 'Story',       key: '' },
  { icon: '⚙️',  label: 'Settings',    key: '' },
];

/* ─── Minimap landmark colors — keyed by WorldObject id, one source
   of truth (src/game/world/WorldObjects.ts) drives position/name/icon ─── */
const LANDMARK_COLORS: Record<string, string> = {
  fountain: '#e8b84b',
  market:   '#1ecbcb',
  fame:     '#b08cff',
  bridge:   '#8fd0ff',
  alpha:    '#ff6fae',
  whale:    '#1e88cc',
  notice:   '#ff9f43',
  coffee:   '#a0703c',
  park:     '#3ecf6e',
};

/* ─── Interaction zone modal content — flavor text only, no backend ─── */
const ZONE_INFO: Record<string, { title: string; sub: string }> = {
  fountain: { title: 'The Fountain',   sub: 'Make a wish, degen' },
  market:   { title: 'Meme Market',    sub: 'Where bags are made and lost' },
  bridge:   { title: 'The Bridge',     sub: 'Crossing into new districts' },
  fame:     { title: 'Hall of Fame',   sub: 'Legends of RugTown' },
  whale:    { title: 'Whale Tower',    sub: 'Watch the big wallets' },
};

const FAME_LEADERBOARD = [
  { rank: 1, name: 'WhaleGhost',     rep: 9420 },
  { rank: 2, name: 'AlphaAisha',     rep: 8110 },
  { rank: 3, name: 'ChartChad',      rep: 7325 },
  { rank: 4, name: 'LiquidityLarry', rep: 6040 },
];

/* ─── Local leaderboard — 8 fake NPC entries, no backend/real players.
   Separate dataset from FAME_LEADERBOARD (that one stays a 4-row Hall of
   Fame preview); this one is the full panel + the player's own row. ─── */
const LEADERBOARD_NPCS = [
  { name: 'WhaleGhost',     rep: 9420 },
  { name: 'AlphaAisha',     rep: 8110 },
  { name: 'ChartChad',      rep: 7325 },
  { name: 'LiquidityLarry', rep: 6040 },
  { name: 'MoonboyNPC',     rep: 4870 },
  { name: 'BagHolderBen',   rep: 3215 },
  { name: 'RugSlayerNPC',   rep: 2150 },
  { name: 'PumpGoblin',     rep: 980 },
];

const LEADERBOARD_TABS = ['Daily', 'Weekly', 'All Time'] as const;
type LeaderboardTab = (typeof LEADERBOARD_TABS)[number];

/* ─── Hall of Fame statue flavor — keyed by rank, not by identity, so it
   reads naturally whether the #1 spot is an NPC or the player (req. 12:
   no real users, nothing here is tied to a specific person). ─── */
const STATUE_RANK_FLAVOR: Record<number, { title: string; flavor: string }> = {
  1: { title: 'Hall of Fame Legend', flavor: 'Etched in gold for all of RugTown to remember.' },
  2: { title: 'Silver Standard', flavor: 'A close second, forever recognized.' },
  3: { title: 'Bronze Contender', flavor: 'Third place, but never forgotten.' },
};

/* ─── NPC dialogue — 3 flavor lines per citizen, no backend/AI ─── */
const NPC_DIALOGUE: Record<string, string[]> = {
  JeetBot:        ["I bought the top again.", "Sold the bottom last week.", "Red candles don't scare me... much."],
  PumpGoblin:     ["Meme Market is heating up.", "I can smell a pump coming.", "Buy first, ask questions later."],
  LiquidityLarry: ["Liquidity looks healthy today.", "Slippage is under control.", "Pools are looking deep tonight."],
  AlphaAisha:     ["Real alpha is patience.", "The best calls are quiet ones.", "Don't chase, let it come to you."],
  ChartChad:      ["That candle looks suspicious.", "This pattern never lies.", "Resistance is just a suggestion."],
  BagHolderBen:   ["I'm not selling until zero.", "Diamond hands, paper plans.", "It'll come back. It always does."],
  WhaleGhost:     ["Big wallets move quietly.", "I've seen things in the mempool.", "Watch the wallets, not the charts."],
  RugSlayerNPC:   ["Trust no dev.", "Always check the liquidity lock.", "If it sounds too good, it's a rug."],
  MoonboyNPC:     ["To the moon, eventually.", "Patience is the real rocket fuel.", "We're still early, probably."],
  DumpDemon:      ["Someone always exits first.", "Every pump needs a dump.", "I sell so you don't have to cry."],
};

/* ─── Inventory: badges + mock items — local-only, no NFT/wallet logic.
   Badge unlock triggers deliberately reuse the same state the quest
   system already watches (rep, fountainClaimed, nearZone, dialogue)
   rather than adding any new tracking to WorldScene or the quests. ─── */
interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const BADGES: Badge[] = [
  { id: 'first-rep',        name: 'First REP',       description: 'Earned your very first REP.',              icon: '⭐' },
  { id: 'fountain-visitor', name: 'Fountain Visitor', description: 'Claimed a reward from the Spawn Fountain.', icon: '⛲' },
  { id: 'market-scout',     name: 'Market Scout',     description: 'Scouted out the Meme Market.',              icon: '🛒' },
  { id: 'npc-talker',       name: 'NPC Talker',       description: 'Talked to a citizen of RugTown.',           icon: '💬' },
  { id: 'whale-watcher',    name: 'Whale Watcher',    description: 'Kept an eye on Whale Tower.',                icon: '🐳' },
  { id: 'treasure-finder',  name: 'Treasure Finder',  description: 'Found a hidden chest during a Treasure Hunt event.', icon: '🗝️' },
  { id: 'whale-watcher-plus', name: 'Whale Watcher+', description: 'Inspected a live Whale Alert event.', icon: '🐋' },
];

interface MockItem {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const MOCK_ITEMS: MockItem[] = [
  { id: 'city-pass',      name: 'City Pass',      description: 'Grants no real privileges. Looks official though.',    icon: '🪪' },
  { id: 'degen-notebook', name: 'Degen Notebook', description: 'Filled with half-finished alpha and worse spelling.', icon: '📓' },
  { id: 'empty-wallet',   name: 'Empty Wallet',   description: 'Technically still a wallet.',                          icon: '👛' },
];

const INVENTORY_TABS = ['Items', 'Badges'] as const;
type InventoryTab = (typeof INVENTORY_TABS)[number];

/* ─── District progression — local-only. Every unlock condition reuses
   state already tracked for quests/badges; nothing new is requested
   from WorldScene, and no movement is blocked. ─── */
interface District {
  id: string;
  name: string;
  description: string;
  requirement: string;
}

const DISTRICTS: District[] = [
  {
    id: 'spawn-plaza',
    name: 'Spawn Plaza',
    description: 'The fountain square where every degen starts their journey.',
    requirement: 'Unlocked by default',
  },
  {
    id: 'meme-market',
    name: 'Meme Market',
    description: 'Stalls trading the latest meme tokens.',
    requirement: 'Claim REP from the Spawn Fountain',
  },
  {
    id: 'hall-of-fame',
    name: 'Hall of Fame',
    description: "A monument to RugTown's top degens.",
    requirement: 'Visit Meme Market',
  },
  {
    id: 'whale-tower',
    name: 'Whale Tower',
    description: 'A watchtower for tracking large wallet movements.',
    requirement: 'Reach 20 REP',
  },
  {
    id: 'alpha-lounge',
    name: 'Alpha Lounge',
    description: 'An exclusive lounge for alpha calls and private chat.',
    requirement: 'Talk to any NPC',
  },
  {
    id: 'rug-alley',
    name: 'Rug Alley',
    description: 'A shadier corner of town — watch your wallet.',
    requirement: 'Check Whale Tower',
  },
  {
    id: 'holder-vault',
    name: 'Holder Vault',
    description: 'A Gold-tier-only vault preview.',
    requirement: 'Holder tier must be Gold',
  },
];

/** Districts that line up with a real WorldObject get a minimap highlight
 *  when unlocked (req. 5) — Rug Alley and Holder Vault aren't registered
 *  landmarks, so they simply don't get one. */
const WORLD_OBJECT_TO_DISTRICT: Record<string, string> = {
  fountain: 'spawn-plaza',
  market:   'meme-market',
  fame:     'hall-of-fame',
  whale:    'whale-tower',
  alpha:    'alpha-lounge',
};

/* ─── Player emotes — local-only. Each one shows a speech bubble above
   the player, plays a brief pop animation, and logs to chat. ─── */
interface Emote {
  id: string;
  label: string;
  icon: string;
}

const EMOTES: Emote[] = [
  { id: 'gm',            label: 'GM',            icon: '☀️' },
  { id: 'wave',          label: 'Wave',          icon: '👋' },
  { id: 'laugh',         label: 'Laugh',         icon: '😂' },
  { id: 'dance',         label: 'Dance',         icon: '💃' },
  { id: 'point',         label: 'Point',         icon: '👉' },
  { id: 'diamond-hands', label: 'Diamond Hands', icon: '💎' },
];

const EMOTE_BUBBLE_DURATION = 2500; // ms

/* ─── Starter quests — local-only progress tracking, no backend.
   Each quest's completion trigger reuses state GamePage already tracks
   for other features (fountain claim, zone proximity, NPC dialogue) —
   no new zones or WorldObjects entries needed. ─── */
type QuestStatus = 'in-progress' | 'ready' | 'claimed';

interface Quest {
  id: string;
  title: string;
  description: string;
  reward: number;
}

const QUESTS: Quest[] = [
  {
    id: 'fountain-claim',
    title: 'Claim REP from Spawn Fountain',
    description: 'Visit the fountain and claim your daily REP reward.',
    reward: 10,
  },
  {
    id: 'visit-market',
    title: 'Visit Meme Market',
    description: 'Head over to the Meme Market and see what tokens are trending.',
    reward: 5,
  },
  {
    id: 'talk-npc',
    title: 'Talk to any NPC',
    description: 'Find a citizen of RugTown and press E to talk.',
    reward: 5,
  },
  {
    id: 'check-whale',
    title: 'Check Whale Tower',
    description: 'Visit Whale Tower and keep an eye out for big wallets.',
    reward: 5,
  },
];

/* ─── Simulated Live City Events — local-only, no backend/API.
   Every 10-20s, one random event fires as a toast + chat message, and
   sometimes (not every time) also as a random NPC's speech bubble. ─── */
interface CityEventTemplate {
  type: string;
  icon: string;
  messages: string[];
}

const CITY_EVENTS: CityEventTemplate[] = [
  {
    type: 'Whale Alert',
    icon: '🐳',
    messages: [
      'Whale bought 218 SOL near Whale Tower',
      'Whale Alert: a 540 SOL wallet just woke up',
      'A whale is circling Whale Tower again',
    ],
  },
  {
    type: 'Meme Market Pump',
    icon: '📈',
    messages: [
      'Meme Market is pumping BONK +18%',
      'Meme Market is pumping WIF +24%',
      'Degens are aping into a new ticker at Meme Market',
    ],
  },
  {
    type: 'Rug Warning',
    icon: '⚠️',
    messages: [
      'Rug warning detected near Rug Alley',
      'Liquidity just vanished near Rug Alley — be careful',
      'Suspicious dev wallet movement spotted near Rug Alley',
    ],
  },
  {
    type: 'Alpha Call',
    icon: '🧠',
    messages: [
      'New alpha call posted from Alpha Lounge',
      'Alpha Lounge regulars are whispering about something big',
      'Fresh alpha just dropped in Alpha Lounge',
    ],
  },
  {
    type: 'Liquidity Update',
    icon: '💧',
    messages: [
      'Liquidity looks healthy today',
      'Liquidity pools are deeper than usual tonight',
      'Slippage across RugTown is looking tight today',
    ],
  },
  {
    type: 'Hall of Fame Update',
    icon: '🏛️',
    messages: [
      'New trader entered Hall of Fame',
      'Hall of Fame leaderboard just shuffled',
      'A new name is climbing the Hall of Fame ranks',
    ],
  },
];

const CITY_EVENT_MIN_GAP = 10000; // ms
const CITY_EVENT_MAX_GAP = 20000; // ms
const CITY_EVENT_NPC_SPEECH_CHANCE = 0.5;

/* ─── RugTown Citizens chat activity — local-only, no backend/AI.
   Separate from the per-citizen ambient speech bubbles WorldScene already
   forwards into chat (talking to themselves / reacting to events): this
   timer covers the other ways citizens keep the chat panel feeling alive
   — mentioning a nearby district, replying to another named citizen, or
   welcoming the player. Every line is posted with kind: 'npc', which the
   chat log always renders with a "[NPC]" tag — never presented as a real
   player, per the honesty rule. ─── */
const NPC_CHAT_ACTIVITY_MIN_GAP = 9000;  // ms
const NPC_CHAT_ACTIVITY_MAX_GAP = 19000; // ms

const NPC_DISTRICT_LINES: ((district: string) => string)[] = [
  (d) => `Anyone been to ${d} lately?`,
  (d) => `${d} is looking busy today`,
  (d) => `Heading toward ${d}, catch you later`,
  (d) => `Heard something's happening near ${d}`,
  (d) => `${d} never sleeps, does it`,
  (d) => `I keep ending up back at ${d}`,
];

const NPC_REPLY_LINES = [
  'Real talk.',
  "Couldn't agree more.",
  'Hah, classic.',
  'Not sure about that one, but okay.',
  'Same energy.',
  'Lol, fair point.',
  'I was just thinking that.',
  'Careful saying that out loud.',
  'Based take, honestly.',
  'You always say that.',
];

const NPC_WELCOME_LINES: ((name: string) => string)[] = [
  (name) => `Welcome to RugTown, ${name}.`,
  (name) => `New face in town — hey ${name}.`,
  (name) => `GM ${name}, watch your step around here.`,
  (name) => `${name} just walked in, don't mind us.`,
  (name) => `Don't get rugged on your first day, ${name}.`,
];

/* ─── Mock Holder tiers — local simulation only, no wallet/Solana calls.
   Toggling a tier just changes the REP multiplier applied to fountain
   and quest rewards. Clearly a devnet/mock preview, not real holdings. ─── */
type HolderTier = 'None' | 'Bronze' | 'Silver' | 'Gold';

const HOLDER_TIERS: { tier: HolderTier; multiplier: number }[] = [
  { tier: 'None',   multiplier: 1 },
  { tier: 'Bronze', multiplier: 1.2 },
  { tier: 'Silver', multiplier: 1.5 },
  { tier: 'Gold',   multiplier: 2 },
];

interface GamePageProps {
  /** Name chosen on the landing page's guest-entry screen */
  playerName?: string;
  /** Outfit chosen on the pre-game outfit-select screen (CharacterStyles.ts id) */
  outfitId?: string;
}

/* ─── Component ─── */
export function GamePage({ playerName, outfitId }: GamePageProps) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const gameRef    = useRef<RugTownGame | null>(null);
  const sceneRef   = useRef<WorldScene | null>(null);

  const [ready,  setReady]  = useState(false);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 0.85 });
  const [worldSize, setWorldSize] = useState({ w: 3840, h: 2160 });
  const [bgMissing, setBgMissing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  /* ── RugTown Citizens population — randomized per session by WorldScene
     (40-60), published once via the registry. Honesty rule: these are
     NPCs, never presented as real players. ── */
  const [npcCount, setNpcCount] = useState(0);
  const [npcNames, setNpcNames] = useState<string[]>([]);

  /* ── Interaction zones ── */
  const [nearZone, setNearZone] = useState<NearZone | null>(null);
  const [modalZone, setModalZone] = useState<string | null>(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [rep, setRep] = useState(0);
  const [fountainClaimed, setFountainClaimed] = useState(false);
  const [rewardFlash, setRewardFlash] = useState(0);

  /* ── NPC dialogue ── */
  const [nearNpc, setNearNpc] = useState<NearNpc | null>(null);
  const [dialogue, setDialogue] = useState<{ npcName: string; line: string } | null>(null);
  const [dialogueClosing, setDialogueClosing] = useState(false);

  /* ── Event HUD (Phase 2 Event Engine) — read-only from the registry,
     WorldScene/EventManager own all the actual lifecycle state. ── */
  const [eventPhase, setEventPhase] = useState<EnginePhase>('idle');
  const [currentEvent, setCurrentEvent] = useState<RegistryCurrentEvent | null>(null);
  const [eventTimeRemaining, setEventTimeRemaining] = useState(0);
  const lastEventChatKeyRef = useRef<string | null>(null);
  const lastChainAnnouncedKeyRef = useRef<string | null>(null);

  /* ── "Today's Story" log (Phase 4 Event Chain System) — a rolling
     window of the last 5 notable moments (event phase starts + player
     claims). Local-only React state, nothing persisted, nothing sent
     anywhere. ── */
  const [storyLog, setStoryLog] = useState<{ id: number; text: string }[]>([]);
  const storyLogIdRef = useRef(0);
  const pushStoryLog = useCallback((text: string) => {
    setStoryLog(prev => {
      const next = [...prev, { id: ++storyLogIdRef.current, text }];
      return next.length > 5 ? next.slice(next.length - 5) : next;
    });
  }, []);

  /* ── Treasure Hunt chest — read-only from the registry; WorldScene owns
     spawn/despawn/claim-gating, this just mirrors it for the HUD/minimap. ── */
  const [treasureChest, setTreasureChest] = useState<{ wx: number; wy: number } | null>(null);
  const [nearTreasure, setNearTreasure] = useState(false);
  const [treasureClaim, setTreasureClaim] = useState<{ claimId: number; amount: number; label: string } | null>(null);
  const treasureClaimIdRef = useRef(0);

  /* ── Whale Alert marker — same read-only-mirror pattern as the chest
     above; WorldScene owns spawn/despawn/claim-gating. ── */
  const [whaleMarker, setWhaleMarker] = useState<{ wx: number; wy: number } | null>(null);
  const [nearWhale, setNearWhale] = useState(false);
  const [whaleAlert, setWhaleAlert] = useState<{
    wallet: string; buySol: number; tokenSymbol: string; riskLevel: string; rewardLabel: string;
  } | null>(null);
  const [whaleAlertClosing, setWhaleAlertClosing] = useState(false);
  const [whaleClaim, setWhaleClaim] = useState<{ claimId: number; amount: number; label: string } | null>(null);
  const whaleClaimIdRef = useRef(0);

  /* ── Hall of Fame statues — permanent fixture, not event-driven. No
     claim/reward (unlike the chest/whale), so there's no *Claim state —
     just the proximity mirror and the inspect modal. ── */
  const [nearStatue, setNearStatue] = useState<{ rank: number; name: string } | null>(null);
  const [statueModal, setStatueModal] = useState<{ rank: number; name: string; rep: number; isPlayer: boolean } | null>(null);
  const [statueModalClosing, setStatueModalClosing] = useState(false);

  /* ── Local city chat (frontend-only, no backend) ── */
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatLogRef   = useRef<HTMLDivElement>(null);
  const chatMsgIdRef = useRef(0);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const isChatOpen = activeAction === 'Chat';

  /* ── Quests (frontend-only, no backend) ── */
  const announcedQuestsRef = useRef<Set<string>>(new Set());
  const toastIdRef = useRef(0);
  const [questStatus, setQuestStatus] = useState<Record<string, QuestStatus>>(
    () => Object.fromEntries(QUESTS.map(q => [q.id, 'in-progress' as QuestStatus]))
  );
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const isQuestsOpen = activeAction === 'Quests';

  const showToast = useCallback((text: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  /* ── Mock Holder tier ── */
  const [holderTier, setHolderTier] = useState<HolderTier>('None');
  const [tierJustChanged, setTierJustChanged] = useState(false);
  const isHolderOpen = activeAction === 'Holder';

  /* ── "Today's Story" log panel (Phase 4 Event Chain System) ── */
  const isStoryOpen = activeAction === 'Story';

  const holderMultiplier = HOLDER_TIERS.find(t => t.tier === holderTier)?.multiplier ?? 1;
  const applyHolderMultiplier = useCallback(
    (base: number) => Math.round(base * holderMultiplier),
    [holderMultiplier]
  );

  /* ── Local leaderboard — recomputed from current REP, so the player's
     row always sorts to its correct position as REP changes. Tabs are
     cosmetic for now (req. 7) — all three show the same local data. ── */
  const isLeaderboardOpen = activeAction === 'Leaderboard';
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('Daily');
  const leaderboardRows = [
    ...LEADERBOARD_NPCS.map(e => ({ name: e.name, rep: e.rep, isPlayer: false })),
    { name: playerName || 'DegenExplorer', rep, isPlayer: true },
  ]
    .sort((a, b) => b.rep - a.rep)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  /* ── Hall of Fame statues — WorldScene renders the actual markers near
     the 'fame' landmark, but it has no leaderboard data of its own, so
     GamePage pushes the top 3 rows (same data as the Leaderboard panel
     above) every time they actually change. The ref-based JSON guard
     just avoids redundant Graphics rebuilds on every ~100ms poll tick. ── */
  const hallOfFameTop3JsonRef = useRef('');
  useEffect(() => {
    if (!ready) return;
    const top3 = leaderboardRows.slice(0, 3).map(r => ({ rank: r.rank, name: r.name, rep: r.rep, isPlayer: r.isPlayer }));
    const json = JSON.stringify(top3);
    if (json === hallOfFameTop3JsonRef.current) return;
    hallOfFameTop3JsonRef.current = json;
    sceneRef.current?.setHallOfFameStatues(top3);
  }, [ready, leaderboardRows]);

  /* ── Local sound system — WebAudio-only, starts muted. The first
     pointerdown/keydown anywhere unlocks it (also satisfies browser
     autoplay policy, which blocks audio before a user gesture anyway). ── */
  const isSettingsOpen = activeAction === 'Settings';
  const [muted, setMutedState] = useState(true);
  const [musicVol, setMusicVol] = useState(soundManager.getVolume('music'));
  const [ambienceVol, setAmbienceVol] = useState(soundManager.getVolume('ambience'));
  const [effectsVol, setEffectsVol] = useState(soundManager.getVolume('effects'));

  /* ── Settings panel: fullscreen + collision debug ── */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collisionDebugOn, setCollisionDebugOn] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    // Both return Promises that can reject (e.g. denied, or no longer in
    // an active gesture) — swallow that instead of leaving an unhandled
    // rejection in the console.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const toggleCollisionDebug = useCallback(() => {
    sceneRef.current?.setCollisionDebugVisible(!collisionDebugOn);
  }, [collisionDebugOn]);

  useEffect(() => {
    const unlock = () => {
      soundManager.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const toggleMuted = useCallback(() => {
    setMutedState(prev => {
      const next = !prev;
      soundManager.setMuted(next);
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((channel: SoundChannel, value: number) => {
    soundManager.setVolume(channel, value);
    if (channel === 'music') setMusicVol(value);
    else if (channel === 'ambience') setAmbienceVol(value);
    else setEffectsVol(value);
  }, []);

  /* ── Inventory: badges + mock items ── */
  const isInventoryOpen = activeAction === 'Inventory';
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>('Items');
  const announcedBadgesRef = useRef<Set<string>>(new Set());
  const [badgeStatus, setBadgeStatus] = useState<Record<string, 'locked' | 'unlocked'>>(
    () => Object.fromEntries(BADGES.map(b => [b.id, 'locked' as const]))
  );

  // Idempotent — safe to call repeatedly, same pattern as markQuestReady.
  const unlockBadge = useCallback((id: string) => {
    setBadgeStatus(prev => (prev[id] === 'locked' ? { ...prev, [id]: 'unlocked' } : prev));
    if (!announcedBadgesRef.current.has(id)) {
      announcedBadgesRef.current.add(id);
      const badge = BADGES.find(b => b.id === id);
      if (badge) showToast(`🏅 Badge unlocked: ${badge.name}`);
    }
  }, [showToast]);

  /* ── District progression ── */
  const isMapOpen = activeAction === 'Map';
  const announcedDistrictsRef = useRef<Set<string>>(new Set());
  const wasGoldRef = useRef(false);
  const [districtUnlocked, setDistrictUnlocked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DISTRICTS.map(d => [d.id, d.id === 'spawn-plaza']))
  );

  // Sticky — once unlocked, stays unlocked (same idempotent pattern as
  // quests/badges). Holder Vault is the one exception, handled below.
  const unlockDistrict = useCallback((id: string) => {
    setDistrictUnlocked(prev => (prev[id] ? prev : { ...prev, [id]: true }));
    if (!announcedDistrictsRef.current.has(id)) {
      announcedDistrictsRef.current.add(id);
      const district = DISTRICTS.find(d => d.id === id);
      if (district) showToast(`🗺️ District unlocked: ${district.name}`);
    }
  }, [showToast]);

  const setHolderTierAndNotify = useCallback((tier: HolderTier) => {
    if (tier === holderTier) return;
    const mult = HOLDER_TIERS.find(t => t.tier === tier)?.multiplier ?? 1;
    setHolderTier(tier);
    showToast(`Holder tier set to ${tier} (${mult}x REP) — MOCK`);
    setTierJustChanged(true);
    setTimeout(() => setTierJustChanged(false), 900);
  }, [holderTier, showToast]);

  // Marks a quest "ready to claim" the first time its trigger fires.
  // Idempotent — safe to call repeatedly (e.g. walking in/out of a zone).
  const markQuestReady = useCallback((id: string) => {
    setQuestStatus(prev => (prev[id] === 'in-progress' ? { ...prev, [id]: 'ready' } : prev));
    if (!announcedQuestsRef.current.has(id)) {
      announcedQuestsRef.current.add(id);
      const quest = QUESTS.find(q => q.id === id);
      if (quest) showToast(`Quest complete: ${quest.title}`);
      soundManager.play('quest');
    }
  }, [showToast]);

  const claimQuestReward = useCallback((id: string) => {
    // Guard on the actual current status (not just the state updater) so
    // the REP/flash/effect below can never fire twice for the same quest.
    if (questStatus[id] !== 'ready') return;
    const quest = QUESTS.find(q => q.id === id);
    if (!quest) return;
    const amount = applyHolderMultiplier(quest.reward);
    setQuestStatus(prev => ({ ...prev, [id]: 'claimed' }));
    setRep(r => r + amount);
    setRewardFlash(k => k + 1);
    sceneRef.current?.playRewardEffect(`+${amount} REP`);
    soundManager.play('reward');
  }, [questStatus, applyHolderMultiplier]);

  const appendChatMessage = useCallback((sender: string, text: string, kind: ChatMessage['kind']) => {
    setChatMessages(prev => {
      const next = [...prev, { id: ++chatMsgIdRef.current, sender, text, kind }];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, []);

  /* ── Boot Phaser ── */
  useEffect(() => {
    if (!mountRef.current) return;

    // React.StrictMode (dev only) mounts -> cleans up -> mounts this effect
    // again. RugTownGame's onReady fires asynchronously, so the first,
    // already-destroyed instance's callback can resolve after cleanup and
    // clobber the refs below with a torn-down scene. `cancelled` blocks that.
    let cancelled = false;

    const game = new RugTownGame({
      parentId: 'phaser-mount',
      outfitId,
      onReady: (scene: WorldScene) => {
        if (cancelled) return;
        sceneRef.current = scene;
        setReady(true);
        setWorldSize(scene.getWorldSize());

        // Read bgMissing flag from registry
        const missing = scene.game?.registry?.get('bgMissing') ?? false;
        setBgMissing(missing);

        // RugTown Citizens population is randomized per session by
        // WorldScene (createNpcs) and published once — read it here so
        // the HUD/chat-activity simulator never hardcode a fixed count.
        const count = scene.game?.registry?.get('npcCount') ?? 0;
        const names: string[] = scene.game?.registry?.get('npcNames') ?? [];
        setNpcCount(count);
        setNpcNames(names);

        // Phaser-side E press near a zone — open the matching modal.
        // Landmark interactions take priority, so also dismiss any open
        // NPC dialogue rather than stacking both overlays.
        scene.events.on('zone-interact', (zone: NearZone) => {
          if (cancelled) return;
          setDialogueClosing(false);
          setDialogue(null);
          setModalClosing(false);
          setModalZone(zone.id);
          setActiveAction(null); // only one overlay open at a time
          setWhaleAlertClosing(false);
          setWhaleAlert(null);
          setStatueModalClosing(false);
          setStatueModal(null);
          soundManager.play('modal');
        });

        // Phaser-side E press near an NPC — open a dialogue line.
        // WorldScene won't emit this while a landmark zone is active, but
        // clear any (stale) open modal too, just in case of a fast switch.
        scene.events.on('npc-interact', (npc: NearNpc & { personality?: NpcPersonality }) => {
          if (cancelled) return;
          // Original 10 citizens keep their hand-written flavor lines;
          // every other citizen (the expanded 40-60 population) falls
          // back to their personality's ambient speech pool so everyone
          // has something to say, not just the original names.
          const lines = NPC_DIALOGUE[npc.name] ?? (npc.personality ? NPC_SPEECH_BY_PERSONALITY[npc.personality] : null);
          if (!lines || lines.length === 0) return;
          setModalClosing(false);
          setModalZone(null);
          setDialogueClosing(false);
          setDialogue({ npcName: npc.name, line: lines[Math.floor(Math.random() * lines.length)] });
          setActiveAction(null); // only one overlay open at a time
          setWhaleAlertClosing(false);
          setWhaleAlert(null);
          setStatueModalClosing(false);
          setStatueModal(null);
          soundManager.play('modal');
        });

        // NPCs occasionally post their ambient speech-bubble line into chat
        scene.events.on('npc-chat', (msg: { name: string; text: string }) => {
          if (cancelled) return;
          appendChatMessage(msg.name, msg.text, 'npc');
        });

        // Treasure Hunt chest opened — WorldScene has already destroyed the
        // chest (so a double-claim is impossible) and computed the reward
        // from the live event state. This just records the claim; the
        // actual REP/badge/chat side effects run in the effect below, which
        // always reads fresh playerName/holderMultiplier (this listener is
        // registered once, so it must not read that state directly).
        scene.events.on('treasure-interact', (payload: { rewardAmount: number; rewardLabel: string }) => {
          if (cancelled) return;
          setTreasureClaim({ claimId: ++treasureClaimIdRef.current, amount: payload.rewardAmount, label: payload.rewardLabel });
        });

        // Whale Alert marker inspected — same one-shot-claim guarantee as
        // the treasure chest (WorldScene destroyed the marker before
        // emitting). Opens the Whale Alert modal AND records the claim;
        // the modal is purely a flavor/transparency display, the actual
        // REP/badge/chat side effects run in the effect below so they
        // always read fresh playerName/holderMultiplier.
        scene.events.on('whale-interact', (payload: {
          wallet: string; buySol: number; tokenSymbol: string; riskLevel: string; rewardAmount: number; rewardLabel: string;
        }) => {
          if (cancelled) return;
          setDialogueClosing(false);
          setDialogue(null);
          setModalClosing(false);
          setModalZone(null);
          setActiveAction(null); // only one overlay open at a time
          setWhaleAlertClosing(false);
          setWhaleAlert({
            wallet: payload.wallet,
            buySol: payload.buySol,
            tokenSymbol: payload.tokenSymbol,
            riskLevel: payload.riskLevel,
            rewardLabel: payload.rewardLabel,
          });
          setStatueModalClosing(false);
          setStatueModal(null);
          setWhaleClaim({ claimId: ++whaleClaimIdRef.current, amount: payload.rewardAmount, label: payload.rewardLabel });
          soundManager.play('modal');
        });

        // Town Crier shows up for any event's Announcement phase — purely
        // a chat-message hook here, the character itself is entirely
        // WorldScene-rendered (no proximity prompt/modal, nothing to
        // claim). The bell sound already played in WorldScene at spawn.
        scene.events.on('town-crier-announce', (payload: { title: string }) => {
          if (cancelled) return;
          appendChatMessage('Town Crier', `🔔 Town Crier announces: ${payload.title}`, 'event');
        });

        // Hall of Fame statue inspected — no claim/reward (statues are a
        // permanent fixture, not a one-shot event pickup), just opens the
        // inspect modal and posts a chat message. Clears every other
        // overlay first, same exclusivity rule as the others above.
        scene.events.on('statue-interact', (payload: { rank: number; name: string; rep: number; isPlayer: boolean }) => {
          if (cancelled) return;
          setDialogueClosing(false);
          setDialogue(null);
          setModalClosing(false);
          setModalZone(null);
          setActiveAction(null);
          setWhaleAlertClosing(false);
          setWhaleAlert(null);
          setStatueModalClosing(false);
          setStatueModal(payload);
          soundManager.play('modal');
          const inspectorName = playerName || 'DegenExplorer';
          appendChatMessage(
            'City Feed',
            `🏛️ ${inspectorName} inspected the #${payload.rank} statue — ${payload.name}.`,
            'event'
          );
        });
      },
    });

    gameRef.current = game;

    /* Poll camera + zone-proximity state from Phaser registry */
    const poll = setInterval(() => {
      if (cancelled || !sceneRef.current) return;
      const reg = sceneRef.current.game?.registry;
      if (!reg) return;
      setCamera({
        x:    reg.get('camX') ?? 0,
        y:    reg.get('camY') ?? 0,
        zoom: reg.get('zoom') ?? 0.85,
      });
      setNearZone(reg.get('nearZone') ?? null);
      setNearNpc(reg.get('nearNpc') ?? null);
      setCollisionDebugOn(reg.get('collisionDebug') ?? false);

      // Event HUD — read-only registry poll, same pattern as everything
      // else above. WorldScene/EventManager remain the only source of
      // truth for the lifecycle; this just mirrors it into React state.
      const evt: RegistryCurrentEvent | null = reg.get('currentEvent') ?? null;
      const phase: EnginePhase = reg.get('eventPhase') ?? 'idle';
      setEventPhase(phase);
      setCurrentEvent(evt);
      setEventTimeRemaining(evt ? Math.max(0, evt.phaseDuration - (Date.now() - evt.phaseStartedAt)) : 0);

      if (evt) {
        // Fire the chat line (+ toast/sound for the bigger beats) exactly
        // once per phase, not once per 100ms poll tick.
        const key = `${evt.id}:${evt.phase}`;
        if (lastEventChatKeyRef.current !== key) {
          lastEventChatKeyRef.current = key;
          const line = eventChatLine(evt);
          if (line) {
            appendChatMessage('City Feed', `${line.icon} ${line.text}`, 'event');
            if (evt.phase === 'live') {
              showToast(`${line.icon} ${evt.title} is live!`);
              soundManager.play('event');
              // "Today's Story" only logs the moment an event actually
              // starts — claims (treasure/whale) add their own entries
              // separately, in their respective claim effects below.
              pushStoryLog(storyLogLineForLive(evt));
            } else if (evt.phase === 'announcement') {
              soundManager.play('event');
            }
          }
        }

        // Event Chain System (Phase 4) — Countdown is always a brand new
        // event instance's first phase, so this fires exactly once per
        // chained event, the moment it's first seen (same dedup key as
        // above, just a different condition).
        if (evt.phase === 'countdown' && evt.chainedFrom && lastChainAnnouncedKeyRef.current !== key) {
          lastChainAnnouncedKeyRef.current = key;
          const sourceDef = EVENT_DEFINITIONS.find(d => d.id === evt.chainedFrom);
          const sourceTitle = sourceDef?.title ?? 'previous event';
          const lineFn = CHAIN_TRIGGER_LINES[Math.floor(Math.random() * CHAIN_TRIGGER_LINES.length)];
          appendChatMessage('City Feed', `🔗 ${lineFn(sourceTitle)}`, 'event');
        }
      } else {
        lastEventChatKeyRef.current = null;
        lastChainAnnouncedKeyRef.current = null;
      }

      // Treasure Hunt chest — read-only mirror for the minimap marker and
      // the "Press E to open treasure" prompt below.
      setTreasureChest(reg.get('treasureChest') ?? null);
      setNearTreasure(reg.get('nearTreasure') ?? false);

      // Whale Alert marker — read-only mirror for the minimap marker and
      // the "Press E to inspect whale" prompt below.
      setWhaleMarker(reg.get('whaleMarker') ?? null);
      setNearWhale(reg.get('nearWhale') ?? false);

      // Hall of Fame statues — read-only mirror for the "Press E to
      // inspect statue" prompt below (the statues themselves are pushed
      // the other direction, GamePage → WorldScene, in the leaderboard
      // effect above).
      setNearStatue(reg.get('nearStatue') ?? null);
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(poll);
      game.destroy();
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  /* ── HUD keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack action-bar shortcuts while typing in a text field
      // (the chat input, namely) — typing "chat" would otherwise toggle
      // half the action bar.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const hud = ACTION_BAR_ITEMS.find(a => a.key === e.key.toUpperCase());
      if (!hud) return;
      // Keep only one overlay on screen at a time — a landmark modal or
      // NPC dialogue takes priority and shouldn't keep running underneath
      // a HUD panel opened by its own shortcut.
      setModalClosing(false);
      setModalZone(null);
      setDialogueClosing(false);
      setDialogue(null);
      setWhaleAlertClosing(false);
      setWhaleAlert(null);
      setStatueModalClosing(false);
      setStatueModal(null);
      setActiveAction(prev => prev === hud.label ? null : hud.label);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Zoom buttons from HUD ── */
  const zoomIn  = useCallback(() => sceneRef.current?.setTargetZoom(camera.zoom + 0.15), [camera.zoom]);
  const zoomOut = useCallback(() => sceneRef.current?.setTargetZoom(camera.zoom - 0.15), [camera.zoom]);
  const resetView = useCallback(() => {
    // Resets zoom and re-affirms camera follow — does NOT move the
    // player. panTo() animates the player's own position via a tween,
    // which fights live joystick/keyboard input every frame it's
    // running; that was the cause of the "reset teleports player and
    // breaks controls" bug.
    sceneRef.current?.resetCamera();
  }, []);

  /* ── Mobile layout ──
     isMobile drives the virtual joystick/interact button (touch-only
     controls that make no sense on desktop) and which side panels are
     collapsed into small toggle buttons. Matches the existing ≤600px
     CSS breakpoint that already adapts the rest of the HUD. */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600);
  const [mobilePlayerCardOpen, setMobilePlayerCardOpen] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // If the viewport grows back past the mobile breakpoint mid-touch,
  // make sure the player doesn't keep drifting in the last direction.
  useEffect(() => {
    if (!isMobile) sceneRef.current?.setVirtualMove(0, 0);
  }, [isMobile]);

  /* ── Virtual joystick (movement) — Pointer Events cover touch/mouse/pen
     with one set of handlers; setPointerCapture keeps tracking the same
     finger even if it drifts outside the joystick base. ── */
  const JOYSTICK_RADIUS = 42; // px, matches .mobile-joystick CSS size
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });

  const updateJoystickFromPointer = useCallback((clientX: number, clientY: number) => {
    const base = joystickBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    setJoystickKnob({ x: dx, y: dy });
    sceneRef.current?.setVirtualMove(dx / JOYSTICK_RADIUS, dy / JOYSTICK_RADIUS);
  }, []);

  const endJoystick = useCallback(() => {
    joystickPointerIdRef.current = null;
    setJoystickKnob({ x: 0, y: 0 });
    sceneRef.current?.setVirtualMove(0, 0);
  }, []);

  const handleJoystickPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    joystickPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateJoystickFromPointer(e.clientX, e.clientY);
  }, [updateJoystickFromPointer]);

  const handleJoystickPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateJoystickFromPointer(e.clientX, e.clientY);
  }, [updateJoystickFromPointer]);

  const handleJoystickPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== e.pointerId) return;
    endJoystick();
  }, [endJoystick]);

  /* ── Mobile interact button — same effect as one E key press ── */
  const handleMobileInteract = useCallback(() => {
    sceneRef.current?.requestInteract();
  }, []);

  /* ── Interaction zone modal ──
     Closing plays a short exit animation before the modal actually
     unmounts — requestCloseModal triggers it, the effect below clears
     modalZone once the animation has had time to finish. */
  const requestCloseModal = useCallback(() => {
    setModalClosing(true);
  }, []);

  useEffect(() => {
    if (!modalClosing) return;
    const t = setTimeout(() => {
      setModalZone(null);
      setModalClosing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [modalClosing]);

  /* ── ESC closes an open modal ── */
  useEffect(() => {
    if (!modalZone) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalZone, requestCloseModal]);

  /* ── NPC dialogue — same open/close-animation pattern as the modal ── */
  const requestCloseDialogue = useCallback(() => {
    setDialogueClosing(true);
  }, []);

  useEffect(() => {
    if (!dialogueClosing) return;
    const t = setTimeout(() => {
      setDialogue(null);
      setDialogueClosing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [dialogueClosing]);

  /* ── ESC closes an open dialogue ── */
  useEffect(() => {
    if (!dialogue) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseDialogue();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialogue, requestCloseDialogue]);

  /* ── Whale Alert modal — same open/close-animation pattern as the
     landmark modal/NPC dialogue above. Note: closing this does NOT
     re-grant or revoke REP — that already happened once, synchronously,
     when the marker was inspected (see the whaleClaim effect). ── */
  const requestCloseWhaleAlert = useCallback(() => {
    setWhaleAlertClosing(true);
  }, []);

  useEffect(() => {
    if (!whaleAlertClosing) return;
    const t = setTimeout(() => {
      setWhaleAlert(null);
      setWhaleAlertClosing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [whaleAlertClosing]);

  /* ── ESC closes an open Whale Alert modal ── */
  useEffect(() => {
    if (!whaleAlert) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseWhaleAlert();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [whaleAlert, requestCloseWhaleAlert]);

  /* ── Hall of Fame statue modal — same open/close-animation pattern as
     the others. Nothing to grant on close (or open) — statues have no
     reward, just a flavor inspect + chat message, already fired the
     moment the scene event arrived. ── */
  const requestCloseStatueModal = useCallback(() => {
    setStatueModalClosing(true);
  }, []);

  useEffect(() => {
    if (!statueModalClosing) return;
    const t = setTimeout(() => {
      setStatueModal(null);
      setStatueModalClosing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [statueModalClosing]);

  /* ── ESC closes an open Hall of Fame statue modal ── */
  useEffect(() => {
    if (!statueModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseStatueModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [statueModal, requestCloseStatueModal]);

  /* ── Chat panel ── */
  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    appendChatMessage(playerName || 'DegenExplorer', text, 'player');
    setChatInput('');
    sceneRef.current?.showPlayerSpeech(text);
    soundManager.play('chatSend');
  }, [chatInput, playerName, appendChatMessage]);

  const handleChatInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendChatMessage();
  }, [sendChatMessage]);

  /* ── Emotes ── */
  const isEmotesOpen = activeAction === 'Emotes';

  const triggerEmote = useCallback((emote: Emote) => {
    sceneRef.current?.showPlayerSpeech(`${emote.icon} ${emote.label}`, EMOTE_BUBBLE_DURATION);
    sceneRef.current?.playEmoteAnimation();
    appendChatMessage(playerName || 'DegenExplorer', `used ${emote.label}`, 'player');
  }, [playerName, appendChatMessage]);

  // ESC closes whichever action-bar panel is open — Chat, Quests, Holder,
  // Leaderboard, Settings, Inventory, and Emotes all share `activeAction`.
  // (Blurring the chat input, if focused, also lets WorldScene's keyboard
  // re-enable via the input's own onBlur.)
  useEffect(() => {
    if (!activeAction) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveAction(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeAction]);

  // Keep the log scrolled to the newest message
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const claimFountainReward = useCallback(() => {
    if (fountainClaimed) return;
    const amount = applyHolderMultiplier(5);
    setRep(r => r + amount);
    setFountainClaimed(true);
    setRewardFlash(k => k + 1);
    sceneRef.current?.playRewardEffect(`+${amount} REP`);
    soundManager.play('reward');
  }, [fountainClaimed, applyHolderMultiplier]);

  /* ── Quest auto-completion — each just watches state GamePage already
     tracks for other features; nothing new is requested from WorldScene. ── */
  useEffect(() => {
    if (fountainClaimed) markQuestReady('fountain-claim');
  }, [fountainClaimed, markQuestReady]);

  useEffect(() => {
    if (nearZone?.id === 'market') markQuestReady('visit-market');
  }, [nearZone, markQuestReady]);

  useEffect(() => {
    if (dialogue) markQuestReady('talk-npc');
  }, [dialogue, markQuestReady]);

  useEffect(() => {
    if (nearZone?.id === 'whale') markQuestReady('check-whale');
  }, [nearZone, markQuestReady]);

  /* ── Badge unlocks — same trigger state as the quests above, reused
     as-is (no changes to quest logic), just driving a separate badge
     unlock list instead. ── */
  useEffect(() => {
    if (rep > 0) unlockBadge('first-rep');
  }, [rep, unlockBadge]);

  useEffect(() => {
    if (fountainClaimed) unlockBadge('fountain-visitor');
  }, [fountainClaimed, unlockBadge]);

  useEffect(() => {
    if (nearZone?.id === 'market') unlockBadge('market-scout');
  }, [nearZone, unlockBadge]);

  useEffect(() => {
    if (dialogue) unlockBadge('npc-talker');
  }, [dialogue, unlockBadge]);

  useEffect(() => {
    if (nearZone?.id === 'whale') unlockBadge('whale-watcher');
  }, [nearZone, unlockBadge]);

  /* ── Treasure Hunt claim — fires once per claimId (WorldScene already
     guarantees a chest can only ever be claimed once, by destroying it
     synchronously before emitting 'treasure-interact'). Lives in an
     effect rather than directly in the scene-event listener above so it
     always reads fresh playerName/holderMultiplier/showToast instead of
     whatever they were when the listener was registered. ── */
  useEffect(() => {
    if (!treasureClaim) return;
    const amount = applyHolderMultiplier(treasureClaim.amount);
    setRep(r => r + amount);
    setRewardFlash(k => k + 1);
    sceneRef.current?.playRewardEffect(`+${amount} REP`);
    soundManager.play('reward');
    unlockBadge('treasure-finder');
    const name = playerName || 'DegenExplorer';
    appendChatMessage('City Feed', `🏆 ${name} found the treasure!`, 'event');
    showToast(`🏆 Treasure found! +${amount} REP`);
    pushStoryLog(`${name} found the treasure`);
  }, [treasureClaim, applyHolderMultiplier, unlockBadge, appendChatMessage, playerName, showToast, pushStoryLog]);

  /* ── Whale Alert claim — same one-shot pattern as the treasure claim
     above (WorldScene destroys the marker before emitting, so this only
     ever fires once per event). "Inspecting" the whale (the E press,
     which already opened the modal in the listener above) is what grants
     the REP — not closing the modal. ── */
  useEffect(() => {
    if (!whaleClaim) return;
    const amount = applyHolderMultiplier(whaleClaim.amount);
    setRep(r => r + amount);
    setRewardFlash(k => k + 1);
    sceneRef.current?.playRewardEffect(`+${amount} REP`);
    soundManager.play('reward');
    unlockBadge('whale-watcher-plus');
    const name = playerName || 'DegenExplorer';
    appendChatMessage('City Feed', `🐳 ${name} inspected the whale alert!`, 'event');
    showToast(`🐳 Whale inspected! +${amount} REP`);
    pushStoryLog(`${name} inspected the whale`);
  }, [whaleClaim, applyHolderMultiplier, unlockBadge, appendChatMessage, playerName, showToast, pushStoryLog]);

  /* ── District unlocks — same trigger state as the quests/badges above. ── */
  useEffect(() => {
    if (fountainClaimed) unlockDistrict('meme-market');
  }, [fountainClaimed, unlockDistrict]);

  useEffect(() => {
    if (nearZone?.id === 'market') unlockDistrict('hall-of-fame');
  }, [nearZone, unlockDistrict]);

  useEffect(() => {
    if (rep >= 20) unlockDistrict('whale-tower');
  }, [rep, unlockDistrict]);

  useEffect(() => {
    if (dialogue) unlockDistrict('alpha-lounge');
  }, [dialogue, unlockDistrict]);

  useEffect(() => {
    if (nearZone?.id === 'whale') unlockDistrict('rug-alley');
  }, [nearZone, unlockDistrict]);

  // Holder Vault is "only when Gold", not "after reaching Gold once" — it's
  // the one district that can re-lock if the (mock) tier changes back down.
  // Toasts on each transition into Gold, not just the first time ever.
  useEffect(() => {
    const isGold = holderTier === 'Gold';
    setDistrictUnlocked(prev => (prev['holder-vault'] === isGold ? prev : { ...prev, 'holder-vault': isGold }));
    if (isGold && !wasGoldRef.current) {
      showToast('🗺️ District unlocked: Holder Vault');
    }
    wasGoldRef.current = isGold;
  }, [holderTier, showToast]);

  /* ── Simulated Live City Events ──
     Self-rescheduling timer (10-20s, randomized each time so it never
     settles into a predictable cadence) — fires a fake city event as a
     toast + chat message, and sometimes as a random NPC's speech bubble. */
  const triggerCityEvent = useCallback(() => {
    const template = CITY_EVENTS[Math.floor(Math.random() * CITY_EVENTS.length)];
    const message = template.messages[Math.floor(Math.random() * template.messages.length)];
    showToast(`${template.icon} ${message}`);
    appendChatMessage('City Feed', `${template.icon} ${message}`, 'event');
    soundManager.play('event');
    if (Math.random() < CITY_EVENT_NPC_SPEECH_CHANCE) {
      sceneRef.current?.showNpcEventSpeech(message);
    }
  }, [showToast, appendChatMessage]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = CITY_EVENT_MIN_GAP + Math.random() * (CITY_EVENT_MAX_GAP - CITY_EVENT_MIN_GAP);
      timer = setTimeout(() => {
        triggerCityEvent();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, [triggerCityEvent]);

  /* ── RugTown Citizens chat activity ──
     Self-rescheduling timer (9-19s, randomized) drawing on the real,
     session-randomized citizen names WorldScene published — never a
     fixed/fake roster. Picks one of: reply to another named citizen,
     mention a nearby district, or welcome the player. */
  const triggerNpcChatActivity = useCallback(() => {
    if (npcNames.length === 0) return;
    const roll = Math.random();

    if (roll < 0.34 && npcNames.length >= 2) {
      const a = npcNames[Math.floor(Math.random() * npcNames.length)];
      let b = a;
      for (let guard = 0; guard < 5 && b === a; guard++) {
        b = npcNames[Math.floor(Math.random() * npcNames.length)];
      }
      const line = NPC_REPLY_LINES[Math.floor(Math.random() * NPC_REPLY_LINES.length)];
      appendChatMessage(b, `@${a} ${line}`, 'npc');
    } else if (roll < 0.67) {
      const name = npcNames[Math.floor(Math.random() * npcNames.length)];
      const district = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
      const lineFn = NPC_DISTRICT_LINES[Math.floor(Math.random() * NPC_DISTRICT_LINES.length)];
      appendChatMessage(name, lineFn(district.name), 'npc');
    } else {
      const name = npcNames[Math.floor(Math.random() * npcNames.length)];
      const lineFn = NPC_WELCOME_LINES[Math.floor(Math.random() * NPC_WELCOME_LINES.length)];
      appendChatMessage(name, lineFn(playerName || 'DegenExplorer'), 'npc');
    }
  }, [npcNames, playerName, appendChatMessage]);

  useEffect(() => {
    if (npcNames.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = NPC_CHAT_ACTIVITY_MIN_GAP + Math.random() * (NPC_CHAT_ACTIVITY_MAX_GAP - NPC_CHAT_ACTIVITY_MIN_GAP);
      timer = setTimeout(() => {
        triggerNpcChatActivity();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, [npcNames, triggerNpcChatActivity]);

  const MEDALS = ['🥇', '🥈', '🥉'];

  const renderModalBody = (id: string) => {
    switch (id) {
      case 'fountain':
        return (
          <>
            <p className="modal-text">
              Coins glint under the water. Toss one in and the fountain hums with old degen luck.
            </p>
            <div className={`modal-reward-row ${fountainClaimed ? 'modal-reward-row--claimed' : ''}`}>
              <span className="modal-reward-label">Daily Reward</span>
              <span className="modal-reward-value">+{applyHolderMultiplier(5)} REP</span>
            </div>
            <button
              className="modal-action-btn"
              onClick={claimFountainReward}
              disabled={fountainClaimed}
            >
              {fountainClaimed ? '✓ Claimed for Today' : 'Claim Reward'}
            </button>
          </>
        );
      case 'market':
        return (
          <>
            <p className="modal-text">A new ticker flickers into view on the stall boards.</p>
            <div className="modal-token-card">
              <span className="modal-token-card__badge">NEW</span>
              <span className="modal-token-card__ticker">$RUGSTREET</span>
              <span className="modal-token-card__tag">Token Discovered</span>
              <div className="modal-stat-row">
                <div className="modal-stat">
                  <span className="modal-stat__label">Price</span>
                  <span className="modal-stat__value">$0.000041</span>
                </div>
                <div className="modal-stat">
                  <span className="modal-stat__label">24h</span>
                  <span className="modal-stat__value modal-stat__value--up">+12.4%</span>
                </div>
              </div>
            </div>
            <p className="modal-text modal-text--muted">No wallet connected — preview only.</p>
          </>
        );
      case 'bridge':
        return (
          <>
            <p className="modal-text">
              City Travel Notice: this bridge connects RugTown's central square to the outer
              districts. Travel beyond the bridge opens as new districts are completed.
            </p>
            <ul className="modal-locked-list">
              <li className="modal-locked-item">
                <span className="modal-lock-icon">🔒</span>
                <span>Neon Docks</span>
                <span className="modal-locked-tag">Locked</span>
              </li>
              <li className="modal-locked-item">
                <span className="modal-lock-icon">🔒</span>
                <span>Old Quarter</span>
                <span className="modal-locked-tag">Locked</span>
              </li>
              <li className="modal-locked-item">
                <span className="modal-lock-icon">🔒</span>
                <span>Skybridge Heights</span>
                <span className="modal-locked-tag">Locked</span>
              </li>
            </ul>
          </>
        );
      case 'fame':
        return (
          <ul className="modal-leaderboard">
            {FAME_LEADERBOARD.map(row => (
              <li key={row.rank} className="modal-leaderboard__row">
                <span className="modal-leaderboard__rank">{MEDALS[row.rank - 1] ?? `#${row.rank}`}</span>
                <span>{row.name}</span>
                <span className="modal-leaderboard__rep">{row.rep.toLocaleString()} REP</span>
              </li>
            ))}
            <li className="modal-leaderboard__row modal-leaderboard__row--you">
              <span className="modal-leaderboard__rank">—</span>
              <span>You</span>
              <span className="modal-leaderboard__rep">{rep.toLocaleString()} REP</span>
            </li>
          </ul>
        );
      case 'whale':
        return (
          <>
            <p className="modal-text">Eyes up, degens — something big just moved.</p>
            <div className="modal-whale-card">
              <span className="modal-whale-card__icon">🐳</span>
              <div className="modal-whale-card__body">
                <span className="modal-whale-card__title">Large Wallet Detected</span>
                <span className="modal-whale-card__meta">Near Whale Tower · 3 min ago</span>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  /* ── Minimap click → camera pan ── */
  const minimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sceneRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top)  / rect.height;
    sceneRef.current.panTo(px * worldSize.w, py * worldSize.h, 500);
  }, [worldSize]);

  /* ── Minimap player dot position ── */
  const playerPos  = sceneRef.current ? sceneRef.current.getPlayerPos() : null;
  const playerMapX = playerPos ? (playerPos.x / worldSize.w) * 100 : 50;
  const playerMapY = playerPos ? (playerPos.y / worldSize.h) * 100 : 50;

  /* ── Nearest landmark within its own interaction radius — drives the
     minimap highlight and the small "current zone" line underneath it.
     Doesn't touch WorldScene's own zone-proximity system or its actual
     interaction coordinates; this just re-reads the same WorldObjects
     data for a purely visual navigation aid. ── */
  let nearestLandmark: (typeof WORLD_OBJECTS)[number] | null = null;
  if (playerPos) {
    let nearestDist = Infinity;
    for (const obj of WORLD_OBJECTS) {
      const dx = playerPos.x - obj.x * worldSize.w;
      const dy = playerPos.y - obj.y * worldSize.h;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= obj.interactionRadius && dist < nearestDist) {
        nearestLandmark = obj;
        nearestDist = dist;
      }
    }
  }

  /* ── Camera center position for display ── */
  const camCenterX = Math.round(camera.x + (window.innerWidth / 2) / camera.zoom);
  const camCenterY = Math.round(camera.y + (window.innerHeight / 2) / camera.zoom);
  const zoomPct    = Math.round(camera.zoom * 100);

  return (
    <div className="game-page">

      {/* ══════════════════════════════════════════════════════════
          PHASER CANVAS MOUNT
          Full screen behind all HUD elements
          ══════════════════════════════════════════════════════════ */}
      <div
        id="phaser-mount"
        ref={mountRef}
        className="game-canvas"
        aria-label="RugTown world view"
      />

      {/* Loading state — before Phaser is ready */}
      {!ready && (
        <div className="game-loading">
          <div className="game-loading__inner">
            <div className="game-loading__logo">RUGTOWN</div>
            <div className="game-loading__sub">Loading world...</div>
            <div className="game-loading__bar">
              <div className="game-loading__fill" />
            </div>
          </div>
        </div>
      )}

      {/* Asset missing notice */}
      {ready && bgMissing && (
        <div className="asset-notice">
          <span className="asset-notice__icon">ℹ</span>
          <span>
            City art not found — place <code>rugtown-city.png</code> in{' '}
            <code>public/assets/backgrounds/</code> and refresh.
            Camera, zoom, and HUD are fully functional.
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HUD OVERLAY
          All panels are positioned absolute over the canvas.
          Match Image 2 layout + Image 3 ornate gold style.
          ══════════════════════════════════════════════════════════ */}
      {ready && (
        <div className="hud" role="complementary" aria-label="Game HUD">

          {/* ──────────────────────────────────────────────────────
              TOP-LEFT: RugTown Logo + Player Card
              Image 2: avatar top-left, name + stats below
              Image 3: ornate gold-bordered panel
              On mobile this collapses into a small toggle button so it
              doesn't permanently cover part of the playfield.
              ────────────────────────────────────────────────────── */}
          {isMobile && !mobilePlayerCardOpen && (
            <button
              className="mobile-collapsed-btn mobile-collapsed-btn--tl"
              onClick={() => setMobilePlayerCardOpen(true)}
              aria-label="Show player info"
            >👤</button>
          )}
          {(!isMobile || mobilePlayerCardOpen) && (
          <div className="hud-panel hud-panel--tl">
            {/* Panel corner ornaments — Image 3 style */}
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

            {isMobile && (
              <button
                className="mobile-panel-close"
                onClick={() => setMobilePlayerCardOpen(false)}
                aria-label="Close player info"
              >✕</button>
            )}

            {/* Panel header bar — gold strip from Image 3 */}
            <div className="panel-header">
              <span className="panel-header__logo">RUGTOWN</span>
              <span className="panel-header__sub">THE DEGEN CITY</span>
            </div>

            {/* Player card */}
            <div className="player-card">
              <div className="player-avatar">
                {/* Placeholder avatar circle */}
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <circle cx="20" cy="20" r="19" stroke="#c8902a" strokeWidth="2" fill="#0d1117"/>
                  <circle cx="20" cy="16" r="7" fill="#c8902a" opacity="0.6"/>
                  <path d="M6 36c0-8 6-13 14-13s14 5 14 13" fill="#c8902a" opacity="0.4"/>
                </svg>
              </div>
              <div className="player-info">
                <div className="player-name">{playerName || 'DegenExplorer'}</div>
                <div className="player-title">Wandering Degen</div>
                <div className="player-rep">
                  <span className="rep-label">REP</span>
                  <span className="rep-value">{rep}</span>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="quick-stats">
              <div className="qstat">
                <span className="qstat__dot qstat__dot--live" />
                <span className="qstat__label">Real Players</span>
                <span className="qstat__value">—</span>
              </div>
              <div className="qstat">
                <span className="qstat__dot" />
                <span className="qstat__label">RugTown Citizens</span>
                <span className="qstat__value">{npcCount || '—'}</span>
              </div>
              <div className={`qstat ${tierJustChanged ? 'qstat--pulse' : ''}`}>
                <span className={`qstat__dot qstat__dot--holder-${holderTier.toLowerCase()}`} />
                <span className="qstat__label">Holder Tier</span>
                <span className="qstat__value">{holderTier} ({holderMultiplier}x)</span>
              </div>
            </div>

            {/* Mode badge */}
            <div className="mode-badge">
              <span className="mode-badge__dot" />
              WORLD VIEW · NO BACKEND
            </div>
          </div>
          )}

          {/* ──────────────────────────────────────────────────────
              TOP-CENTER: Camera coordinates + controls
              ────────────────────────────────────────────────────── */}
          <div className="hud-coords">
            <button
              className="coord-btn"
              onClick={zoomOut}
              aria-label="Zoom out"
              title="Zoom out (− key)"
            >−</button>
            <span className="coord-text">
              {zoomPct}% · {camCenterX},{camCenterY}
            </span>
            <button
              className="coord-btn"
              onClick={zoomIn}
              aria-label="Zoom in"
              title="Zoom in (+ key)"
            >+</button>
            <button
              className="coord-btn coord-btn--reset"
              onClick={resetView}
              aria-label="Reset view"
              title="Reset view"
            >⌂</button>
          </div>

          {/* ──────────────────────────────────────────────────────
              RIGHT SIDEBAR: Minimap + Zone list
              Image 2: small map upper-right with zone dots
              Image 3: ornate gold bordered panel
              On mobile this collapses into a small toggle button.
              ────────────────────────────────────────────────────── */}
          {isMobile && !mobileMapOpen && (
            <button
              className="mobile-collapsed-btn mobile-collapsed-btn--tr"
              onClick={() => setMobileMapOpen(true)}
              aria-label="Show map"
            >🗺️</button>
          )}
          {(!isMobile || mobileMapOpen) && (
          <div className="hud-panel hud-panel--tr">
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

            {isMobile && (
              <button
                className="mobile-panel-close"
                onClick={() => setMobileMapOpen(false)}
                aria-label="Close map"
              >✕</button>
            )}

            <div className="panel-header">
              <span className="panel-header__logo">RUGTOWN MAP</span>
            </div>

            {/* Clickable minimap */}
            <div
              className="minimap"
              onClick={minimapClick}
              title="Click to pan camera"
              role="button"
              aria-label="Minimap — click to navigate"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && minimapClick(e as unknown as React.MouseEvent<HTMLDivElement>)}
            >
              {/* Landmark dots — every registered WorldObject, positioned
                  from the same fractional coordinates WorldScene uses for
                  actual interaction detection */}
              {WORLD_OBJECTS.map(obj => {
                const districtId = WORLD_OBJECT_TO_DISTRICT[obj.id];
                const districtIsUnlocked = districtId ? districtUnlocked[districtId] : false;
                return (
                  <div
                    key={obj.id}
                    className={`minimap-zone ${nearestLandmark?.id === obj.id ? 'minimap-zone--active' : ''} ${districtIsUnlocked ? 'minimap-zone--district-unlocked' : ''}`}
                    style={{
                      left: `${obj.x * 100}%`,
                      top: `${obj.y * 100}%`,
                      background: LANDMARK_COLORS[obj.id] ?? '#e8b84b',
                    }}
                    title={`${obj.futureIcon} ${obj.displayName}`}
                  >
                    <span className="minimap-zone__label">{obj.futureIcon} {obj.displayName}</span>
                  </div>
                );
              })}

              {/* Treasure Hunt chest — only rendered while a chest exists
                  (req. 3/11), position mirrors WorldScene's own spawn point */}
              {treasureChest && (
                <div
                  className="minimap-treasure"
                  style={{
                    left: `${(treasureChest.wx / worldSize.w) * 100}%`,
                    top: `${(treasureChest.wy / worldSize.h) * 100}%`,
                  }}
                  title="Treasure Chest"
                  aria-label="Treasure chest location"
                />
              )}

              {/* Whale Alert marker — only rendered while it exists
                  (req. 3/11), position mirrors WorldScene's own spawn point */}
              {whaleMarker && (
                <div
                  className="minimap-whale"
                  style={{
                    left: `${(whaleMarker.wx / worldSize.w) * 100}%`,
                    top: `${(whaleMarker.wy / worldSize.h) * 100}%`,
                  }}
                  title="Whale Alert"
                  aria-label="Whale alert location"
                />
              )}

              {/* Player dot */}
              <div
                className="minimap-player"
                style={{ left: `${playerMapX}%`, top: `${playerMapY}%` }}
                aria-label="Your position"
              />

              {/* Camera viewport rectangle */}
              <div
                className="minimap-viewport"
                style={{
                  left:   `${(camera.x / worldSize.w) * 100}%`,
                  top:    `${(camera.y / worldSize.h) * 100}%`,
                  width:  `${((window.innerWidth / camera.zoom) / worldSize.w) * 100}%`,
                  height: `${((window.innerHeight / camera.zoom) / worldSize.h) * 100}%`,
                }}
              />
            </div>

            {/* Current zone — nearest landmark within its interaction radius */}
            <div className="minimap-status">
              {nearestLandmark
                ? <>📍 <strong>{nearestLandmark.displayName}</strong></>
                : 'No landmark nearby'}
            </div>

            {/* Landmark legend — every registered WorldObject */}
            <div className="zone-legend">
              {WORLD_OBJECTS.map(obj => (
                <div
                  key={obj.id}
                  className={`zone-legend-item ${nearestLandmark?.id === obj.id ? 'zone-legend-item--active' : ''}`}
                  title={obj.displayName}
                  onClick={() => {
                    sceneRef.current?.panTo(obj.x * worldSize.w, obj.y * worldSize.h, 600);
                  }}
                >
                  <span className="zone-dot" style={{ background: LANDMARK_COLORS[obj.id] ?? '#e8b84b' }} />
                  <span className="zone-name">{obj.futureIcon} {obj.displayName}</span>
                </div>
              ))}
            </div>

            {/* Camera info */}
            <div className="cam-info">
              <span>Zoom: {zoomPct}%</span>
              <span>WASD to move player</span>
              <span>Scroll to zoom</span>
            </div>
          </div>
          )}

          {/* ──────────────────────────────────────────────────────
              CITY CHAT — toggled from the action bar's Chat button
              ────────────────────────────────────────────────────── */}
          {isChatOpen && (
            <div className="hud-panel chat-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">CITY CHAT</span>
                <button
                  className="chat-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close chat"
                >✕</button>
              </div>

              <div className="chat-log" ref={chatLogRef} aria-live="polite">
                {chatMessages.length === 0 && (
                  <div className="chat-log__empty">No messages yet. Say GM.</div>
                )}
                {chatMessages.map(m => (
                  <div
                    key={m.id}
                    className={`chat-message chat-message--${m.kind}`}
                  >
                    <span className="chat-message__sender">
                      {m.sender}
                      {m.kind === 'npc' && <span className="chat-message__npc-tag">[NPC]</span>}
                    </span>
                    <span className="chat-message__text">{m.text}</span>
                  </div>
                ))}
              </div>

              <div className="chat-input-row">
                <input
                  ref={chatInputRef}
                  className="chat-input"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatInputKeyDown}
                  onFocus={() => sceneRef.current?.setKeyboardEnabled(false)}
                  onBlur={() => sceneRef.current?.setKeyboardEnabled(true)}
                  placeholder="Say something to RugTown..."
                  maxLength={140}
                  autoComplete="off"
                  aria-label="Chat message"
                />
                <button className="chat-send-btn" onClick={sendChatMessage} aria-label="Send">
                  Send
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              QUESTS — toggled from the action bar's Quests button
              ────────────────────────────────────────────────────── */}
          {isQuestsOpen && (
            <div className="hud-panel quest-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">QUESTS</span>
                <button
                  className="quest-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close quests"
                >✕</button>
              </div>

              <div className="quest-list">
                {QUESTS.map(q => {
                  const status = questStatus[q.id];
                  return (
                    <div key={q.id} className={`quest-item quest-item--${status}`}>
                      <div className="quest-item__header">
                        <span className="quest-item__title">{q.title}</span>
                        <span className={`quest-item__badge quest-item__badge--${status}`}>
                          {status === 'claimed' ? 'Claimed' : status === 'ready' ? 'Complete!' : 'In Progress'}
                        </span>
                      </div>
                      <p className="quest-item__desc">{q.description}</p>
                      <div className="quest-item__footer">
                        <span className="quest-item__reward">+{applyHolderMultiplier(q.reward)} REP</span>
                        {status === 'ready' && (
                          <button
                            className="quest-item__claim-btn"
                            onClick={() => claimQuestReward(q.id)}
                          >
                            Claim
                          </button>
                        )}
                        {status === 'claimed' && (
                          <span className="quest-item__claimed-check">✓ Claimed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              HOLDER STATUS — toggled from the action bar's Holder button.
              Mock/local only — no wallet connection, no Solana calls.
              ────────────────────────────────────────────────────── */}
          {isHolderOpen && (
            <div className="hud-panel holder-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">HOLDER STATUS</span>
                <button
                  className="holder-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close holder panel"
                >✕</button>
              </div>

              <div className="holder-panel__mock-tag">MOCK · DEVNET PREVIEW — no wallet connected</div>

              <div className="holder-panel__body">
                <p className="modal-text">
                  Simulate a holder tier to preview how REP rewards scale. This is a local toggle only —
                  no wallet, no real Solana data.
                </p>

                <div className="holder-tier-grid">
                  {HOLDER_TIERS.map(({ tier, multiplier }) => (
                    <button
                      key={tier}
                      className={`holder-tier-btn holder-tier-btn--${tier.toLowerCase()} ${
                        holderTier === tier ? 'holder-tier-btn--active' : ''
                      }`}
                      onClick={() => setHolderTierAndNotify(tier)}
                    >
                      <span className="holder-tier-btn__name">{tier}</span>
                      <span className="holder-tier-btn__mult">{multiplier}x REP</span>
                    </button>
                  ))}
                </div>

                {holderTier === 'Gold' && (
                  <div className="holder-vault-status">
                    🔓 Vault Access: Preview Enabled
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              TODAY'S STORY — toggled from the action bar's Story button
              (Phase 4 Event Chain System). Last 5 notable moments: an
              event going Live, or a player claiming a treasure/whale.
              Local-only, nothing persisted between sessions.
              ────────────────────────────────────────────────────── */}
          {isStoryOpen && (
            <div className="hud-panel story-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">TODAY'S STORY</span>
                <button
                  className="story-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close story log"
                >✕</button>
              </div>

              <div className="story-panel__body">
                {storyLog.length === 0 ? (
                  <p className="story-panel__empty">Nothing has happened yet — stay close to the city.</p>
                ) : (
                  <ol className="story-log-list">
                    {storyLog.map((entry, i) => (
                      <li key={entry.id} className="story-log-item">
                        <span className="story-log-item__index">{i + 1}</span>
                        <span className="story-log-item__text">{entry.text}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              LEADERBOARD — toggled from the action bar's Leaderboard
              button. Local-only — 8 fake NPC rows + the player's own.
              ────────────────────────────────────────────────────── */}
          {isLeaderboardOpen && (
            <div className="hud-panel leaderboard-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">LEADERBOARD</span>
                <button
                  className="leaderboard-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close leaderboard"
                >✕</button>
              </div>

              <div className="leaderboard-panel__tag">Local simulation — no real players</div>

              <div className="leaderboard-tabs" role="tablist">
                {LEADERBOARD_TABS.map(tab => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={leaderboardTab === tab}
                    className={`leaderboard-tab ${leaderboardTab === tab ? 'leaderboard-tab--active' : ''}`}
                    onClick={() => setLeaderboardTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="leaderboard-list">
                {leaderboardRows.map(row => (
                  <div
                    key={row.name}
                    className={`leaderboard-row ${row.isPlayer ? 'leaderboard-row--you' : ''}`}
                  >
                    <span className="leaderboard-row__rank">
                      {row.rank <= 3 ? MEDALS[row.rank - 1] : `#${row.rank}`}
                    </span>
                    <span className="leaderboard-row__name">
                      {row.name}
                      {row.isPlayer
                        ? <span className="leaderboard-row__tag leaderboard-row__tag--you">You</span>
                        : <span className="leaderboard-row__tag leaderboard-row__tag--npc">NPC</span>}
                    </span>
                    <span className="leaderboard-row__rep">{row.rep.toLocaleString()} REP</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              SETTINGS — toggled from the action bar's Settings button.
              Local-only sound controls: mute + 3 volume sliders, all
              WebAudio placeholder tones (no audio files).
              ────────────────────────────────────────────────────── */}
          {isSettingsOpen && (
            <div className="hud-panel settings-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">SETTINGS</span>
                <button
                  className="settings-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close settings"
                >✕</button>
              </div>

              <div className="settings-panel__body">
                <div className="settings-mute-row">
                  <span className="settings-mute-row__label">Sound</span>
                  <button
                    className={`settings-mute-btn ${muted ? 'settings-mute-btn--muted' : ''}`}
                    onClick={toggleMuted}
                    aria-pressed={!muted}
                  >
                    {muted ? '🔇 Muted' : '🔊 On'}
                  </button>
                </div>

                <div className="settings-slider-row">
                  <label className="settings-slider-row__label" htmlFor="vol-music">Music</label>
                  <input
                    id="vol-music"
                    className="settings-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={musicVol}
                    disabled={muted}
                    onChange={(e) => handleVolumeChange('music', parseFloat(e.target.value))}
                  />
                </div>

                <div className="settings-slider-row">
                  <label className="settings-slider-row__label" htmlFor="vol-ambience">Ambience</label>
                  <input
                    id="vol-ambience"
                    className="settings-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={ambienceVol}
                    disabled={muted}
                    onChange={(e) => handleVolumeChange('ambience', parseFloat(e.target.value))}
                  />
                </div>

                <div className="settings-slider-row">
                  <label className="settings-slider-row__label" htmlFor="vol-effects">Effects</label>
                  <input
                    id="vol-effects"
                    className="settings-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={effectsVol}
                    disabled={muted}
                    onChange={(e) => handleVolumeChange('effects', parseFloat(e.target.value))}
                  />
                </div>

                <p className="settings-panel__note">
                  Synthesized placeholder tones — no audio files. Sound stays muted until you
                  interact with the game.
                </p>

                <div className="settings-mute-row">
                  <span className="settings-mute-row__label">Fullscreen</span>
                  <button
                    className={`settings-mute-btn ${!isFullscreen ? 'settings-mute-btn--muted' : ''}`}
                    onClick={toggleFullscreen}
                    aria-pressed={isFullscreen}
                  >
                    {isFullscreen ? '⛶ On' : '⛶ Off'}
                  </button>
                </div>

                <div className="settings-mute-row">
                  <span className="settings-mute-row__label">Collision Debug</span>
                  <button
                    className={`settings-mute-btn ${!collisionDebugOn ? 'settings-mute-btn--muted' : ''}`}
                    onClick={toggleCollisionDebug}
                    aria-pressed={collisionDebugOn}
                    title="Same toggle as the C key"
                  >
                    {collisionDebugOn ? '🟥 On' : '🟥 Off'}
                  </button>
                </div>

                <button className="settings-action-btn" onClick={resetView}>
                  🎯 Reset Camera
                </button>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              INVENTORY — toggled from the action bar's Inventory
              button. Items tab is flavor only; Badges unlock from the
              same local progress signals the quests already watch.
              ────────────────────────────────────────────────────── */}
          {isInventoryOpen && (
            <div className="hud-panel inventory-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">INVENTORY</span>
                <button
                  className="inventory-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close inventory"
                >✕</button>
              </div>

              <div className="inventory-tabs" role="tablist">
                {INVENTORY_TABS.map(tab => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={inventoryTab === tab}
                    className={`inventory-tab ${inventoryTab === tab ? 'inventory-tab--active' : ''}`}
                    onClick={() => setInventoryTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {inventoryTab === 'Items' ? (
                <div className="inventory-grid">
                  {MOCK_ITEMS.map(item => (
                    <div key={item.id} className="inventory-card">
                      <span className="inventory-card__icon" aria-hidden>{item.icon}</span>
                      <span className="inventory-card__name">{item.name}</span>
                      <span className="inventory-card__desc">{item.description}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inventory-grid">
                  {BADGES.map(badge => {
                    const unlocked = badgeStatus[badge.id] === 'unlocked';
                    return (
                      <div
                        key={badge.id}
                        className={`inventory-card ${unlocked ? 'inventory-card--unlocked' : 'inventory-card--locked'}`}
                      >
                        <span className="inventory-card__icon" aria-hidden>
                          {unlocked ? badge.icon : '🔒'}
                        </span>
                        <span className="inventory-card__name">{badge.name}</span>
                        <span className="inventory-card__desc">{badge.description}</span>
                        <span className={`inventory-card__status inventory-card__status--${unlocked ? 'unlocked' : 'locked'}`}>
                          {unlocked ? 'Unlocked' : 'Locked'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              EMOTES — toggled from the action bar's Emotes button.
              Each emote shows a speech bubble + pop animation on the
              player and logs a chat line — purely local, no NPC change.
              ────────────────────────────────────────────────────── */}
          {isEmotesOpen && (
            <div className="hud-panel emote-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">EMOTES</span>
                <button
                  className="emote-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close emotes"
                >✕</button>
              </div>

              <div className="emote-grid">
                {EMOTES.map(emote => (
                  <button
                    key={emote.id}
                    className="emote-btn"
                    onClick={() => triggerEmote(emote)}
                  >
                    <span className="emote-btn__icon" aria-hidden>{emote.icon}</span>
                    <span className="emote-btn__label">{emote.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              DISTRICT PROGRESS — toggled from the action bar's Map
              button. Local-only progression layered on top of the
              existing world; nothing is physically blocked.
              ────────────────────────────────────────────────────── */}
          {isMapOpen && (
            <div className="hud-panel district-panel">
              <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
              <span className="panel-corner panel-corner--br" aria-hidden>◆</span>

              <div className="panel-header">
                <span className="panel-header__logo">DISTRICT PROGRESS</span>
                <button
                  className="district-panel__close"
                  onClick={() => setActiveAction(null)}
                  aria-label="Close district progress"
                >✕</button>
              </div>

              <div className="district-list">
                {DISTRICTS.map(d => {
                  const unlocked = districtUnlocked[d.id];
                  return (
                    <div
                      key={d.id}
                      className={`district-item ${unlocked ? 'district-item--unlocked' : 'district-item--locked'}`}
                    >
                      <div className="district-item__header">
                        <span className="district-item__name">{d.name}</span>
                        <span className={`district-item__status district-item__status--${unlocked ? 'unlocked' : 'locked'}`}>
                          {unlocked ? '🔓 Unlocked' : '🔒 Locked'}
                        </span>
                      </div>
                      <p className="district-item__desc">{d.description}</p>
                      <p className="district-item__req">
                        {unlocked ? '✓' : '•'} {d.requirement}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────
              BOTTOM ACTION BAR
              Image 2: horizontal row of icon buttons at screen bottom
              Image 3: gold-bordered dark bar, circular icon buttons
              ────────────────────────────────────────────────────── */}
          <div className="action-bar" role="toolbar" aria-label="Game actions">
            {/* Left ornament */}
            <div className="action-bar__ornament action-bar__ornament--left" aria-hidden>
              <svg viewBox="0 0 24 48" fill="none">
                <path d="M22 4 L4 24 L22 44" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="22" cy="4"  r="3" fill="currentColor"/>
                <circle cx="22" cy="44" r="3" fill="currentColor"/>
              </svg>
            </div>

            {/* Action buttons */}
            {ACTION_BAR_ITEMS.map((item) => (
              <button
                key={item.label}
                className={`action-btn ${activeAction === item.label ? 'action-btn--active' : ''}`}
                onClick={() => {
                  soundManager.play('click');
                  // Same rule as the keyboard shortcuts — only one overlay
                  // (HUD panel vs. landmark modal vs. NPC dialogue vs. the
                  // Whale Alert modal vs. the Hall of Fame statue modal)
                  // at a time.
                  setModalClosing(false);
                  setModalZone(null);
                  setDialogueClosing(false);
                  setDialogue(null);
                  setWhaleAlertClosing(false);
                  setWhaleAlert(null);
                  setStatueModalClosing(false);
                  setStatueModal(null);
                  setActiveAction(prev => prev === item.label ? null : item.label);
                }}
                aria-label={item.label}
                aria-pressed={activeAction === item.label}
                title={`${item.label}${item.key ? ` (${item.key})` : ''}`}
              >
                {/* Shimmer on hover */}
                <span className="action-btn__shimmer" aria-hidden />
                {/* Corner ornaments for active state */}
                {activeAction === item.label && <>
                  <span className="action-btn__corner action-btn__corner--tl" aria-hidden>◆</span>
                  <span className="action-btn__corner action-btn__corner--tr" aria-hidden>◆</span>
                </>}
                <span className="action-btn__icon" aria-hidden>{item.icon}</span>
                <span className="action-btn__label">{item.label}</span>
                {item.key && (
                  <span className="action-btn__key" aria-hidden>{item.key}</span>
                )}
              </button>
            ))}

            {/* Right ornament */}
            <div className="action-bar__ornament action-bar__ornament--right" aria-hidden>
              <svg viewBox="0 0 24 48" fill="none">
                <path d="M2 4 L20 24 L2 44" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="2" cy="4"  r="3" fill="currentColor"/>
                <circle cx="2" cy="44" r="3" fill="currentColor"/>
              </svg>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────
              MOBILE TOUCH CONTROLS — joystick (movement), interact
              button (same effect as E), and a zoom/reset cluster.
              Desktop keyboard/mouse controls are untouched; these only
              render below the ≤600px breakpoint.
              ────────────────────────────────────────────────────── */}
          {isMobile && (
            <div className="mobile-controls">
              <div
                className="mobile-joystick"
                ref={joystickBaseRef}
                onPointerDown={handleJoystickPointerDown}
                onPointerMove={handleJoystickPointerMove}
                onPointerUp={handleJoystickPointerUp}
                onPointerCancel={handleJoystickPointerUp}
                role="application"
                aria-label="Move"
              >
                <div
                  className="mobile-joystick__knob"
                  style={{ transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)` }}
                />
              </div>

              <div className="mobile-action-cluster">
                <button className="mobile-zoom-btn" onClick={zoomOut} aria-label="Zoom out">−</button>
                <button className="mobile-zoom-btn" onClick={zoomIn} aria-label="Zoom in">+</button>
                <button className="mobile-zoom-btn mobile-zoom-btn--reset" onClick={resetView} aria-label="Reset camera">⌂</button>
                <button className="mobile-interact-btn" onClick={handleMobileInteract} aria-label="Interact">E</button>
              </div>
            </div>
          )}

          {/* Controls hint — fades after a few seconds */}
          <div className="controls-hint" role="note">
            <span>WASD / ↑↓←→  move</span>
            <span className="hint-sep">·</span>
            <span>+ / −  zoom</span>
            <span className="hint-sep">·</span>
            <span>Scroll wheel  zoom</span>
            <span className="hint-sep">·</span>
            <span>⌂  reset camera</span>
            <span className="hint-sep">·</span>
            <span>Click map  teleport</span>
          </div>

          {/* Interaction prompt — landmark zone takes priority over an NPC,
              which takes priority over the Treasure Hunt chest / Whale
              Alert marker, which takes priority over a Hall of Fame statue
              (matches WorldScene's own updateZoneProximity/
              updateNpcProximity/updateTreasureProximity/updateWhaleProximity/
              updateStatueProximity priority order — treasure and whale can
              never both be active since only one event is ever Live at
              once). Hidden while any other overlay (modal, dialogue, or an
              action-bar panel) is already on screen so it can't overlap
              the bottom-center panels (Holder/Leaderboard/Settings/etc). */}
          {!modalZone && !dialogue && !activeAction && !whaleAlert && !statueModal &&
            (nearZone || nearNpc || nearTreasure || nearWhale || nearStatue) && (
            <div className="zone-prompt" role="status">
              <span className="zone-prompt__key">E</span>
              <span className="zone-prompt__text">
                {nearZone
                  ? `Press E to interact — ${nearZone.name}`
                  : nearNpc
                  ? `Press E to talk — ${nearNpc.name}`
                  : nearTreasure
                  ? 'Press E to open treasure'
                  : nearWhale
                  ? 'Press E to inspect whale'
                  : 'Press E to inspect statue'}
              </span>
            </div>
          )}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          INTERACTION ZONE MODAL — polished black/gold, per-zone content
          ══════════════════════════════════════════════════════════ */}
      {modalZone && (
        <div
          className={`modal-overlay ${modalClosing ? 'modal-overlay--closing' : ''}`}
          onClick={requestCloseModal}
        >
          <div
            className={`modal-panel ${modalClosing ? 'modal-panel--closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>
            <span className="modal-panel__shimmer" aria-hidden />

            <div className="modal-header">
              <span className="modal-header__icon" aria-hidden>
                {getWorldObject(modalZone)?.futureIcon ?? '✦'}
              </span>
              <div className="modal-header__titles">
                <span className="modal-header__title">{ZONE_INFO[modalZone]?.title ?? modalZone}</span>
                <span className="modal-header__sub">{ZONE_INFO[modalZone]?.sub ?? ''}</span>
              </div>
              <button className="modal-close" onClick={requestCloseModal} aria-label="Close">✕</button>
            </div>

            <div className="modal-body">
              {renderModalBody(modalZone)}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          NPC DIALOGUE — same black/gold style, name + one line only
          ══════════════════════════════════════════════════════════ */}
      {dialogue && (
        <div
          className={`modal-overlay ${dialogueClosing ? 'modal-overlay--closing' : ''}`}
          onClick={requestCloseDialogue}
        >
          <div
            className={`modal-panel ${dialogueClosing ? 'modal-panel--closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>
            <span className="modal-panel__shimmer" aria-hidden />

            <div className="modal-header">
              <span className="modal-header__icon" aria-hidden>💬</span>
              <div className="modal-header__titles">
                <span className="modal-header__title">{dialogue.npcName}</span>
                <span className="modal-header__sub">NPC · RugTown Citizen</span>
              </div>
              <button className="modal-close" onClick={requestCloseDialogue} aria-label="Close">✕</button>
            </div>

            <div className="modal-body">
              <p className="modal-text">&ldquo;{dialogue.line}&rdquo;</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          WHALE ALERT MODAL — same black/gold style as the landmark
          modal/NPC dialogue above. Everything shown is clearly fake/
          local flavor data generated by WorldScene at inspection time —
          no real wallet, chain, or Solana connection.
          ══════════════════════════════════════════════════════════ */}
      {whaleAlert && (
        <div
          className={`modal-overlay ${whaleAlertClosing ? 'modal-overlay--closing' : ''}`}
          onClick={requestCloseWhaleAlert}
        >
          <div
            className={`modal-panel ${whaleAlertClosing ? 'modal-panel--closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>
            <span className="modal-panel__shimmer" aria-hidden />

            <div className="modal-header">
              <span className="modal-header__icon" aria-hidden>🐳</span>
              <div className="modal-header__titles">
                <span className="modal-header__title">Whale Alert</span>
                <span className="modal-header__sub">DEVNET · MOCK DATA</span>
              </div>
              <button className="modal-close" onClick={requestCloseWhaleAlert} aria-label="Close">✕</button>
            </div>

            <div className="modal-body">
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Wallet</span>
                <span className="whale-alert-row__value whale-alert-row__value--mono">{whaleAlert.wallet}</span>
              </div>
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Buy Amount</span>
                <span className="whale-alert-row__value">{whaleAlert.buySol} SOL</span>
              </div>
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Token</span>
                <span className="whale-alert-row__value">{whaleAlert.tokenSymbol}</span>
              </div>
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Risk Level</span>
                <span className={`whale-alert-risk whale-alert-risk--${whaleAlert.riskLevel.toLowerCase()}`}>
                  {whaleAlert.riskLevel}
                </span>
              </div>
              <div className="whale-alert-row whale-alert-row--reward">
                <span className="whale-alert-row__label">Reward</span>
                <span className="whale-alert-row__value whale-alert-row__value--gold">{whaleAlert.rewardLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HALL OF FAME STATUE MODAL — same black/gold style as the
          others. Rank/name/REP come straight from the same leaderboard
          data the Leaderboard panel uses; title/flavor are rank-based
          (req. 12: no real users, nothing tied to a specific identity).
          ══════════════════════════════════════════════════════════ */}
      {statueModal && (
        <div
          className={`modal-overlay ${statueModalClosing ? 'modal-overlay--closing' : ''}`}
          onClick={requestCloseStatueModal}
        >
          <div
            className={`modal-panel ${statueModalClosing ? 'modal-panel--closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
            <span className="panel-corner panel-corner--br" aria-hidden>◆</span>
            <span className="modal-panel__shimmer" aria-hidden />

            <div className="modal-header">
              <span className="modal-header__icon" aria-hidden>🏛️</span>
              <div className="modal-header__titles">
                <span className="modal-header__title">
                  #{statueModal.rank} {statueModal.name}{statueModal.isPlayer ? ' (You)' : ''}
                </span>
                <span className="modal-header__sub">
                  {statueModal.isPlayer ? 'Hall of Fame Statue' : 'Hall of Fame Statue · RugTown Citizen'}
                </span>
              </div>
              <button className="modal-close" onClick={requestCloseStatueModal} aria-label="Close">✕</button>
            </div>

            <div className="modal-body">
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Rank</span>
                <span className={`statue-rank-badge statue-rank-badge--${statueModal.rank}`}>#{statueModal.rank}</span>
              </div>
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Name</span>
                <span className="whale-alert-row__value">{statueModal.name}</span>
              </div>
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">REP</span>
                <span className="whale-alert-row__value whale-alert-row__value--gold">{statueModal.rep.toLocaleString()}</span>
              </div>
              <div className="whale-alert-row">
                <span className="whale-alert-row__label">Title</span>
                <span className="whale-alert-row__value">{STATUE_RANK_FLAVOR[statueModal.rank]?.title ?? 'RugTown Citizen'}</span>
              </div>
              <p className="modal-text statue-modal__flavor">
                &ldquo;{STATUE_RANK_FLAVOR[statueModal.rank]?.flavor ?? 'A name RugTown won\'t soon forget.'}&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Brief gold pulse across the whole screen when a reward is claimed */}
      {rewardFlash > 0 && (
        <div
          key={rewardFlash}
          className="reward-flash"
          aria-hidden
          onAnimationEnd={() => setRewardFlash(0)}
        />
      )}

      {/* Toast notifications — e.g. quest-complete */}
      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className="toast">
              <span className="toast__icon" aria-hidden>🏆</span>
              <span className="toast__text">{t.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          EVENT HUD — Phase 2 Event Engine. Read-only: WorldScene's
          EventManager owns all real lifecycle state, this just mirrors
          the registry into the banner/pin below. Visible across every
          non-idle phase (countdown/announcement/live/completed/cooldown).
          ══════════════════════════════════════════════════════════ */}
      {currentEvent && eventPhase !== 'idle' && (
        <div className="event-hud" aria-live="polite">
          <div
            className={`event-banner ${
              currentEvent.rarity === 'rare' || currentEvent.rarity === 'legendary' ? 'event-banner--pulse' : ''
            }`}
          >
            <div className="event-banner__row event-banner__row--top">
              <span className={`event-banner__rarity event-banner__rarity--${currentEvent.rarity}`}>
                {currentEvent.rarity}
              </span>
              <span className="event-banner__title">{currentEvent.title}</span>
              <span className="event-banner__phase">{EVENT_PHASE_LABELS[eventPhase]}</span>
            </div>
            <div className="event-banner__row event-banner__row--meta">
              <span className="event-banner__meta">📍 {currentEvent.location.displayName}</span>
              <span className="event-banner__meta-sep" aria-hidden>·</span>
              <span className="event-banner__meta">🎁 {currentEvent.reward.label}</span>
              {eventTimeRemaining > 0 && (
                <>
                  <span className="event-banner__meta-sep" aria-hidden>·</span>
                  <span className="event-banner__meta event-banner__meta--time">
                    ⏱ {formatEventTime(eventTimeRemaining)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Small pinned indicator — stays up the whole time the event
              is Live, distinct from (and smaller than) the banner above. */}
          {eventPhase === 'live' && (
            <div className="event-live-pin">
              <span className="event-live-pin__dot" aria-hidden />
              <span className="event-live-pin__label">LIVE</span>
              <span className="event-live-pin__title">{currentEvent.title}</span>
              {eventTimeRemaining > 0 && (
                <span className="event-live-pin__time">{formatEventTime(eventTimeRemaining)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mayor announcement — a non-blocking card, deliberately without a
          full-screen backdrop so it never interrupts movement or competes
          with the modal/dialogue "only one overlay open at a time" rule
          those use. Auto-clears the moment Announcement phase ends. */}
      {eventPhase === 'announcement' && currentEvent && (
        <div className="mayor-card" role="status" aria-live="polite">
          <span className="panel-corner panel-corner--tl" aria-hidden>◆</span>
          <span className="panel-corner panel-corner--tr" aria-hidden>◆</span>
          <span className="panel-corner panel-corner--bl" aria-hidden>◆</span>
          <span className="panel-corner panel-corner--br" aria-hidden>◆</span>
          <div className="mayor-card__header">
            <span className="mayor-card__icon" aria-hidden>📯</span>
            <span className="mayor-card__title">Mayor of RugTown</span>
          </div>
          <p className="mayor-card__text">
            <em>Citizens of RugTown...</em>
            <br />
            {currentEvent.description}
          </p>
        </div>
      )}
    </div>
  );
}
