type Frame = (delta: number) => void;
type Subscription = { draw: Frame; failed: (error: unknown) => void };
type FrameHost = {
  request: (callback: (time: number) => void) => number;
  cancel: (handle: number) => void;
  hidden: () => boolean;
  subscribeVisibility?: (callback: () => void) => () => void;
};

/** Shared RAF without a shared failure: a lost canvas cannot freeze other reels. */
export class AnimationFrameLoop {
  private frames = new Set<Subscription>();
  private snapshot: Subscription[] = [];
  private snapshotDirty = false;
  private handle: number | null = null;
  private previousTime: number | null = null;
  private running = false;
  private stopVisibility: (() => void) | null = null;

  private readonly host: FrameHost;
  constructor(host: FrameHost) { this.host = host; }

  subscribe(draw: Frame, failed: (error: unknown) => void) {
    const subscription = { draw, failed };
    this.frames.add(subscription);
    this.snapshotDirty = true;
    if (!this.stopVisibility && this.host.subscribeVisibility) this.stopVisibility = this.host.subscribeVisibility(this.visibilityChanged);
    this.schedule();
    return () => {
      if (this.frames.delete(subscription)) this.snapshotDirty = true;
      if (!this.frames.size) {
        if (this.handle !== null) this.host.cancel(this.handle);
        this.handle = null;
        this.previousTime = null;
        this.stopVisibility?.(); this.stopVisibility = null;
        this.snapshot = []; this.snapshotDirty = false;
      }
    };
  }

  private schedule() {
    if (this.frames.size && this.handle === null && !this.running && !(this.host.subscribeVisibility && this.host.hidden())) this.handle = this.host.request(this.tick);
  }

  private visibilityChanged = () => {
    this.previousTime = null;
    if (this.host.hidden() && this.handle !== null) { this.host.cancel(this.handle); this.handle = null; }
    this.schedule();
  };

  private tick = (time: number) => {
    this.handle = null;
    this.running = true;
    const delta = this.previousTime === null ? 0 : Math.max(0, Math.min((time - this.previousTime) / 1000, .05));
    this.previousTime = this.host.hidden() ? null : time;
    try {
      // Membership changes at scene/state boundaries; steady idle needs no new
      // subscriber array on every frame. Capture the immutable iteration view
      // before callbacks, preserving deferred-add and immediate-remove semantics.
      if (this.snapshotDirty) { this.snapshot = [...this.frames]; this.snapshotDirty = false; }
      if (!this.host.hidden()) for (const subscription of this.snapshot) {
        if (!this.frames.has(subscription)) continue;
        try { subscription.draw(delta); }
        catch (error) {
          this.frames.delete(subscription);
          this.snapshotDirty = true;
          // Cleanup itself must not prevent the other symbols from landing.
          try { subscription.failed(error); } catch { /* The failed subscriber is already detached. */ }
        }
      }
    } finally {
      this.running = false;
      if (!this.frames.size) { this.previousTime = null; this.stopVisibility?.(); this.stopVisibility = null; this.snapshot = []; this.snapshotDirty = false; }
      this.schedule();
    }
  };
}
