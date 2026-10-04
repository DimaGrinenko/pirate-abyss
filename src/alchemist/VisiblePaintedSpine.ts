import type { SkeletonData } from '@esotericsoftware/spine-core';
import { StableTopologySpine } from './StableTopologySlotMesh';
import { VisiblePaintedSlots } from './visible-painted-slots';

/** Same native poses and visible raster geometry, without spending vertex
 * work or buffer uploads on completely transparent alternate paintings. */
export class VisiblePaintedSpine extends StableTopologySpine {
  private readonly paintedSlots: VisiblePaintedSlots;

  constructor(data: SkeletonData) {
    super(data);
    this.paintedSlots = new VisiblePaintedSlots(this.skeleton.slots);
  }

  override updateTransform(): void {
    this.paintedSlots.suppress(this.slotsObject, this.skeleton.color.a);
    try { super.updateTransform(); }
    finally { this.paintedSlots.restore(); }
  }
}
