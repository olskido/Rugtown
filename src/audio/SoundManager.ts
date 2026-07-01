/*
  SoundManager.ts
  ───────────────
  Lightweight, local-only sound system built entirely on the Web Audio
  API — no audio files, no network requests, no external dependencies.
  Every sound is a synthesized oscillator tone.

  Part F: Three background beat tracks that shuffle every 45-90 seconds:
  0 = Dark City  (slow, minor, atmospheric bass)
  1 = Market Pulse (medium-tempo rhythmic with melody)
  2 = Event Tension (faster, tense, minor feel)
*/

export type SoundChannel = 'music' | 'ambience' | 'effects';

export type SoundEffectName =
  | 'click'
  | 'modal'
  | 'reward'
  | 'quest'
  | 'event'
  | 'chatSend'
  | 'bell';

interface TonePreset {
  freq: number;
  freq2?: number;
  duration: number;
  type: OscillatorType;
}

const EFFECT_PRESETS: Record<SoundEffectName, TonePreset> = {
  click:    { freq: 660,    duration: 0.05, type: 'square' },
  modal:    { freq: 440,    freq2: 660,   duration: 0.16, type: 'sine' },
  reward:   { freq: 523,    freq2: 784,   duration: 0.22, type: 'triangle' },
  quest:    { freq: 392,    freq2: 587,   duration: 0.28, type: 'triangle' },
  event:    { freq: 330,    duration: 0.14, type: 'sine' },
  chatSend: { freq: 880,    duration: 0.06, type: 'square' },
  bell:     { freq: 988,    freq2: 1318.5, duration: 0.4, type: 'triangle' },
};

/* ─── Background beat track definitions ───
   Each track is a looping sequence of steps.
   null = silence step; vol defaults to 0.35 if omitted. */
interface BeatStep { freq: number; type: OscillatorType; dur: number; vol?: number; }

interface BeatTrack {
  /** ms between steps */
  stepMs: number;
  steps: (BeatStep | null)[];
}

const BEAT_TRACKS: BeatTrack[] = [
  // Track 0: Dark City Ambience — slow, minor, atmospheric
  {
    stepMs: 600,
    steps: [
      { freq: 55.0,  type: 'sine', dur: 0.44, vol: 0.45 },
      null,
      { freq: 82.4,  type: 'sine', dur: 0.22, vol: 0.28 },
      null,
      { freq: 55.0,  type: 'sine', dur: 0.38, vol: 0.40 },
      { freq: 110.0, type: 'sine', dur: 0.10, vol: 0.18 },
      null,
      { freq: 69.3,  type: 'sine', dur: 0.28, vol: 0.30 },
    ],
  },
  // Track 1: Market Pulse — medium tempo, rhythmic bass + melodic hints
  {
    stepMs: 375,
    steps: [
      { freq: 110.0, type: 'square',   dur: 0.12, vol: 0.30 },
      { freq: 261.6, type: 'sine',     dur: 0.08, vol: 0.16 },
      { freq: 82.4,  type: 'square',   dur: 0.16, vol: 0.28 },
      { freq: 329.6, type: 'sine',     dur: 0.07, vol: 0.14 },
      { freq: 110.0, type: 'square',   dur: 0.12, vol: 0.30 },
      { freq: 293.7, type: 'sine',     dur: 0.08, vol: 0.14 },
      { freq: 82.4,  type: 'square',   dur: 0.12, vol: 0.26 },
      null,
    ],
  },
  // Track 2: Event Tension — faster, tense, minor feel
  {
    stepMs: 300,
    steps: [
      { freq: 146.8, type: 'sawtooth', dur: 0.18, vol: 0.26 },
      { freq: 185.0, type: 'sine',     dur: 0.08, vol: 0.16 },
      { freq: 174.6, type: 'sawtooth', dur: 0.18, vol: 0.24 },
      null,
      { freq: 146.8, type: 'sawtooth', dur: 0.22, vol: 0.30 },
      { freq: 220.0, type: 'sine',     dur: 0.09, vol: 0.14 },
      { freq: 196.0, type: 'sawtooth', dur: 0.14, vol: 0.22 },
      { freq: 185.0, type: 'sine',     dur: 0.08, vol: 0.14 },
    ],
  },
];

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channelGains: Partial<Record<SoundChannel, GainNode>> = {};

  private muted = false;
  private volumes: Record<SoundChannel, number> = {
    music:    0.18,
    ambience: 0.22,
    effects:  0.35,
  };

  private unlocked = false;
  private ambienceStarted = false;
  private musicStarted = false;

  /* ── Beat track state ── */
  private beatTrackIdx = 0;
  private beatStepIdx = 0;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private beatShuffleTimer: ReturnType<typeof setTimeout> | null = null;

  /* ── Ambience ── */
  private ambienceOscillators: OscillatorNode[] = [];

  /** Call once on the first user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ensureContext();
    this.ctx?.resume().catch(() => {});
    this.startAmbience();
    this.startMusic();
  }

  isMuted(): boolean { return this.muted; }

  isUnlocked(): boolean { return this.unlocked; }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  getVolume(channel: SoundChannel): number { return this.volumes[channel]; }

  setVolume(channel: SoundChannel, volume: number) {
    this.volumes[channel] = volume;
    const gain = this.channelGains[channel];
    if (this.ctx && gain) {
      gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  play(name: SoundEffectName) {
    if (!this.unlocked) return;
    this.ensureContext();
    const ctx = this.ctx;
    const destination = this.channelGains.effects;
    if (!ctx || !destination) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const preset = EFFECT_PRESETS[name];
    this.playTone(preset.freq, preset.duration, preset.type, destination);
    if (preset.freq2) {
      setTimeout(() => {
        if (this.ctx && destination) this.playTone(preset.freq2!, preset.duration, preset.type, destination);
      }, preset.duration * 500);
    }
  }

  private ensureContext() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 1;
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = master;

    (['music', 'ambience', 'effects'] as SoundChannel[]).forEach(channel => {
      const gain = ctx.createGain();
      gain.gain.value = this.volumes[channel];
      gain.connect(master);
      this.channelGains[channel] = gain;
    });
  }

  private playTone(freq: number, duration: number, type: OscillatorType, destination: GainNode, vol = 0.55) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Soft, continuous two-tone hum — city ambience placeholder. */
  private startAmbience() {
    if (this.ambienceStarted) return;
    const ctx = this.ctx;
    const destination = this.channelGains.ambience;
    if (!ctx || !destination) return;
    this.ambienceStarted = true;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = 110;
    osc2.frequency.value = 110 * 1.5;

    gain.gain.value = 0.0001;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(destination);

    osc1.start();
    osc2.start();
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 2.5);

    this.ambienceOscillators = [osc1, osc2];
  }

  /* ─── Music: 3 shuffling beat tracks ─── */

  private startMusic() {
    if (this.musicStarted) return;
    this.musicStarted = true;
    // Random starting track
    this.beatTrackIdx = Math.floor(Math.random() * BEAT_TRACKS.length);
    this.runBeatTrack();
    this.scheduleNextShuffle();
  }

  private runBeatTrack() {
    if (this.beatTimer) {
      clearInterval(this.beatTimer);
      this.beatTimer = null;
    }
    this.beatStepIdx = 0;
    const track = BEAT_TRACKS[this.beatTrackIdx];

    const tick = () => {
      const dest = this.channelGains.music;
      if (!dest || !this.ctx) return;
      const step = track.steps[this.beatStepIdx % track.steps.length];
      if (step) {
        this.playTone(step.freq, step.dur, step.type, dest, step.vol ?? 0.35);
      }
      this.beatStepIdx++;
    };

    tick(); // play first step immediately
    this.beatTimer = setInterval(tick, track.stepMs);
  }

  private scheduleNextShuffle() {
    if (this.beatShuffleTimer) clearTimeout(this.beatShuffleTimer);
    const delay = 45_000 + Math.random() * 45_000; // 45-90 seconds
    this.beatShuffleTimer = setTimeout(() => {
      this.shuffleToNextTrack();
      this.scheduleNextShuffle();
    }, delay);
  }

  private shuffleToNextTrack() {
    // Pick any track that's different from the current one
    const count = BEAT_TRACKS.length;
    let next = this.beatTrackIdx;
    for (let attempts = 0; attempts < 5 && next === this.beatTrackIdx; attempts++) {
      next = Math.floor(Math.random() * count);
    }
    this.beatTrackIdx = next;
    this.runBeatTrack();
  }
}

/** Single shared instance — sound is an app-wide concern, not per-component. */
export const soundManager = new SoundManager();
