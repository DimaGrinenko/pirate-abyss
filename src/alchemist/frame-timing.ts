export type FrameTiming = {
  frames: number; elapsedMs: number; meanMs: number; p50Ms: number; p95Ms: number;
  p99Ms: number; maxMs: number; over25Ms: number; phases: Record<string, number>;
};

/** Measures actual presentation intervals, including stalls; hidden time is excluded explicitly. */
export class FrameTimingWindow {
  private previous: number | null = null;
  private intervals: number[] = [];
  private phases: Record<string, number> = {};
  private elapsed = 0;
  private durationMs: number;
  constructor(durationMs = 5000) { this.durationMs = durationMs; }

  reset() { this.previous = null; this.intervals = []; this.phases = {}; this.elapsed = 0; }

  record(time: number, phase: string): FrameTiming | null {
    if (!Number.isFinite(time)) return null;
    const previous = this.previous;
    this.previous = time;
    if (previous === null) return null;
    const interval = time - previous;
    if (interval <= 0) return null;
    this.intervals.push(interval);
    this.phases[phase] = (this.phases[phase] ?? 0) + 1;
    this.elapsed += interval;
    if (this.elapsed < this.durationMs) return null;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1];
    const result = {
      frames: sorted.length, elapsedMs: this.elapsed, meanMs: this.elapsed / sorted.length,
      p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
      maxMs: sorted.at(-1)!, over25Ms: sorted.filter(value => value > 25).length,
      phases: { ...this.phases },
    };
    this.intervals = []; this.phases = {}; this.elapsed = 0;
    return result;
  }
}
