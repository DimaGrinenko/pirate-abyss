import { MeshAttachment, RegionAttachment, type Attachment, type Slot } from '@esotericsoftware/spine-core';

/** The stock renderer computes every weighted vertex even at exactly zero
 * opacity. Hide only raster attachments during its render traversal, restoring
 * the actual attachment and its deform buffer without touching animation state.
 * Clipping slots and slots with attached Pixi objects retain the stock path. */
export class VisiblePaintedSlots {
  private readonly hiddenSlots: Slot[] = [];
  private readonly hiddenAttachments: Attachment[] = [];
  private count = 0;
  private readonly slots: readonly Slot[];

  constructor(slots: readonly Slot[]) { this.slots = slots; }

  suppress(slotObjects: { has(slot: Slot): boolean }, skeletonAlpha: number): void {
    if (this.count) throw new Error('Painted slots are already suppressed.');
    for (const slot of this.slots) {
      const attachment = slot.attachment;
      if (!(attachment instanceof MeshAttachment || attachment instanceof RegionAttachment)) continue;
      if (slot.color.a !== 0 && attachment.color.a !== 0 && skeletonAlpha !== 0) continue;
      if (slotObjects.has(slot)) continue;
      this.hiddenSlots[this.count] = slot;
      this.hiddenAttachments[this.count++] = attachment;
      slot.attachment = null;
    }
  }

  restore(): void {
    for (let i = 0; i < this.count; i++) this.hiddenSlots[i].attachment = this.hiddenAttachments[i];
    this.count = 0;
  }
}
