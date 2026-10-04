import type { ISlotMesh } from '@esotericsoftware/spine-pixi-v7';
import type { SkeletonData, Slot } from '@esotericsoftware/spine-core';
import { Container, type IDestroyOptions } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import { EnvironmentClipPlan, type EnvironmentClipGroup } from './gpu-background-clip-plan';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';

/** Original Spine meshes with two GPU stencil windows, instead of clipping
 * every moving fish triangle on the CPU. Masks are technical geometry only.
 */
export class GpuBackgroundSpine extends VisiblePaintedSpine {
  readonly windowClipPlan: EnvironmentClipPlan;
  private readonly windows = new Map<EnvironmentClipGroup, { container: Container; mask: Graphics }>();

  constructor(data: SkeletonData) {
    super(data);
    this.windowClipPlan = new EnvironmentClipPlan(this.skeleton);
    for (const group of this.windowClipPlan.groups) {
      const container = new Container(), mask = new Graphics();
      container.sortableChildren = true;
      container.zIndex = group.drawIndex;
      this.addChild(mask, container);
      container.mask = mask;
      this.windows.set(group, { container, mask });
    }
  }

  private readonly redrawWindow = (group: EnvironmentClipGroup): void => {
    // World vertices already include Spine-Pixi's Y-down convention. The
    // mask and its fish container share this Spine parent's exact transform.
    this.windows.get(group)!.mask.clear().beginFill(0xffffff).drawPolygon(group.vertices).endFill();
  };

  protected override getMeshForSlot(slot: Slot): ISlotMesh {
    const mesh = super.getMeshForSlot(slot), group = this.windowClipPlan.groupBySlot.get(slot);
    if (group) {
      const container = this.windows.get(group)!.container;
      if (mesh.parent !== container) container.addChild(mesh);
    }
    return mesh;
  }

  override updateTransform(): void {
    this.windowClipPlan.updateGeometry(this.redrawWindow);
    // Once the independent volume school is ready every flat-fish painting is
    // transparent. Do not stencil-render two empty aquarium groups; restoration
    // on a volume-context failure immediately makes the original groups visible.
    for (const [group, window] of this.windows) {
      window.container.visible = this.skeleton.color.a !== 0 && group.members.some(slot => slot.color.a !== 0);
    }
    this.windowClipPlan.suppressCpuClipping();
    try {
      // Spine still builds the same weighted meshes, colours and local order.
      // Each contiguous window group occupies its original draw-order range;
      // the original coral/kelp foreground therefore stays above every fish.
      super.updateTransform();
    } finally {
      this.windowClipPlan.restoreCpuClipping();
    }
  }

  override destroy(options?: boolean | IDestroyOptions): void {
    for (const { container } of this.windows.values()) container.mask = null;
    super.destroy(options);
    this.windows.clear();
  }
}
