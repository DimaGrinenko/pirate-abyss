/** Adjusts only decorative pixel density after sustained visible frame pressure.
 * It never changes the animation clock, camera, geometry or draw cadence. */
export class DecorativeBackgroundBudget {
  private levels: number[];
  private level = 0;
  private previous: number | null = null;
  private samples = 0;
  private elapsed = 0;
  private slowFrames = 0;
  private slowWindows = 0;
  private fastElapsed = 0;

  constructor(nativeResolution: number) { this.levels = this.makeLevels(nativeResolution); }

  private makeLevels(value: number) {
    const native = Number.isFinite(value) && value > 0 ? Math.min(value, 1.25) : 1;
    return [...new Set([native, Math.min(native, 1), Math.min(native, .8)])];
  }

  get resolution() { return this.levels[this.level]; }

  setNativeResolution(value: number) {
    const levels = this.makeLevels(value);
    if (levels[0] === this.levels[0]) return;
    const wasNative = this.level === 0, previousResolution = this.resolution;
    this.levels = levels;
    const retained = levels.findIndex(resolution => resolution <= previousResolution);
    this.level = wasNative ? 0 : retained < 0 ? levels.length - 1 : retained;
    this.resetSampling();
  }

  /** Pauses, hidden tabs and real resizes do not count as sustained pressure. */
  resetSampling() {
    this.previous = null;
    this.samples = 0; this.elapsed = 0; this.slowFrames = 0;
    this.slowWindows = 0; this.fastElapsed = 0;
  }

  /** Returns true only when the existing render target needs a density change. */
  record(time: number) {
    if (!Number.isFinite(time)) return false;
    const previous = this.previous;
    this.previous = time;
    if (previous === null) return false;
    const interval = time - previous;
    if (interval <= 0 || interval > 1000) { this.resetSampling(); return false; }
    this.samples++; this.elapsed += interval;
    if (interval > 25) this.slowFrames++;
    if (this.samples < 30 || this.elapsed < 1000) return false;

    const mean = this.elapsed / this.samples;
    const slowFraction = this.slowFrames / this.samples;
    const slow = mean > 25 && slowFraction >= .35;
    const fast = mean <= 18.5 && slowFraction <= .05;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    this.fastElapsed = fast ? this.fastElapsed + this.elapsed : 0;
    this.samples = 0; this.elapsed = 0; this.slowFrames = 0;

    let changed = false;
    if (this.slowWindows >= 3 && this.level < this.levels.length - 1) { this.level++; changed = true; }
    else if (this.fastElapsed >= 30_000 && this.level > 0) { this.level--; changed = true; }
    if (changed) { this.slowWindows = 0; this.fastElapsed = 0; }
    return changed;
  }
}
