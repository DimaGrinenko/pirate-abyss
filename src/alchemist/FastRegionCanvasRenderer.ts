/*
 * Region sampling follows @esotericsoftware/spine-canvas SkeletonRenderer.
 * Spine Runtimes License Agreement
 * Last updated April 5, 2025. Replaces all prior versions.
 * Copyright (c) 2013-2025, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software or
 * otherwise create derivative works of the Spine Runtimes (collectively,
 * "Products"), provided that each user of the Products must obtain their own
 * Spine Editor license and redistribution of the Products in any form must
 * include this license and copyright notice.
 *
 * THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES,
 * BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THE SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import { BlendMode, MeshAttachment, RegionAttachment, SkeletonRenderer } from '@esotericsoftware/spine-canvas';
import type { Skeleton, Slot } from '@esotericsoftware/spine-canvas';

const REGION_SYMBOLS = new Set(['retort', 'flask', 'mercury', 'sulfur', 'copper', 'iron', 'lead', 'scatter', 'wild-blue', 'wild-red', 'wild-gold', 'wild-green']);
type Region = NonNullable<RegionAttachment['region']>;
type CanvasImage = CanvasImageSource & { width: number; height: number };
type ImageTexture = { getImage(): CanvasImage };
type Paint = {
  region: Region; texture: Region['texture']; image: CanvasImage;
  offsetX: number; offsetY: number; rotation: number; width: number; scaleX: number; scaleY: number;
  regionWidth: number; regionHeight: number; originalWidth: number; degrees: number; u: number; v: number;
  imageWidth: number; imageHeight: number;
  a: number; b: number; c: number; d: number; e: number; f: number;
  sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number;
};
type Prepared = { slot: Slot; attachment: RegionAttachment; paint: Paint };

function supported(attachment: RegionAttachment): boolean {
  const region = attachment.region;
  return !attachment.sequence && !!region?.texture && typeof (region.texture as unknown as ImageTexture).getImage === 'function';
}

/** Opt in only the existing region-only symbols, including dormant skin entries. */
export function canUseFastRegionRenderer(id: string, skeleton: Skeleton): boolean {
  return REGION_SYMBOLS.has(id)
    && skeleton.data.slots.every(slot => slot.blendMode === BlendMode.Normal)
    && skeleton.data.skins.every(skin => skin.getAttachments().every(({ attachment }) => attachment instanceof RegionAttachment && supported(attachment)))
    && skeleton.slots.every(slot => {
      const attachment = slot.getAttachment();
      return !attachment || (attachment instanceof RegionAttachment && supported(attachment));
    });
}

/** Same stock raster sampler, with one composed transform per visible region. */
export class FastRegionCanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly fallback: SkeletonRenderer;
  private readonly paints = new WeakMap<RegionAttachment, Paint>();
  private readonly prepared: Prepared[] = [];

  constructor(context: CanvasRenderingContext2D) {
    this.context = context;
    this.fallback = new SkeletonRenderer(context);
  }

  private paint(attachment: RegionAttachment): Paint | null {
    const region = attachment.region!;
    const cached = this.paints.get(attachment);
    const image = (region.texture as unknown as ImageTexture).getImage();
    if (cached && cached.region === region && cached.texture === region.texture && cached.image === image
      && cached.offsetX === attachment.offset[0] && cached.offsetY === attachment.offset[1]
      && cached.rotation === attachment.rotation && cached.width === attachment.width
      && cached.scaleX === attachment.scaleX && cached.scaleY === attachment.scaleY
      && cached.regionWidth === region.width && cached.regionHeight === region.height
      && cached.originalWidth === region.originalWidth && cached.degrees === region.degrees
      && cached.u === region.u && cached.v === region.v
      && cached.imageWidth === image.width && cached.imageHeight === image.height) return cached;

    const values = [attachment.offset[0], attachment.offset[1], attachment.rotation, attachment.width,
      attachment.scaleX, attachment.scaleY, region.width, region.height, region.originalWidth, region.u, region.v, image.width, image.height];
    if (!values.every(Number.isFinite) || region.originalWidth <= 0 || region.width <= 0 || region.height <= 0) return null;
    const rotation = attachment.rotation * Math.PI / 180, cosine = Math.cos(rotation), sine = Math.sin(rotation);
    const atlasScale = attachment.width / region.originalWidth;
    const sx = atlasScale * attachment.scaleX, sy = atlasScale * attachment.scaleY;
    let a = cosine * sx, b = sine * sx, c = -sine * sy, d = cosine * sy;
    // Preserve the stock order: offset, rotate, scale, unrotated atlas center,
    // optional -90 degrees, vertical flip, then the final source center.
    let e = attachment.offset[0] + a * region.width / 2 + c * region.height / 2;
    let f = attachment.offset[1] + b * region.width / 2 + d * region.height / 2;
    let w = region.width, h = region.height;
    if (region.degrees === 90) {
      [w, h] = [h, w];
      const cos = Math.cos(-Math.PI / 2), sin = Math.sin(-Math.PI / 2);
      const nextA = a * cos + c * sin, nextB = b * cos + d * sin;
      c = -a * sin + c * cos; d = -b * sin + d * cos; a = nextA; b = nextB;
    }
    c = -c; d = -d;
    e += a * -w / 2 + c * -h / 2; f += b * -w / 2 + d * -h / 2;
    const paint: Paint = {
      region, texture: region.texture, image,
      offsetX: attachment.offset[0], offsetY: attachment.offset[1], rotation: attachment.rotation,
      width: attachment.width, scaleX: attachment.scaleX, scaleY: attachment.scaleY,
      regionWidth: region.width, regionHeight: region.height, originalWidth: region.originalWidth,
      degrees: region.degrees, u: region.u, v: region.v, imageWidth: image.width, imageHeight: image.height,
      a, b, c, d, e, f, sourceX: image.width * region.u, sourceY: image.height * region.v, sourceWidth: w, sourceHeight: h,
    };
    this.paints.set(attachment, paint);
    return paint;
  }

  draw(skeleton: Skeleton) {
    // Validate the entire order before painting, so a later attachment swap can
    // use stock rendering without drawing the earlier layers twice.
    let count = 0, unsupported = false;
    for (const slot of skeleton.drawOrder) {
      if (!slot.bone.active) continue;
      const attachment = slot.getAttachment();
      if (!attachment) continue;
      const bone = slot.bone;
      if (!(attachment instanceof RegionAttachment) || !supported(attachment) || slot.data.blendMode !== BlendMode.Normal
        || !Number.isFinite(bone.a + bone.b + bone.c + bone.d + bone.worldX + bone.worldY)) { unsupported = true; break; }
      const paint = this.paint(attachment);
      if (!paint) { unsupported = true; break; }
      const prepared = this.prepared[count];
      if (prepared) { prepared.slot = slot; prepared.attachment = attachment; prepared.paint = paint; }
      else this.prepared[count] = { slot, attachment, paint };
      count++;
    }
    if (unsupported) {
      this.fallback.triangleRendering = skeleton.slots.some(slot => slot.getAttachment() instanceof MeshAttachment);
      this.fallback.draw(skeleton);
      return;
    }
    const context = this.context, camera = context.getTransform(), initialAlpha = context.globalAlpha;
    const skipTransparent = context.globalCompositeOperation === 'source-over';
    context.save();
    try {
      for (let i = 0; i < count; i++) {
        const { slot, attachment, paint: p } = this.prepared[i], bone = slot.bone;
        const rawAlpha = skeleton.color.a * slot.color.a * attachment.color.a;
        const alpha = rawAlpha < 0 ? 0 : rawAlpha > 1 ? 1 : rawAlpha;
        if (skipTransparent && alpha === 0) continue;
        // Canvas uses [a,c;b,d] for Spine's bone. Compose the camera first,
        // retaining the stock treatment of shear, reflections and nonuniform scale.
        const a = camera.a * bone.a + camera.c * bone.c, b = camera.b * bone.a + camera.d * bone.c;
        const c = camera.a * bone.b + camera.c * bone.d, d = camera.b * bone.b + camera.d * bone.d;
        const e = camera.a * bone.worldX + camera.c * bone.worldY + camera.e;
        const f = camera.b * bone.worldX + camera.d * bone.worldY + camera.f;
        context.setTransform(a * p.a + c * p.b, b * p.a + d * p.b, a * p.c + c * p.d, b * p.c + d * p.d, a * p.e + c * p.f + e, b * p.e + d * p.f + f);
        // Stock Color.set clamps to [0,1]. Canvas ignores NaN assignments;
        // that slot inherits the alpha saved before the skeleton was drawn.
        context.globalAlpha = alpha >= 0 && alpha <= 1 ? alpha : initialAlpha;
        context.drawImage(p.image, p.sourceX, p.sourceY, p.sourceWidth, p.sourceHeight, 0, 0, p.sourceWidth, p.sourceHeight);
      }
    } finally { context.restore(); }
  }
}
