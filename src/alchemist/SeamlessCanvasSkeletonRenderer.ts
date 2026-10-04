import { MeshAttachment, RegionAttachment, SkeletonRenderer } from '@esotericsoftware/spine-canvas';
import type { Skeleton } from '@esotericsoftware/spine-canvas';
import { AffineMeshBatches } from './affine-mesh-batches';

/** Canvas source-over applies coverage twice along a shared triangle edge.
 * Assemble each non-overlapping mesh with additive coverage on transparency,
 * then composite it once. Ordinary regions use drawImage without a diagonal clip.
 * Used by Big Win and porthole effects, whose meshes have no overlapping faces.
 */
export class SeamlessCanvasSkeletonRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly regions: SkeletonRenderer;
  private readonly surface: HTMLCanvasElement;
  private readonly surfaceContext: CanvasRenderingContext2D;
  private readonly meshes: SkeletonRenderer;
  private readonly exactRegionGeometry: boolean;
  private readonly regionVertices = new Float32Array(8);
  private meshVertices = new Float32Array(0);
  private owner: Skeleton | null = null;
  private layer: Skeleton | null = null;
  private readonly affinePlans = new WeakMap<MeshAttachment, AffineMeshBatches>();
  private readonly mergeAffineMeshes: boolean;

  constructor(context: CanvasRenderingContext2D, createCanvas = () => document.createElement('canvas'), exactRegionGeometry = false, mergeAffineMeshes = exactRegionGeometry) {
    this.context = context;
    this.exactRegionGeometry = exactRegionGeometry;
    this.mergeAffineMeshes = mergeAffineMeshes;
    this.regions = new SkeletonRenderer(context);
    this.surface = createCanvas();
    const surfaceContext = this.surface.getContext('2d', { alpha: true });
    if (!surfaceContext) throw new Error('Effect mesh canvas unavailable');
    this.surfaceContext = surfaceContext;
    this.meshes = new SkeletonRenderer(surfaceContext);
    this.meshes.triangleRendering = true;
  }

  draw(skeleton: Skeleton) {
    const context = this.context, surface = this.surface, buffer = this.surfaceContext;
    if (surface.width !== context.canvas.width) surface.width = context.canvas.width;
    if (surface.height !== context.canvas.height) surface.height = context.canvas.height;
    if (this.owner !== skeleton) {
      this.owner = skeleton;
      // A one-slot view preserves native Skeleton/Slot references and draw order.
      // It does not mutate the live skeleton or its animation state.
      this.layer = Object.create(skeleton) as Skeleton;
      this.layer.drawOrder = [];
    }
    const layer = this.layer!;
    const matrix = context.getTransform();
    for (const slot of skeleton.drawOrder) {
      const attachment = slot.getAttachment();
      if (!slot.bone.active || slot.color.a * skeleton.color.a < .0001) continue;
      layer.drawOrder[0] = slot;
      if (attachment instanceof RegionAttachment) {
        if (!this.exactRegionGeometry) this.regions.draw(layer);
        else {
          // Every region is one affine quad, including trimmed/rotated atlas
          // regions and sheared bones. Map native UVs to native world corners;
          // do not infer the authored height from its texture's aspect ratio.
          const xy = this.regionVertices, uv = attachment.uvs;
          attachment.computeWorldVertices(slot, xy, 0, 2);
          const texture = attachment.region!.texture as { getImage(): HTMLImageElement };
          const image = texture.getImage();
          // Match Spine Canvas's existing UV convention exactly.
          const textureWidth = image.width - 1, textureHeight = image.height - 1;
          const u0 = uv[0] * textureWidth, v0 = uv[1] * textureHeight;
          const u1 = (uv[2] - uv[0]) * textureWidth, v1 = (uv[3] - uv[1]) * textureHeight;
          const u2 = (uv[4] - uv[0]) * textureWidth, v2 = (uv[5] - uv[1]) * textureHeight;
          const determinant = u1 * v2 - u2 * v1;
          if (!determinant) continue;
          const x1 = xy[2] - xy[0], y1 = xy[3] - xy[1], x2 = xy[4] - xy[0], y2 = xy[5] - xy[1];
          const a = (v2 * x1 - v1 * x2) / determinant, b = (v2 * y1 - v1 * y2) / determinant;
          const c = (u1 * x2 - u2 * x1) / determinant, d = (u1 * y2 - u2 * y1) / determinant;
          const sourceX = Math.min(uv[0], uv[2], uv[4], uv[6]) * textureWidth;
          const sourceY = Math.min(uv[1], uv[3], uv[5], uv[7]) * textureHeight;
          const sourceWidth = Math.max(uv[0], uv[2], uv[4], uv[6]) * textureWidth - sourceX;
          const sourceHeight = Math.max(uv[1], uv[3], uv[5], uv[7]) * textureHeight - sourceY;
          context.save();
          context.transform(a, b, c, d, xy[0] - a * u0 - c * v0, xy[1] - b * u0 - d * v0);
          context.globalAlpha = skeleton.color.a * slot.color.a * attachment.color.a;
          context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, sourceX, sourceY, sourceWidth, sourceHeight);
          context.restore();
        }
      } else if (attachment instanceof MeshAttachment) {
        // A tiny eyelid or coin should not composite the entire screen. Native
        // triangle vertices bound the rendered raster under any affine camera.
        // Two device pixels retain all antialias coverage at the mesh edge.
        if (this.meshVertices.length < attachment.worldVerticesLength) this.meshVertices = new Float32Array(attachment.worldVerticesLength);
        const points = this.meshVertices;
        attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, points, 0, 2);
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (let i = 0; i < attachment.worldVerticesLength; i += 2) {
          const x = matrix.a * points[i] + matrix.c * points[i + 1] + matrix.e;
          const y = matrix.b * points[i] + matrix.d * points[i + 1] + matrix.f;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        left = Math.max(0, Math.floor(left) - 2); top = Math.max(0, Math.floor(top) - 2);
        right = Math.min(surface.width, Math.ceil(right) + 2); bottom = Math.min(surface.height, Math.ceil(bottom) + 2);
        const cropWidth = right - left, cropHeight = bottom - top;
        if (cropWidth <= 0 || cropHeight <= 0) continue;
        buffer.setTransform(1, 0, 0, 1, 0, 0);
        buffer.clearRect(left, top, cropWidth, cropHeight);
        buffer.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
        buffer.globalCompositeOperation = 'lighter';
        buffer.imageSmoothingEnabled = context.imageSmoothingEnabled;
        buffer.imageSmoothingQuality = context.imageSmoothingQuality;
        if (!this.mergeAffineMeshes) this.meshes.draw(layer);
        else {
          let plan = this.affinePlans.get(attachment);
          if (!plan) { plan = new AffineMeshBatches(attachment.uvs, attachment.triangles); this.affinePlans.set(attachment, plan); }
          const texture = attachment.region!.texture as { getImage(): HTMLImageElement };
          const image = texture.getImage(), batches = plan.update(points);
          buffer.globalAlpha = skeleton.color.a * slot.color.a * attachment.color.a;
          // Leave any unsupported/non-manifold/degenerate geometry entirely to
          // the original renderer. Its exact per-triangle fallback is unchanged.
          if (batches.some(batch => !batch.boundary)) this.meshes.draw(layer);
          else for (const batch of batches) {
              // This union has exactly the original connected triangle area,
              // including oriented holes. Internal affine edges need no clips.
              buffer.save(); buffer.beginPath();
              for (const loop of batch.boundary!) {
                buffer.moveTo(points[loop[0]*2], points[loop[0]*2+1]);
                for (let i = 1; i < loop.length; i++) buffer.lineTo(points[loop[i]*2], points[loop[i]*2+1]);
                buffer.closePath();
              }
              buffer.clip();
              const [a,b,c,d,e,f] = batch.transform, w = image.width-1, h = image.height-1;
              buffer.transform(a/w, b/w, c/h, d/h, e, f);
              buffer.drawImage(image, 0, 0); buffer.restore();
          }
          buffer.globalAlpha = 1;
        }
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.drawImage(surface, left, top, cropWidth, cropHeight, left, top, cropWidth, cropHeight);
        context.restore();
      }
    }
  }
}
