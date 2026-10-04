export const CABIN_BONUS_ENTRY_MS = 1600;
export const CABIN_BONUS_ENTRY_COVERED_MS = 720;
export const CABIN_BONUS_ENTRY_REVEAL_MS = 1040;
export type CabinBonusEntryEvent = 'anticipation' | 'conjure' | 'covered' | 'reveal' | 'complete';
export type CabinBonusPlayback = { animated: boolean; paused: boolean; revealReady: boolean; timeScale: number; hidden?: boolean };
const CUES: ReadonlyArray<readonly [CabinBonusEntryEvent, number]> = [
  ['anticipation', 80], ['conjure', 240], ['covered', CABIN_BONUS_ENTRY_COVERED_MS], ['reveal', CABIN_BONUS_ENTRY_REVEAL_MS], ['complete', CABIN_BONUS_ENTRY_MS],
];
const speed = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : 1;

/** Visible presentation time, never wall time. Dense sea clouds cover the
 * viewport while the apparatus mounts. Every cue is single-use. */
export class CabinBonusEntryTimeline {
  private previous: number | null = null;
  private elapsed = 0;
  private readonly delivered = new Set<CabinBonusEntryEvent>();
  get elapsedMs() { return this.elapsed; }
  get covered() { return this.delivered.has('covered'); }
  get complete() { return this.delivered.has('complete'); }
  pause() { this.previous = null; }
  needsFrames(playback: CabinBonusPlayback) {
    return !this.complete && playback.animated && !playback.paused && !playback.hidden && speed(playback.timeScale) > 0
      && (!this.covered || playback.revealReady);
  }
  advance(now: number, playback: CabinBonusPlayback): CabinBonusEntryEvent[] {
    if (!this.needsFrames(playback)) { this.pause(); return []; }
    const delta = this.previous === null ? 0 : Math.max(0, Math.min(50, now - this.previous));
    this.previous = now;
    const next = Math.min(CABIN_BONUS_ENTRY_MS, this.elapsed + delta * speed(playback.timeScale));
    // A fast frame must not cross the mount cue and reveal in one step. The
    // parent gets at least one painted gate frame to mount/ready the new card.
    this.elapsed = this.covered ? next : Math.min(CABIN_BONUS_ENTRY_COVERED_MS, next);
    const events: CabinBonusEntryEvent[] = [];
    for (const [event, at] of CUES) {
      if (this.elapsed < at || this.delivered.has(event)) continue;
      this.delivered.add(event); events.push(event);
    }
    return events;
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };
/** The raster lantern light is a single soft rise and fall, with no flicker. */
export function cabinEntryGlint(elapsedMs: number) {
  const rise = smooth((elapsedMs - 50) / 260);
  const fall = 1 - smooth((elapsedMs - 420) / 450);
  const progress = clamp01(elapsedMs / 900);
  return { opacity: rise * fall * .88, scale: .65 + progress * .65, rotation: progress * 24 - 12 };
}
/** Eight particles catch the lantern's light while the sea clouds rise. */
export function cabinEntryParticle(elapsedMs: number, index: number) {
  const start = 160 + index * 36;
  const progress = clamp01((elapsedMs - start) / (CABIN_BONUS_ENTRY_MS - start));
  const opacity = smooth(progress / .22) * (1 - smooth((progress - .6) / .4)) * (index % 3 === 0 ? .7 : .52);
  return { opacity, x: Math.sin(progress * Math.PI) * (index % 2 ? -9 : 9), y: -38 * progress, scale: .65 + .35 * smooth(progress) };
}

export function cabinEntryCover(elapsedMs: number) {
  // The banks arrive first. Their opaque underlay only closes after the mist
  // has formed, so entry reads as a cloud wipe rather than a flat colour fade.
  return smooth((elapsedMs - 470) / 230) * (1 - smooth((elapsedMs - CABIN_BONUS_ENTRY_REVEAL_MS) / 560));
}

/** Three independent raster banks cross and rise. Their native alpha keeps
 * soft edges without a blur filter, canvas or a second scene renderer. */
export function cabinEntryCloud(elapsedMs: number, index: number) {
  const progress = clamp01(elapsedMs / CABIN_BONUS_ENTRY_MS);
  const rise = smooth((elapsedMs - index * 75) / 540);
  const fall = 1 - smooth((elapsedMs - (990 + index * 60)) / (610 - index * 60));
  const direction = index % 2 ? -1 : 1;
  return { opacity: rise * fall * (.94 - index * .03), x: direction * (progress - .5) * 28,
    y: 29 - smooth(progress) * 58, scale: .82 + smooth(progress) * .38 };
}
