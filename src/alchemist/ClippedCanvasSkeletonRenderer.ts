import { ClippingAttachment, RegionAttachment, SkeletonRenderer } from '@esotericsoftware/spine-canvas';
import type { Skeleton, SlotData } from '@esotericsoftware/spine-canvas';

/** Honor authored Spine aperture masks in the independent Canvas fallback.
 * The stock Canvas renderer skips clipping attachments. These invisible paths
 * use the same world vertices and inclusive end slot as Spine-Pixi's clipper.
 */
export class ClippedCanvasSkeletonRenderer extends SkeletonRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly regions: SkeletonRenderer;
  private owner: Skeleton | null = null;
  private layer: Skeleton | null = null;
  private readonly clipVertices = new Map<ClippingAttachment, Float32Array>();

  constructor(context: CanvasRenderingContext2D) {
    super(context);
    this.context = context;
    this.regions = new SkeletonRenderer(context);
    this.regions.triangleRendering = false;
    this.triangleRendering = true;
  }

  override draw(skeleton: Skeleton) {
    if (this.owner !== skeleton) {
      this.owner = skeleton;
      this.layer = Object.create(skeleton) as Skeleton;
      this.layer.drawOrder = [];
      this.clipVertices.clear();
    }
    const context = this.context, layer = this.layer!;
    let clipping = false, endSlot: SlotData | null = null;
    const endClip = () => {
      if (clipping) context.restore();
      clipping = false; endSlot = null;
    };
    try {
      for (const slot of skeleton.drawOrder) {
        const attachment = slot.getAttachment();
        if (slot.bone.active && attachment instanceof ClippingAttachment && !clipping) {
          let vertices = this.clipVertices.get(attachment);
          if (!vertices) {
            vertices = new Float32Array(attachment.worldVerticesLength);
            this.clipVertices.set(attachment, vertices);
          }
          attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
          context.save(); clipping = true; endSlot = attachment.endSlot;
          context.beginPath(); context.moveTo(vertices[0], vertices[1]);
          for (let i = 2; i < vertices.length; i += 2) context.lineTo(vertices[i], vertices[i + 1]);
          context.closePath(); context.clip();
        } else if (slot.bone.active && !(attachment instanceof ClippingAttachment)) {
          layer.drawOrder[0] = slot;
          // The stock triangle path maps UVs to image.width - 1 / height - 1,
          // shifting a large pixel-aligned occlusion region into its alpha edge.
          // A native region blit preserves exact original-raster alignment.
          if (slot.data.name === 'window-foreground-v13' && attachment instanceof RegionAttachment) this.regions.draw(layer);
          else super.draw(layer);
        }
        // End slots remain effective even if their attachment is hidden.
        if (clipping && slot.data === endSlot) endClip();
      }
    } finally { endClip(); }
  }
}
