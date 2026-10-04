/** Dev-only CSS/transition control. updatePlaybackRate preserves currentTime;
 * changing CSS duration would reinterpret that time and visibly jump poses. */
export type PreviewAnimation = Pick<Animation, 'playbackRate' | 'playState' | 'updatePlaybackRate' | 'pause' | 'play'>;

export class PreviewAnimationController {
  private held = new WeakSet<PreviewAnimation>();

  synchronize(animations: PreviewAnimation[], timeScale: number, paused: boolean) {
    const scale = Number.isFinite(timeScale) ? Math.max(.05, Math.min(4, timeScale)) : 1;
    for (const animation of animations) {
      if (animation.playbackRate !== scale) animation.updatePlaybackRate(scale);
      if (paused && animation.playState === 'running') {
        this.held.add(animation);
        animation.pause();
      } else if (!paused && this.held.has(animation)) {
        this.held.delete(animation);
        // Never revive finished or removed CSS tracks, or authored static art.
        if (animation.playState === 'paused') animation.play();
      }
    }
  }
}
