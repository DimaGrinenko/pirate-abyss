/** The base cabin owns decoded shark art, not an unused WebGL context.
 * Held bonus entrances may prepare a painter; paused/static scenes stay put.
 */
export class SharkPainterLease<T extends { dispose(): void }> {
  private painter: T | undefined;
  private gpu = false;
  private readonly create: (gpu: boolean) => T;
  constructor(create: (gpu: boolean) => T) { this.create = create; }

  update(inWater: boolean, reducedMotion: boolean): T | undefined {
    if (!inWater) { this.release(); return undefined; }
    const gpu = !reducedMotion;
    if (this.painter && this.gpu === gpu) return this.painter;
    this.release();
    this.gpu = gpu; this.painter = this.create(gpu);
    return this.painter;
  }

  release() {
    const painter = this.painter; this.painter = undefined;
    painter?.dispose();
  }
}
