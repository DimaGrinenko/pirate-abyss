/** Quiet pirate music, ship timber, treasure bells, and a musical captain reaction. */
import { assetUrl } from './assets';
import type { WinTier } from './win-tiers';

const BACKGROUND_MUSIC_VOLUME = 0.35;
export type MusicScene = 'base' | 'bonus' | 'celebration';
// Kept as an exported name for the existing preload contract. This is now the
// bonus score, not an unrelated pad layered over the exploration melody.
export const AMBIENT_MUSIC_FILE = 'pirate-bonus-v42.ogg';
export const MUSIC_SCENE_LEVELS = {
  base: { voyage: BACKGROUND_MUSIC_VOLUME, bonus: 0 },
  bonus: { voyage: 0, bonus: .4 },
  celebration: { voyage: 0, bonus: .26 },
} as const;
const MUSIC_RELEASE_MS = 2400;
export const AUDIO_FILES = {
  music: 'pirate-voyage-v42.ogg',
  laugh: 'laugh.ogg',
  'reel-loop': 'reel-loop.ogg',
  'reel-stop': 'reel-stop.ogg',
  'spin-start': 'spin-start.ogg',
  'curtain-open': 'curtain-open.ogg',
  'curtain-start': 'curtain-start.ogg',
  'line-win': 'line-win.ogg',
  click: 'click.ogg',
  bonus: 'bonus.ogg',
} as const;
const EFFECT_NAMES = ['laugh', 'reel-loop', 'reel-stop', 'spin-start', 'curtain-open', 'curtain-start', 'line-win', 'click', 'bonus'] as const;

export class LaboratoryAudio {
  private initialized = false;
  private audioExtension: 'ogg' | 'mp3' = 'ogg';
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private ambientMusic: HTMLAudioElement | null = null;
  private ambientGain: GainNode | null = null;
  private musicScene: MusicScene = 'base';
  private ambientRelease: ReturnType<typeof setTimeout> | null = null;
  private musicRelease: ReturnType<typeof setTimeout> | null = null;
  private ambientUnavailable = false;
  private ambientPlayGeneration = 0;
  private buffers = new Map<string, AudioBuffer>();
  private preloadTask: Promise<void> | null = null;
  private reelLoop: AudioBufferSourceNode | null = null;
  private reelGain: GainNode | null = null;
  private lastLaugh = -10;
  private laughSource: AudioBufferSourceNode | null = null;
  private generation = 0;
  private spinRequested = false;
  private reelRate = 1;
  private effectSources = new Map<AudioScheduledSourceNode, GainNode>();
  private anticipationSources = new Set<OscillatorNode>();
  private celebrationSources = new Set<AudioBufferSourceNode>();
  enabled = false;

  private audioFile(filename: string) {
    return assetUrl(`alchemist/audio/${filename.replace(/\.ogg$/, `.${this.audioExtension}`)}`);
  }
  private createMusic() {
    // Stream the long soundtrack instead of keeping a decoded stereo buffer in memory.
    const music = new Audio();
    // Older iOS Safari cannot decode the Ogg container. Keep the smaller
    // originals where supported; use gapless MP3 derivatives for both buses
    // and effect preloading on the same capability decision.
    if (typeof music.canPlayType === 'function') {
      const ogg = music.canPlayType('audio/ogg; codecs="vorbis"');
      this.audioExtension = ogg === 'probably' || ogg === 'maybe' ? 'ogg' : 'mp3';
    }
    music.crossOrigin = 'anonymous';
    music.src = this.audioFile(AUDIO_FILES.music);
    music.loop = true; music.preload = 'auto';
    music.volume = BACKGROUND_MUSIC_VOLUME;
    music.muted = true;
    return music;
  }
  private initialize() {
    if (this.initialized) return;
    this.initialized = true; this.music = this.createMusic();
    document.addEventListener('visibilitychange', () => this.syncMusic());
    try { this.context = new AudioContext(); } catch { return; }
    this.master = this.context.createGain(); this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    this.effects = this.context.createGain();
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 4;
    this.effects.connect(compressor).connect(this.master);
    let source: MediaElementAudioSourceNode | null = null;
    const musicGain = this.context.createGain();
    musicGain.gain.value = BACKGROUND_MUSIC_VOLUME;
    try {
      source = this.context.createMediaElementSource(this.music);
      source.connect(musicGain).connect(this.master);
      this.musicGain = musicGain;
      // The gain node owns the 35% setting. Do not apply it a second time on
      // the media element or send music through the effects compressor.
      this.music.volume = 1;
    } catch {
      musicGain.disconnect();
      if (source) {
        source.disconnect(); this.music.pause();
        // A captured element cannot return to native output after disconnect.
        this.music.removeAttribute('src'); this.music.load(); this.music = this.createMusic();
      }
    }
  }
  private syncMusic() {
    if (!this.music) return;
    const audible = this.enabled && !document.hidden;
    if (this.musicRelease !== null) { clearTimeout(this.musicRelease); this.musicRelease = null; }
    // A failed Web Audio capture retains the quiet native base stream. The
    // successful route crossfades to one score, without incompatible melodies
    // continuing simultaneously throughout the whole bonus.
    const baseTarget = this.ambientGain && !this.ambientUnavailable ? MUSIC_SCENE_LEVELS[this.musicScene].voyage : BACKGROUND_MUSIC_VOLUME;
    if (this.master && this.context) this.master.gain.setTargetAtTime(audible ? 1 : 0, this.context.currentTime, .12);
    if (this.musicGain && this.context) this.musicGain.gain.setTargetAtTime(audible ? baseTarget : 0, this.context.currentTime, .45);
    this.music.volume = this.musicGain ? 1 : BACKGROUND_MUSIC_VOLUME;
    this.music.muted = !audible;
    if (audible) {
      if (this.context) void this.context.resume().catch(() => {});
      if (baseTarget > 0) void this.music.play().catch(() => {});
      else if (!this.music.paused) {
        this.musicRelease = setTimeout(() => {
          this.musicRelease = null;
          if (this.musicScene !== 'base') this.music?.pause();
        }, MUSIC_RELEASE_MS);
      }
      if (this.spinRequested && !this.reelLoop) this.startReelLoop();
    } else {
      this.music.pause();
      // Keep the ongoing visual spin's intent, but discard one-shot cues. A
      // returning tab must never play notes belonging to a previous pose.
      this.stopReelLoop();
      for (const source of this.effectSources.keys()) this.stopEffect(source);
    }
    this.syncAmbient(audible);
  }
  /** Move from exploration to the captain's score, retaining each loop's place. */
  setMusicScene(scene: MusicScene) {
    if (this.musicScene === scene) return;
    this.musicScene = scene;
    this.initialize();
    this.prepareAmbientMusic();
    this.syncMusic();
  }
  /** Warm the single streamed element during loading, without allocating a
   * decoded AudioBuffer or starting inaudible background playback. */
  private prepareAmbientMusic() {
    if (!this.ambientMusic && this.context && this.musicGain && this.master) {
      const element = new Audio();
      element.crossOrigin = 'anonymous'; element.src = this.audioFile(AMBIENT_MUSIC_FILE);
      element.loop = true; element.preload = 'auto'; element.volume = 1; element.muted = true;
      const gain = this.context.createGain(); gain.gain.value = 0;
      let source: MediaElementAudioSourceNode | null = null;
      try {
        source = this.context.createMediaElementSource(element); source.connect(gain).connect(this.master);
        element.load();
        this.ambientMusic = element; this.ambientGain = gain;
        element.onerror = () => this.recoverAmbientMusic();
      } catch {
        source?.disconnect(); gain.disconnect(); element.pause(); element.removeAttribute('src'); element.load();
      }
    }
  }
  private syncAmbient(audible: boolean) {
    const generation = ++this.ambientPlayGeneration;
    if (this.ambientRelease !== null) { clearTimeout(this.ambientRelease); this.ambientRelease = null; }
    const element = this.ambientMusic, gain = this.ambientGain;
    if (!element || !gain || !this.context) return;
    const target = MUSIC_SCENE_LEVELS[this.musicScene].bonus;
    gain.gain.setTargetAtTime(audible ? target : 0, this.context.currentTime, .45);
    if (!audible) { element.muted = true; element.pause(); return; }
    element.muted = false;
    if (target > 0) void element.play().then(() => {
      if (generation !== this.ambientPlayGeneration || !this.enabled || document.hidden || this.musicScene === 'base') return;
      if (this.ambientUnavailable) {
        this.ambientUnavailable = false;
        this.syncMusic();
      }
    }).catch(() => {
      if (generation !== this.ambientPlayGeneration || !this.enabled || document.hidden || this.musicScene === 'base') return;
      this.recoverAmbientMusic();
    });
    else if (!element.paused) {
      this.ambientRelease = setTimeout(() => {
        this.ambientRelease = null;
        if (this.musicScene === 'base') element.pause();
      }, MUSIC_RELEASE_MS);
    }
  }
  /** A stream/gesture failure must never fade the healthy voyage into silence.
   * A later scene change, unmute or visibility return may retry the same bonus
   * element; stale play promises cannot revive audio behind a hidden tab. */
  private recoverAmbientMusic() {
    this.ambientUnavailable = true;
    ++this.ambientPlayGeneration;
    this.ambientMusic?.pause();
    if (this.ambientMusic) this.ambientMusic.muted = true;
    if (this.context) this.ambientGain?.gain.setTargetAtTime(0, this.context.currentTime, .12);
    if (this.musicRelease !== null) { clearTimeout(this.musicRelease); this.musicRelease = null; }
    if (!this.enabled || document.hidden || !this.music || !this.context) return;
    this.musicGain?.gain.setTargetAtTime(BACKGROUND_MUSIC_VOLUME, this.context.currentTime, .25);
    void this.music.play().catch(() => {});
  }
  preload() {
    this.initialize();
    this.prepareAmbientMusic();
    if (!this.context) return Promise.resolve();
    if (!this.preloadTask) this.preloadTask = Promise.all(EFFECT_NAMES.map(async name => {
      if (this.buffers.has(name)) return;
      const response = await fetch(this.audioFile(AUDIO_FILES[name]));
      if (!response.ok) throw new Error(`Missing audio ${name}`);
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(name, buffer);
    })).then(() => undefined).catch(error => { this.preloadTask = null; throw error; });
    return this.preloadTask;
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled; this.initialize();
    if (enabled) void this.preload().catch(() => {});
    this.syncMusic();
  }
  private sample(name: string, volume: number, rate = 1, delay = 0, cutoff = 9000) {
    if (!this.enabled || document.hidden || !this.context || !this.effects) return;
    const buffer = this.buffers.get(name); if (!buffer) return;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
    const gain = this.context.createGain(); gain.gain.value = volume;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff;
    source.connect(filter).connect(gain).connect(this.effects);
    this.effectSources.set(source, gain);
    source.start(this.context.currentTime + delay);
    source.onended = () => { this.effectSources.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return source;
  }
  private bell(frequency: number, delay = 0, volume = .045, duration = .5, group?: Set<OscillatorNode>) {
    if (!this.enabled || document.hidden || !this.context || !this.effects) return;
    const time = this.context.currentTime + delay;
    for (const harmonic of [1, 2, 4.2]) {
      const oscillator = this.context.createOscillator(), gain = this.context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency * harmonic, time);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * harmonic * .985, time + duration);
      gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume / harmonic, time + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      this.effectSources.set(oscillator, gain); group?.add(oscillator);
      oscillator.connect(gain).connect(this.effects); oscillator.start(time); oscillator.stop(time + duration + .02);
      oscillator.onended = () => { this.effectSources.delete(oscillator); group?.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    }
  }
  private stopEffect(source: AudioScheduledSourceNode) {
    const gain = this.effectSources.get(source);
    if (!gain || !this.context) return;
    this.effectSources.delete(source);
    this.anticipationSources.delete(source as OscillatorNode);
    this.celebrationSources.delete(source as AudioBufferSourceNode);
    if (this.laughSource === source) this.laughSource = null;
    // A short release prevents discontinuities when cancelling an audible bell;
    // stopping before its scheduled start also cancels future notes.
    const now = this.context.currentTime;
    if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(now);
    else gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .008);
    source.stop(now + .035);
  }
  private stopAnticipation() {
    for (const source of this.anticipationSources) this.stopEffect(source);
    this.anticipationSources.clear();
  }
  startSpin() {
    this.endSpin(); this.spinRequested = true; this.reelRate = 1;
    if (!this.enabled || document.hidden) return;
    this.sample('spin-start', .40, .94, 0, 4500);
    this.bell(146.83, .02, .025, .35);
    this.startReelLoop();
  }
  private startReelLoop() {
    const generation = ++this.generation;
    const start = () => {
      if (!this.spinRequested || this.reelLoop || !this.enabled || document.hidden || generation !== this.generation || !this.context || !this.effects) return;
      const buffer = this.buffers.get('reel-loop'); if (!buffer) return;
      const source = this.context.createBufferSource(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
      source.buffer = buffer; source.loop = true; source.playbackRate.value = this.reelRate;
      gain.gain.setValueAtTime(0, this.context.currentTime); gain.gain.linearRampToValueAtTime(.12, this.context.currentTime + .3);
      filter.type = 'lowpass'; filter.frequency.value = 3100;
      source.connect(filter).connect(gain).connect(this.effects); source.start();
      this.reelLoop = source; this.reelGain = gain;
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    };
    if (this.buffers.has('reel-loop')) start(); else void this.preload().then(start).catch(() => {});
  }
  stopReel(index: number, special: boolean) {
    this.stopAnticipation(); this.reelRate = 1;
    this.sample('reel-stop', .28, .94 + index * .025, 0, 4700);
    if (special) { this.bell(220 * 2 ** (index / 12), .03, .045, .85); this.bell(440 * 2 ** (index / 12), .07, .025, .55); }
    if (this.context && this.reelLoop) this.reelLoop.playbackRate.setTargetAtTime(1, this.context.currentTime, .15);
  }
  anticipate(reel: number) {
    this.stopAnticipation(); this.reelRate = .52;
    if (this.context && this.reelLoop) this.reelLoop.playbackRate.setTargetAtTime(.52, this.context.currentTime, .3);
    [0, .35, .65, .9, 1.1, 1.28, 1.42].forEach((delay, i) => this.bell(160 + reel * 35 + i * 28, delay, .03 + i * .003, .35, this.anticipationSources));
  }
  endSpin() {
    this.spinRequested = false;
    this.stopAnticipation();
    this.stopReelLoop();
  }
  private stopReelLoop() {
    ++this.generation;
    if (this.reelLoop && this.context) {
      this.reelGain?.gain.setTargetAtTime(0, this.context.currentTime, .06);
      this.reelLoop.stop(this.context.currentTime + .25); this.reelLoop = null; this.reelGain = null;
    }
  }
  curtainCue(cue: 'release' | 'open' | 'award', reel: number) {
    // Native animation events keep the rope, sail and award in sync at any speed.
    if (cue === 'release') this.sample('curtain-start', .26, .80 + reel * .03, 0, 3800);
    else if (cue === 'open') this.sample('curtain-open', .23, .86, 0, 4200);
    else [146.83, 220, 293.66, 440].forEach((f, i) => this.bell(f, i * .1, .045, 1.2));
  }
  laugh() {
    if (!this.enabled || !this.context || this.laughSource || this.context.currentTime - this.lastLaugh < 5.5) return;
    // A short CC0-derived musical response; this is intentionally not a voice recording.
    const source = this.sample('laugh', .2, 1, 0, 6200);
    if (!source) return;
    this.lastLaugh = this.context.currentTime;
    this.laughSource = source;
    source.addEventListener('ended', () => {
      if (this.laughSource === source) this.laughSource = null;
    }, { once: true });
  }

  /** Fired by the visible Spine timeline, so hidden tabs cannot outrun the image. */
  bonusTransitionCue(phase: 'anticipation' | 'conjure' | 'reveal') {
    if (phase === 'anticipation') {
      this.bell(220, 0, .025, .7); this.bell(440, .09, .017, .6);
      return;
    }
    if (phase === 'conjure') {
      this.sample('curtain-open', .22, 1.05, 0, 6800);
      [293.66, 369.99, 440, 587.33].forEach((note, index) => this.bell(note, index * .1, .03, .7));
      return;
    }
    this.play('bonus');
  }

  private stopCelebration() {
    for (const source of this.celebrationSources) this.stopEffect(source);
    this.celebrationSources.clear();
  }

  /** Native pose cues own the timing; no delayed wall-clock soundtrack. */
  private ceremonySample(name: string, volume: number, rate = 1, cutoff = 6500) {
    const source = this.sample(name, volume, rate, 0, cutoff);
    if (!source) return;
    this.celebrationSources.add(source);
    source.addEventListener('ended', () => this.celebrationSources.delete(source), { once: true });
  }

  stopCeremonyEffects() { this.stopCelebration(); }

  /** The physical window contact owns this subdued timber thud and short creak. */
  sharkImpactCue(): () => void {
    const voices: AudioBufferSourceNode[] = [];
    if (!this.enabled || document.hidden || !this.context) return () => {};
    const now = this.context.currentTime;
    for (const [name, volume, rate, delay, cutoff, duration] of [
      ['reel-stop', .105, .70, 0, 1000, .46],
      ['curtain-start', .055, .82, .025, 1600, .64],
      ['click', .025, .72, .11, 1900, .25],
    ] as const) {
      const source = this.sample(name, volume, rate, delay, cutoff);
      if (!source) continue;
      voices.push(source);
      const gain = this.effectSources.get(source);
      gain?.gain.setTargetAtTime(0, now + delay + duration * .48, .06);
      source.stop(now + delay + duration);
    }
    return () => { for (const source of voices) this.stopEffect(source); };
  }

  bigwinCue(tier: WinTier, cue: string) {
    if (cue === 'impact') {
      this.ceremonySample(tier === 'epic' ? 'curtain-start' : 'spin-start', .18, tier === 'max' ? .74 : .94);
    } else if (cue === 'treasure') {
      this.ceremonySample('line-win', .20, tier === 'mega' ? 1.16 : 1.02);
    } else if (cue === 'celebrate') {
      this.ceremonySample('bonus', .15, tier === 'max' ? 1 : 1.16);
    }
  }

  chestBreakCue(cue: 'squeeze' | 'crack' | 'gold-land') {
    // Retained CC0 wood/plank and brass sounds follow the actual fracture and
    // landing frames. All sources stop on mute, tab hiding or ceremony exit.
    if (cue === 'squeeze') this.ceremonySample('curtain-start', .14, .65, 3000);
    else if (cue === 'crack') {
      this.ceremonySample('reel-stop', .31, .76, 6800);
      this.ceremonySample('curtain-start', .17, 1.24, 7800);
    } else {
      this.ceremonySample('spin-start', .18, 1.7, 8500);
      this.ceremonySample('line-win', .16, 1.18, 7000);
    }
  }

  celebrate(tier: WinTier) {
    this.stopCelebration();
    // Distinct CC0 percussion phrases: rolling wood, crab clicks, treasure bells,
    // a deep Kraken swell, ship fanfare, and the full crew's final parade.
    const cues: Record<WinTier, readonly (readonly [string, number, number, number])[]> = {
      big: [['spin-start', 0, .22, .82], ['reel-stop', .48, .18, .9], ['line-win', .7, .24, 1]],
      super: [['click', .16, .18, 1.2], ['click', .4, .2, .9], ['laugh', .62, .21, 1.12], ['line-win', .84, .22, 1.2]],
      mega: [['curtain-start', 0, .19, .8], ['reel-stop', .64, .2, .75], ['curtain-open', .94, .22, 1], ['line-win', 1.16, .25, 1.05], ['line-win', 1.6, .2, 1.32]],
      epic: [['curtain-open', 0, .2, .6], ['curtain-start', .65, .2, .7], ['bonus', 1.18, .28, .78], ['line-win', 1.4, .22, .95]],
      legendary: [['curtain-open', 0, .2, .9], ['spin-start', .6, .18, .7], ['bonus', 1.44, .26, 1], ['line-win', 1.66, .2, 1.32], ['laugh', 2.2, .2, .95]],
      max: [['curtain-start', 0, .2, .7], ['spin-start', .4, .2, .85], ['click', .8, .15, 1.2], ['curtain-open', 1.15, .2, 1.05], ['bonus', 1.62, .28, .9], ['line-win', 1.84, .21, 1.12], ['laugh', 3.45, .19, 1], ['line-win', 4.2, .21, 1.33]],
    };
    const own = new Set<AudioBufferSourceNode>();
    for (const [name, delay, volume, rate] of cues[tier]) {
      const source = this.sample(name, volume, rate, delay, 6500);
      if (!source) continue;
      own.add(source); this.celebrationSources.add(source);
      source.addEventListener('ended', () => { own.delete(source); this.celebrationSources.delete(source); }, { once: true });
    }
    return () => {
      for (const source of own) {
        if (this.celebrationSources.has(source)) this.stopEffect(source);
      }
      own.clear();
    };
  }

  play(kind: 'click' | 'spin' | 'stop' | 'win' | 'bonus' | 'cast') {
    if (kind === 'spin') return this.startSpin();
    if (kind === 'stop') return this.stopReel(0, false);
    if (kind === 'click') { this.sample('click', .18, .9); return; }
    if (kind === 'win') { this.sample('line-win', .28, .94, 0, 6200); return; }
    if (kind === 'bonus') this.sample('bonus', .35, .85, 0, 5500);
    else this.sample('curtain-start', .22, .80, 0, 4000);
    const notes = kind === 'bonus' ? [164.81, 246.94, 329.63, 493.88, 659.25] : [146.83, 220, 440];
    notes.forEach((f, i) => this.bell(f, i * .12, .045, 1.2));
  }
}
export const laboratoryAudio = new LaboratoryAudio();
