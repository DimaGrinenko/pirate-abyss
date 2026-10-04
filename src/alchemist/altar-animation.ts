import type { AnimationState, Skeleton, Slot } from '@esotericsoftware/spine-core';

export type AltarSceneVariant = 'welcome' | 'purchase' | 'intro' | 'summary' | 'exit';
/** Outro fractures at 1.38s; the count finishes at 4.03s before settle at 4.35s. */
export const BONUS_SUMMARY_COUNT_MS = 2650;

export function bonusSummaryHasReward(value: number): boolean { return value > 0; }

const rewardSlots = new WeakMap<Skeleton, Slot[]>();
/** Existing idle contains decorative flying coins. A zero total keeps the
 * intact guardian's body/face motion, without reward particles or fragments. */
export function applyAltarRewardVisibility(skeleton: Skeleton, rewarded: boolean): void {
  if (rewarded) return;
  let slots = rewardSlots.get(skeleton);
  if (!slots) {
    slots = skeleton.slots.filter(slot => /^(coin-|sparkle-|reward-gold-|reward-fragment-)/.test(slot.data.name));
    rewardSlots.set(skeleton, slots);
  }
  for (const slot of slots) slot.color.a = 0;
}

/** Pausing preserves the live pose, queued clips and already-delivered cues. */
export function setAltarAnimationHeld(state: AnimationState, animated: boolean, held: boolean) {
  state.timeScale = animated && !held ? 1 : 0;
}

/** A new held entrance is parked on frame zero until the doors clear. */
export function configureAltarAnimation(state: AnimationState, skeleton: Skeleton, variant: AltarSceneVariant, animated: boolean, held: boolean, rewarded = true) {
  if (variant === 'exit') {
    // Mix from the live chest pose; resetting here would visibly snap its lid.
    setAltarAnimationHeld(state, animated, held);
    const previous = state.getCurrent(0)?.animation?.name;
    const broken = previous === 'reward_break' || previous === 'reward_broken_idle' || previous === 'reward_broken_exit';
    const entry = state.setAnimation(0, broken ? 'reward_broken_exit' : 'exit', false);
    if (!animated) entry.trackTime = entry.animationEnd;
    state.apply(skeleton);
    applyAltarRewardVisibility(skeleton, rewarded);
    return;
  }
  state.clearTracks();
  skeleton.setToSetupPose();
  setAltarAnimationHeld(state, animated, held);
  if (!animated) {
    state.setAnimation(0, variant === 'summary' && rewarded ? 'reward_broken_idle' : 'idle', true).trackTime = .7;
  } else if (variant === 'summary' && !rewarded) {
    state.setAnimation(0, 'idle', true);
  } else if (variant === 'summary') {
    state.setAnimation(0, 'reward_break', false);
    state.addAnimation(0, 'reward_broken_idle', true, 0);
  } else {
    state.setAnimation(0, 'awakening', false);
    state.addAnimation(0, 'idle', true, 0);
  }
  state.apply(skeleton);
  applyAltarRewardVisibility(skeleton, rewarded);
}
