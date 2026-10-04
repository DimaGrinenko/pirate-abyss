import { ClippingAttachment, type Skeleton, type Slot } from '@esotericsoftware/spine-core';

export type EnvironmentClipGroup = {
  slot: Slot;
  attachment: ClippingAttachment;
  drawIndex: number;
  members: Slot[];
  vertices: number[];
  previousVertices: number[];
  initialized: boolean;
};

/** Exact authored clipping ranges, independent of Pixi and canvas resolution.
 * The environment has contiguous, non-nested windows and no attachment/draw-order
 * animation. Fail closed if that contract changes, so the scene can use Canvas.
 */
export class EnvironmentClipPlan {
  readonly groups: EnvironmentClipGroup[] = [];
  readonly groupBySlot = new Map<Slot, EnvironmentClipGroup>();
  private readonly drawOrder: Slot[];
  private readonly skeleton: Skeleton;
  private suppressed = false;

  constructor(skeleton: Skeleton) {
    this.skeleton = skeleton;
    this.drawOrder = skeleton.drawOrder.slice();
    let active: EnvironmentClipGroup | undefined;
    for (let i = 0; i < this.drawOrder.length; i++) {
      const slot = this.drawOrder[i], attachment = slot.getAttachment();
      if (attachment instanceof ClippingAttachment) {
        if (active) throw new Error('Nested environment clipping needs the original renderer.');
        if (!attachment.endSlot || attachment.worldVerticesLength < 6) throw new Error('Invalid environment clipping range.');
        active = {
          slot, attachment, drawIndex: i, members: [],
          vertices: Array<number>(attachment.worldVerticesLength).fill(0),
          previousVertices: Array<number>(attachment.worldVerticesLength).fill(0), initialized: false,
        };
        this.groups.push(active);
      } else if (active) {
        active.members.push(slot);
        this.groupBySlot.set(slot, active);
      }
      if (active?.attachment.endSlot === slot.data) active = undefined;
    }
    if (active || !this.groups.length || this.groups.some(group => !group.members.length)) throw new Error('Incomplete environment clipping ranges.');
  }

  /** Reuse both arrays. Static apertures do not rebuild Graphics geometry. */
  updateGeometry(changed: (group: EnvironmentClipGroup) => void): void {
    if (this.suppressed) throw new Error('Environment clipping cannot update during rendering.');
    const currentOrder = this.skeleton.drawOrder;
    if (currentOrder.length !== this.drawOrder.length || currentOrder.some((slot, i) => slot !== this.drawOrder[i])) throw new Error('Animated environment draw order needs the original renderer.');
    for (const group of this.groups) {
      if (group.slot.getAttachment() !== group.attachment || !group.slot.bone.active) throw new Error('Changed environment clipping attachment needs the original renderer.');
      group.attachment.computeWorldVertices(group.slot, 0, group.vertices.length, group.vertices, 0, 2);
      let dirty = !group.initialized;
      for (let i = 0; i < group.vertices.length; i++) {
        if (!Number.isFinite(group.vertices[i])) throw new Error('Invalid environment mask coordinate.');
        if (group.vertices[i] !== group.previousVertices[i]) dirty = true;
      }
      if (dirty) {
        changed(group);
        for (let i = 0; i < group.vertices.length; i++) group.previousVertices[i] = group.vertices[i];
        group.initialized = true;
      }
    }
  }

  /** Temporary instance-only suppression. Restore in finally, including errors.
   * Direct assignment preserves native attachment/deform state byte for byte.
   */
  suppressCpuClipping(): void {
    if (this.suppressed) throw new Error('Environment clipping was already suppressed.');
    this.suppressed = true;
    for (const group of this.groups) group.slot.attachment = null;
  }

  restoreCpuClipping(): void {
    if (!this.suppressed) return;
    for (const group of this.groups) group.slot.attachment = group.attachment;
    this.suppressed = false;
  }
}
