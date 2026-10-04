import type { AnimationState, TrackEntry } from '@esotericsoftware/spine-core';

/** Constant cruise speed with a short cosine acceleration and braking interval.
 * The native transition clock and queued cue delays remain exact. */
export function captainMixWeight(progress: number): number {
  const u = Math.max(0, Math.min(1, progress)), ramp = .20;
  const edge = (t: number) => (t - ramp / Math.PI * Math.sin(Math.PI * t / ramp)) / (2 * (1 - ramp));
  if (u < ramp) return edge(u);
  if (u > 1 - ramp) return 1 - edge(1 - u);
  return (u - ramp / 2) / (1 - ramp);
}

const installed = new WeakSet<AnimationState>();
/** Spine's default mix is linear, so a raised wrist abruptly starts and stops
 * at its blend boundaries. Ease only the temporary pose weights, never its
 * update clock. Restore elapsed time before queue/lifecycle scheduling. */
export function installCaptainMixEasing(state: AnimationState): void {
  if (installed.has(state)) return;
  installed.add(state);
  const nativeApply = state.apply, nativeSetCurrent = state.setCurrent;
  let applying = false;
  state.apply = function (skeleton) {
    if (applying) return nativeApply.call(this, skeleton);
    const restored: [TrackEntry, number][] = [], seen = new Set<TrackEntry>();
    for (const track of this.tracks) for (let entry = track; entry; entry = entry.mixingFrom) {
      if (seen.has(entry) || entry.mixDuration <= 0) continue;
      seen.add(entry);
      restored.push([entry, entry.mixTime]);
      entry.mixTime = captainMixWeight(entry.mixTime / entry.mixDuration) * entry.mixDuration;
    }
    applying = true;
    try { return nativeApply.call(this, skeleton); }
    finally {
      for (const [entry, elapsed] of restored) entry.mixTime = elapsed;
      applying = false;
    }
  };
  state.setCurrent = function (index, current, interrupt) {
    const from = this.tracks[index];
    if (applying || !from?.mixingFrom || from.mixDuration <= 0) {
      nativeSetCurrent.call(this, index, current, interrupt); return;
    }
    const elapsed = from.mixTime;
    // An interrupted overlap must retain the actual eased weight; otherwise
    // the next cue would briefly jump to the old linear blend percentage.
    from.mixTime = captainMixWeight(elapsed / from.mixDuration) * from.mixDuration;
    try { nativeSetCurrent.call(this, index, current, interrupt); }
    finally { from.mixTime = elapsed; }
  };
}

