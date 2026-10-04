type RendererHost<T> = {
  create: () => T;
  usable: (renderer: T) => boolean;
  reset: (renderer: T) => void;
  destroy: (renderer: T) => void;
};

/** Keep one uploaded scene renderer between presentations, never an idle loop.
 * Extra previews can borrow a second context; loss and disposal retire leases.
 */
export class RetainedRendererPool<T> {
  private spare: T | undefined;
  private readonly leased = new Set<T>();
  private disposed = false;
  private readonly host: RendererHost<T>;
  constructor(host: RendererHost<T>) { this.host = host; }

  acquire(): T {
    if (this.disposed) throw new Error('Scene renderer pool disposed');
    const spare = this.spare;
    this.spare = undefined;
    if (spare !== undefined) {
      if (this.host.usable(spare)) { this.leased.add(spare); return spare; }
      this.host.destroy(spare);
    }
    if (this.leased.size >= 2) throw new Error('Scene renderer capacity reached');
    const renderer = this.host.create();
    this.leased.add(renderer);
    return renderer;
  }

  release(renderer: T, discard = false): void {
    if (!this.leased.delete(renderer)) return;
    if (discard || this.disposed || this.spare !== undefined || !this.host.usable(renderer)) {
      this.host.destroy(renderer);
      return;
    }
    try { this.host.reset(renderer); this.spare = renderer; }
    catch { this.host.destroy(renderer); }
  }

  dispose(): void {
    this.disposed = true;
    if (this.spare !== undefined) this.host.destroy(this.spare);
    this.spare = undefined;
    // Live components retain ownership until their normal cleanup. They cannot
    // return a context to a pool whose module has already been replaced.
  }
}
