/** React can clean up and restart an effect while retaining the same canvas.
 * Delete that effect's GL objects synchronously, but retire the canvas context
 * after the current effect flush, only if another setup has not reclaimed it. */
export class EffectResourceRetirement {
  private revision = 0;
  private defer: (callback: () => void) => void;
  constructor(defer: (callback: () => void) => void = callback => globalThis.queueMicrotask(callback)) { this.defer = defer; }
  claim() { this.revision++; }
  retire(dispose: () => void) {
    const revision = ++this.revision;
    this.defer(() => { if (this.revision === revision) dispose(); });
  }
}
