import type { AnimationState, TrackEntry } from '@esotericsoftware/spine-canvas';

export type CanvasCommand = {
  animation: string;
  animationKey?: string | number;
  loop: boolean;
  nextAnimation?: string | readonly string[];
};
export type CanvasTrackRun = { key: string; entry: TrackEntry; completed: boolean };
type CanvasVisualSettings = {
  animated: boolean;
  environmentBonus: boolean;
  environmentReduced: boolean;
  environmentVolume: boolean;
};

/** Symbols freeze their already painted pose when covered. For effects the
 * motion preference can also change composition, such as a curtain's clip. */
export function canvasVisualSettingsChanged(previous: CanvasVisualSettings | undefined, next: CanvasVisualSettings, symbolScene: boolean): boolean {
  return !previous || (!symbolScene && previous.animated !== next.animated)
    || previous.environmentBonus !== next.environmentBonus
    || previous.environmentReduced !== next.environmentReduced
    || previous.environmentVolume !== next.environmentVolume;
}

/** A command owns its queued tracks. Pausing or changing speed is not a new
 * command, even after a one-shot has advanced into its queued idle. */
export function configureCanvasTrack(state: AnimationState, command: CanvasCommand, previous?: CanvasTrackRun): CanvasTrackRun {
  const sequence = typeof command.nextAnimation === 'string' ? [command.nextAnimation] : command.nextAnimation ?? [];
  const key = JSON.stringify([command.animation, command.animationKey, command.loop, sequence]);
  if (previous?.key === key) return previous;
  const entry = state.setAnimation(0, command.animation, command.loop);
  let preceding = entry;
  for (const [index, name] of sequence.entries()) preceding = state.addAnimation(0, name, index === sequence.length - 1, preceding.animationEnd);
  return { key, entry, completed: false };
}

/** A held preview still has a drawable first pose. Only an active reduced-motion
 * presentation may settle a one-shot; inspection pause must retain its timeline. */
export function settleCanvasReducedMotion(state: AnimationState, run: CanvasTrackRun, active: boolean, animated: boolean, loop: boolean): void {
  if (active && !animated && !loop && !run.completed) {
    run.entry.trackTime = run.entry.animationEnd;
    state.update(0);
  }
}
