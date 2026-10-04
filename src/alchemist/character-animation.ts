import type { AnimationState, TrackEntry } from '@esotericsoftware/spine-core';
import { installCaptainMixEasing } from './captain-mix';

/** Observe the reels, check the lamp, then look back; celebrations need events. */
export const CAPTAIN_AMBIENT_REACTIONS = ['look', 'lantern', 'look', 'curious'] as const;
/** Deterministic acting variety; neither random outcomes nor gameplay timing
 * depend on which native performance is selected. Large celebrations retain
 * their own unmistakable clips, while ordinary wins can be acknowledged. */
export const CAPTAIN_REACTION_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  approve: ['approve', 'approve-proud', 'approve-amused'],
  win: ['win', 'win-resolve'],
  curious: ['curious', 'curious-doubletake'],
  lantern: ['lantern', 'lantern-listen'],
};
// A glance should be an occasional thought. Comic double takes/listening stay
// available as explicit reactions, rather than repeatedly competing with reels.
export const CAPTAIN_AMBIENT_IDLE_SECONDS = 10.8;
export const CAPTAIN_ANIMATION_MIX = .48;
export const CAPTAIN_AMBIENT_MIX = .56;
/** Visible animation time, never a gameplay or wall-clock delay. */
export const CAPTAIN_BONUS_VISIBLE_BEAT_SECONDS = .65;
const REACTION_MIX: Record<string, number> = { surprise: .24, approve: .30, anticipation: .30, loss: .38, cast: .38, disappointed: .42 };
export const CAPTAIN_SUSTAINED_REACTIONS = ['anticipation', 'suspense', 'bonus'] as const;

/** Facial reactions reach their authored beat; large saber interruptions
 * retain a longer return blend because the raised hand travels further. */
export function configureCaptainMixes(state: AnimationState) {
  installCaptainMixEasing(state);
  state.data.defaultMix = CAPTAIN_ANIMATION_MIX;
  const setMix = (from: string, to: string, duration: number) => {
    if (state.data.skeletonData.findAnimation(from) && state.data.skeletonData.findAnimation(to)) state.data.setMix(from, to, duration);
  };
  for (const from of state.data.skeletonData.animations) for (const [to, duration] of Object.entries(REACTION_MIX)) {
    for (const name of CAPTAIN_REACTION_VARIANTS[to] ?? [to]) setMix(from.name, name, duration);
  }
  for (const reaction of CAPTAIN_AMBIENT_REACTIONS) setMix('idle', reaction, CAPTAIN_AMBIENT_MIX);
  setMix('anticipation', 'suspense', .4);
  // The extended saber has appreciable leverage. Let its raised cast pose
  // blend into the win stance instead of whipping the wrist through it.
  setMix('cast', 'win', .68);
  setMix('wave', 'anticipation', .68);
  setMix('salute', 'surprise', .64);
  setMix('cheer', 'disappointed', .66);
  // A new spin or tease can interrupt a fully raised saber. Those large
  // silhouette changes need their own return blend; the fast face reaction
  // mix is appropriate only when the arm was already near its resting pose.
  for (const from of ['cast', 'summon', 'win', 'win-resolve', 'wave', 'salute', 'cheer', 'triumph', 'bonus', 'bonus-hold']) {
    for (const to of ['anticipation', 'suspense', 'surprise', 'approve', 'approve-proud', 'approve-amused', 'loss', 'disappointed']) setMix(from, to, .64);
  }
  setMix('cast', 'win-resolve', .68);
  // Looking/listening now moves the complete silhouette; keep its large
  // off-axis arm pose from snapping into a short acknowledgement.
  for (const from of ['look','curious','curious-doubletake','lantern','lantern-listen','laugh']) {
    for (const to of ['anticipation','suspense','surprise','approve','approve-proud','approve-amused','loss','disappointed','win','win-resolve','cheer','triumph']) setMix(from,to,.64);
  }
  // Most real outcomes are replaced by the next turbo spin in 220–740ms.
  // A low-arm pose can acknowledge them promptly; large raised-arm returns
  // above keep their guarded mixtures.
  for (const from of ['idle','anticipation','anticipation-hold','suspense','suspense-hold','approve','approve-proud','approve-amused','loss','disappointed']) {
    for (const to of ['approve','approve-proud','approve-amused','loss','disappointed']) setMix(from,to,.24);
    setMix(from,'win',.28);setMix(from,'win-resolve',.28);
    setMix(from,'cheer',.32);setMix(from,'triumph',.32);
  }
  for (const name of CAPTAIN_SUSTAINED_REACTIONS) setMix(name, `${name}-hold`, .12);
}

/** Play the preparation once, then sustain its final posture. Repeating the
 * preparation on every loop made waiting look like another celebration. */
export function playCaptainReaction(state: AnimationState, mood: string, reducedMotion = false, variation = 0): TrackEntry {
  const sustained = (CAPTAIN_SUSTAINED_REACTIONS as readonly string[]).includes(mood);
  const variants = reducedMotion ? undefined : CAPTAIN_REACTION_VARIANTS[mood];
  const index = Number.isFinite(variation) ? Math.max(0, Math.floor(variation)) : 0;
  const performance = variants ? variants[index % variants.length] : mood;
  const current = state.getCurrent(0);
  const protectBonus = !reducedMotion && mood !== 'bonus' && current?.animation?.name === 'bonus'
    && current.trackTime < CAPTAIN_BONUS_VISIBLE_BEAT_SECONDS;
  // The bonus card pauses the exact skeleton. On dismissal, retain the first
  // visible beat while reels proceed. A newer cue replaces the queued cue,
  // so a win can never return to a stale anticipation after the bonus gesture.
  if (protectBonus) state.clearNext(current);
  const entry = protectBonus
    ? state.addAnimation(0, performance, mood === 'idle', CAPTAIN_BONUS_VISIBLE_BEAT_SECONDS)
    : state.setAnimation(0, performance, mood === 'idle');
  entry.mixAttachmentThreshold = .6;
  entry.alphaAttachmentThreshold = .6;
  if (reducedMotion) {
    entry.mixDuration = 0;
    entry.trackTime = .62;
  } else if (sustained) {
    // Explicit full entry duration: the last pose is the hold's first pose.
    // The short overlap adds breathing only after the authored accent lands.
    state.addAnimation(0, `${mood}-hold`, true, entry.animationEnd);
  } else if (mood !== 'idle') queueCaptainIdle(state);
  return entry;
}

export function setCaptainPlayback(state: AnimationState, animated: boolean, reducedMotion: boolean, paused = false, timeScale = 1) {
  const speed = Number.isFinite(timeScale) ? Math.max(.05, Math.min(2, timeScale)) : 1;
  state.timeScale = animated && !reducedMotion && !paused ? speed : 0;
}

/** Native overlap joins a reaction to the next breathing phrase. */
export function queueCaptainIdle(state: AnimationState): TrackEntry {
  return state.addAnimation(0, 'idle', true, 0);
}

export function queueCaptainIdleGesture(state: AnimationState, idle: TrackEntry, gesture: string): void {
  // Breathing can cross its native seamless loop while the field remains the
  // focus. The next phrase blends from the live pose, never a held last frame.
  idle.loop = true;
  state.addAnimation(0, gesture, false, Math.max(idle.trackTime, CAPTAIN_AMBIENT_IDLE_SECONDS));
  queueCaptainIdle(state);
}
