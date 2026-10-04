import type { TrackEntry } from '@esotericsoftware/spine-core';

/** Resume a newly constructed renderer at the last presented native track time. */
export function restoreInitialTrackTime(entry: Pick<TrackEntry, 'trackTime' | 'loop' | 'animationEnd'>, seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return;
  const time = Math.max(0, seconds);
  entry.trackTime = entry.loop ? time : Math.min(time, entry.animationEnd);
}
