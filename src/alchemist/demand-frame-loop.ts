type FrameHost = {
  request: (callback: (time: number) => void) => number;
  cancel: (handle: number) => void;
};

/** A paused canvas retains its pixels and pose without occupying a RAF loop. */
export class DemandFrameLoop {
  private frame: number | null = null;
  private previous: number | null = null;
  private playing = false;
  private visible = false;
  private dirty = false;
  private disposed = false;
  private readonly host: FrameHost;
  private readonly draw: (delta: number) => void;

  constructor(host: FrameHost, draw: (delta: number) => void) { this.host = host; this.draw = draw; }

  setPlayback(playing: boolean, visible: boolean) {
    if (this.disposed || (playing === this.playing && visible === this.visible)) return;
    this.playing = playing;
    this.visible = visible;
    this.previous = null;
    if (!playing || !visible) this.cancel();
    this.schedule();
  }

  /** Pose changes and resizes still receive one paint in static mode. */
  invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    this.schedule();
  }

  dispose() {
    this.disposed = true;
    this.cancel();
  }

  private cancel() {
    if (this.frame !== null) this.host.cancel(this.frame);
    this.frame = null;
  }

  private schedule() {
    if (!this.disposed && this.visible && (this.playing || this.dirty) && this.frame === null) {
      this.frame = this.host.request(this.tick);
    }
  }

  private tick = (time: number) => {
    this.frame = null;
    if (this.disposed || !this.visible) return;
    const delta = this.playing && this.previous !== null ? Math.max(0, Math.min((time - this.previous) / 1000, .05)) : 0;
    this.previous = this.playing ? time : null;
    this.dirty = false;
    this.draw(delta);
    this.schedule();
  };
}
