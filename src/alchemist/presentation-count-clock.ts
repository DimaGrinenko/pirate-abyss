/** Elapsed presentation time survives holds; hidden time never catches up. */
export class PresentationCountClock {
  private previous: number | null = null;
  private elapsed = 0;
  private readonly duration: number;
  private finishFrom = 0;
  private finishElapsed = 0;
  private finishDuration: number | null = null;
  constructor(duration: number) { this.duration = duration; }
  resume(now: number) { this.previous = now; }
  pause() { this.previous = null; }
  /** Shorten the remaining reveal without replacing the displayed amount. */
  finishWithin(duration = 420) {
    if (this.progress >= 1 || this.finishDuration !== null) return;
    this.finishFrom = this.progress;
    this.finishDuration = Math.max(1, Math.min(duration, this.duration - this.elapsed));
  }
  finish() { this.elapsed = this.duration; this.finishDuration = null; }
  advance(now: number, timeScale = 1) {
    if (this.previous !== null) {
      const scale = Number.isFinite(timeScale) ? Math.max(0, Math.min(4, timeScale)) : 1;
      const delta = Math.max(0, Math.min(50, now - this.previous)) * scale;
      this.elapsed += delta;
      if (this.finishDuration !== null) this.finishElapsed += delta;
    }
    this.previous = now;
    return this.progress;
  }
  get elapsedMs() { return this.elapsed; }
  get progress() {
    if (this.finishDuration !== null) {
      const t = Math.min(1, this.finishElapsed / this.finishDuration);
      // Zero acceleration at either end keeps a requested skip a short reveal.
      const ease = t * t * t * (t * (t * 6 - 15) + 10);
      return this.finishFrom + (1 - this.finishFrom) * ease;
    }
    return Math.min(1, this.elapsed / Math.max(1, this.duration));
  }
}

/** Native completion may be immediate in a renderer fallback. Preserve the
 * visible copy fade, but never wait indefinitely for a lost Spine event. */
export class CeremonyExitGate {
  readonly clock = new PresentationCountClock(1600);
  private animationDone = false;
  private delivered = false;
  markAnimationComplete() { this.animationDone = true; }
  advance(now: number, reducedMotion = false, timeScale = 1) {
    this.clock.advance(now, timeScale);
    if (this.delivered || !reducedMotion && !(this.clock.elapsedMs >= 720 && this.animationDone || this.clock.progress >= 1)) return false;
    this.delivered = true;
    return true;
  }
}
