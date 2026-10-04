import type { Board } from './engine';
import { startVisibleDelay } from './visible-presentation-delay';

// Presentation cadence only. Every reel still resolves its native settlement,
// and every feature still resolves its own complete animation. Math is separate.
export const REEL_TIMING = { start: 300, settle: 180, stopInterval: 220, turboStart: 140, turboInterval: 110, anticipation: 1050 } as const;

export function spinMotionProfile(turbo: boolean, reduced: boolean) {
  return {
    reduced, start: turbo ? REEL_TIMING.turboStart : REEL_TIMING.start, minimumSpin: reduced ? 80 : turbo ? 380 : 600,
    speed: turbo ? 72 : 48, anticipationSpeed: turbo ? 28 : 18,
    stopInterval: reduced ? 35 : turbo ? REEL_TIMING.turboInterval : REEL_TIMING.stopInterval,
    anticipation: reduced ? 0 : turbo ? 550 : REEL_TIMING.anticipation,
    timeScale: turbo ? 2 : 1.25,
    winHold: reduced ? 180 : turbo ? 640 : 1000,
    emptyHold: reduced ? 100 : turbo ? 120 : 220,
    bonusHold: reduced ? 100 : turbo ? 320 : 550,
    curtainLead: reduced ? 0 : turbo ? 25 : 60,
    curtainStagger: reduced ? 0 : turbo ? 120 : 180,
    retriggerHold: reduced ? 180 : turbo ? 1000 : 1300,
  };
}
export type SpinMotionProfile = ReturnType<typeof spinMotionProfile>;

/** The result is inserted outside the viewport, then reaches exact cell centers.
 * A smooth velocity curve preserves entering speed and eases acceleration to
 * zero at both ends, so braking does not jerk into the landing animation.
 */
export function planReelStop(distance: number, speed: number, rows = 5) {
  const end = Math.ceil(distance) + rows, travel = end - distance;
  return { start: distance, end, duration: 2000 * travel / Math.max(1, speed) };
}
export function reelStopPosition(plan: ReturnType<typeof planReelStop>, elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / plan.duration));
  return plan.start + (plan.end - plan.start) * (2 * t - 2 * t ** 3 + t ** 4);
}

export function reelStopVelocity(plan: ReturnType<typeof planReelStop>, elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / plan.duration));
  return (plan.end - plan.start) * 1000 / plan.duration * (2 - 6 * t * t + 4 * t ** 3);
}

/** Small spring preparation with zero velocity AND acceleration at each join. */
export function reelPullback(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0 || t === 1) return 0;
  return -.09 * 64 * t ** 3 * (1 - t) ** 3;
}

/** One spin owns its timers and physical landing acknowledgements. Cancellation
 * resolves every wait, so unmount cannot strand a running async presentation.
 */
export class SpinPresentation {
  readonly id: number;
  cancelled = false;
  private timers = new Map<() => void, (completed: boolean) => void>();
  private reels = new Map<number, { resolve: (completed: boolean) => void; impact?: () => void; impacted: boolean }>();
  private effects = new Map<string, (completed: boolean) => void>();
  constructor(id: number) { this.id = id; }
  wait(ms: number): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    return new Promise(resolve => {
      const cancel = startVisibleDelay(ms, () => { this.timers.delete(cancel); resolve(true); });
      this.timers.set(cancel, resolve);
    });
  }
  expectReel(col: number, impact?: () => void): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    if (this.reels.has(col)) throw new Error(`Reel ${col} already awaited`);
    return new Promise(resolve => this.reels.set(col, { resolve, impact, impacted: false }));
  }
  stopped(col: number, id: number) {
    const reel = this.reels.get(col);
    if (this.cancelled || id !== this.id || !reel || reel.impacted) return;
    reel.impacted = true; reel.impact?.();
  }
  settled(col: number, id: number) {
    if (this.cancelled || id !== this.id) return;
    const reel = this.reels.get(col); if (!reel) return;
    this.stopped(col, id); this.reels.delete(col); reel.resolve(true);
  }
  /** A reveal ends when its visible animation acknowledges completion, including
   * the static fallback, rather than when an unrelated wall-clock timer expires. */
  expectEffect(name: string): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    if (this.effects.has(name)) throw new Error(`Effect ${name} already awaited`);
    return new Promise(resolve => this.effects.set(name, resolve));
  }
  completeEffect(name: string, id: number) {
    if (this.cancelled || id !== this.id) return;
    const resolve = this.effects.get(name);
    if (!resolve) return;
    this.effects.delete(name); resolve(true);
  }
  cancel() {
    this.cancelled = true;
    for (const [cancel, resolve] of this.timers) { cancel(); resolve(false); }
    this.timers.clear();
    for (const reel of this.reels.values()) reel.resolve(false);
    this.reels.clear();
    for (const resolve of this.effects.values()) resolve(false);
    this.effects.clear();
  }
}

/** Only already stopped reels may begin or continue the Wild anticipation. */
export function anticipationAfter(board: Board, stoppedCount: number): number | null {
  if (stoppedCount !== 3 && stoppedCount !== 4) return null;
  const homeWild = (col: number, type: string) => board[col].some(cell => cell.id === 'wild' && cell.wildType === type);
  if (!homeWild(1, 'blue') || !homeWild(2, 'red')) return null;
  if (stoppedCount === 3) return 3;
  return homeWild(3, 'gold') ? 4 : null;
}

export function orderedCurtains(reels: number[]): number[] {
  return [...new Set(reels)].sort((a, b) => a - b);
}

/** A third Scatter can only be teased after two actual stopped Scatters. */
export function scatterAnticipationAfter(board: Board, stoppedCount: number): number | null {
  if (stoppedCount < 3 || stoppedCount > 4) return null;
  const stoppedScatters = board.slice(0, stoppedCount).filter(column => column.some(cell => cell.id === 'scatter')).length;
  return stoppedScatters >= 2 ? stoppedCount : null;
}
