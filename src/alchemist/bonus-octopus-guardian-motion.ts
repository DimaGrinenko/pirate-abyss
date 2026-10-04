import type { AnimationState } from '@esotericsoftware/spine-core';

export type GuardianPlayback = { held: boolean; reducedMotion: boolean; timeScale: number; visible: boolean; viewport: boolean; ready: boolean };
export function guardianCanAnimate(p: GuardianPlayback) {
  return p.ready && p.visible && p.viewport && !p.held && !p.reducedMotion && Number.isFinite(p.timeScale) && p.timeScale > 0;
}

/** Playback changes never reset the actor; only a new presentation changes clip. */
export function playOctopusGuardian(state: AnimationState, intro: boolean, rewarded: boolean, staticPose = false) {
  state.data.defaultMix = .24;
  if (staticPose) {
    const entry = state.setAnimation(0, 'idle', true);
    entry.trackTime = .7;
    return;
  }
  const animation = intro ? 'intro' : rewarded ? 'reward' : 'idle';
  state.setAnimation(0, animation, animation === 'idle');
  if (animation !== 'idle') state.addAnimation(0, 'idle', true, 0);
}
