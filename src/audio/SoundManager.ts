/*
  SoundManager.ts
  ───────────────
  Lightweight, local-only sound system built entirely on the Web Audio
  API — no audio files, no network requests, no external dependencies.
  Every sound (UI tones, the ambience loop, the music loop) is a
  synthesized oscillator tone. Swapping in real audio files later would
  only mean changing the bodies of play()/startAmbience()/startMusic();
  the public API (unlock/setMuted/setVolume/play) would stay the same.

  Browser autoplay policies block audio until a user gesture anyway, so
  `unlock()` doubles as both "satisfy the browser" and "start muted/low
  until the player actually interacts" (this module defaults to muted).
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
  click:    { freq: 660, duration: 0.05, type: 'square' },
  modal:    { freq: 440, freq2: 660, duration: 0.16, type: 'sine' },
  reward:   { freq: 523, freq2: 784, duration: 0.22, type: 'triangle' },
  quest:    { freq: 392, freq2: 587, duration: 0.28, type: 'triangle' },
  event:    { freq: 330, duration: 0.14, type: 'sine' },
  chatSend: { freq: 880, duration: 0.06, type: 'square' },
  // Town Crier's bell — a bright two-tone "ding-dong" ring (play() already
  // sequences freq then freq2 with a short delay between them).
  bell:     { freq: 988, freq2: 1318.5, duration: 0.4, type: 'triangle' },
};

const MUSIC_NOTES = [261.63, 329.63, 392.0, 523.25]; // soft C-major arpeggio
const MUSIC_STEP_MS = 2600;

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channelGains: Partial<Record<SoundChannel, GainNode>> = {};

  private muted = true;
  private volumes: Record<SoundChannel, number> = {
    music: 0.25,
    ambience: 0.2,
    effects: 0.35,
  };

  private unlocked = false;
  private ambienceStarted = false;
  private musicStarted = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
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

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  getVolume(channel: SoundChannel): number {
    return this.volumes[channel];
  }

  setVolume(channel: SoundChannel, volume: number) {
    this.volumes[channel] = volume;
    const gain = this.channelGains[channel];
    if (this.ctx && gain) {
      gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  /** Plays a short synthesized one-shot tone for a named UI sound. */
  play(name: SoundEffectName) {
    if (!this.unlocked) return; // never make sound before a user gesture
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

  private playTone(freq: number, duration: number, type: OscillatorType, destination: GainNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Soft, continuous two-tone hum — the "city ambience" placeholder loop. */
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
    osc2.frequency.value = 110 * 1.5; // gentle, slightly-detuned fifth

    gain.gain.value = 0.0001;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(destination);

    osc1.start();
    osc2.start();
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 2.5);

    this.ambienceOscillators = [osc1, osc2];
  }

  /** Very simple, slow arpeggio loop — the "music" placeholder. */
  private startMusic() {
    if (this.musicStarted) return;
    const destination = this.channelGains.music;
    if (!this.ctx || !destination) return;
    this.musicStarted = true;

    let i = 0;
    const playNext = () => {
      if (this.channelGains.music) {
        this.playTone(MUSIC_NOTES[i % MUSIC_NOTES.length], 0.9, 'sine', this.channelGains.music);
      }
      i++;
    };
    playNext();
    this.musicTimer = setInterval(playNext, MUSIC_STEP_MS);
  }
}

/** Single shared instance — sound is an app-wide concern, not per-component. */
export const soundManager = new SoundManager();
