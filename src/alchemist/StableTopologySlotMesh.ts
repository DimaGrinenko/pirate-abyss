import { SlotMesh, Spine, SpineTexture } from '@esotericsoftware/spine-pixi-v7';
import { MeshAttachment, type BlendMode, type NumberArrayLike, type SkeletonData } from '@esotericsoftware/spine-core';

/** Private source contract: no atlas sequence can change these attachment UVs.
 * Clipped/generated indices and every unknown attachment keep the stock path. */
export function fixedMeshUvs(data: SkeletonData): ReadonlyMap<NumberArrayLike, NumberArrayLike> {
  const known = new Map<NumberArrayLike, NumberArrayLike>(), ambiguous = new Set<NumberArrayLike>();
  for (const skin of data.skins) for (const { attachment } of skin.getAttachments()) {
    if (!(attachment instanceof MeshAttachment) || attachment.sequence) continue;
    const previous = known.get(attachment.triangles);
    if (previous && previous !== attachment.uvs) { known.delete(attachment.triangles); ambiguous.add(attachment.triangles); }
    if (!ambiguous.has(attachment.triangles)) known.set(attachment.triangles, attachment.uvs);
  }
  return known;
}

/** Preserve native positions/colour every frame; static texture coordinates
 * and topology need one GPU upload, not another complete copy every frame. */
export class StableTopologySlotMesh extends SlotMesh {
  private readonly knownUvs: ReadonlyMap<NumberArrayLike, NumberArrayLike>;
  private previousIndices: NumberArrayLike | null = null;
  private textureSource: SpineTexture | null = null;
  private vertexLength = 0;
  private readonly color = [0, 0, 0, 0];

  constructor(knownUvs: ReadonlyMap<NumberArrayLike, NumberArrayLike>) {
    super();
    this.knownUvs = knownUvs;
  }

  override updateFromSpineData(texture: SpineTexture, blend: BlendMode, name: string, vertices: NumberArrayLike, vertexLength: number, indices: NumberArrayLike, indexLength: number, darkTint: boolean): void {
    const uvs = this.knownUvs.get(indices);
    const stable = !darkTint && uvs !== undefined && vertexLength === uvs.length * 4 && indexLength === indices.length;
    if (!stable || this.previousIndices !== indices || this.textureSource !== texture || this.vertexLength !== vertexLength) {
      super.updateFromSpineData(texture, blend, name, vertices, vertexLength, indices, indexLength, darkTint);
      this.previousIndices = stable ? indices : null;
      this.textureSource = stable ? texture : null;
      this.vertexLength = vertexLength;
      return;
    }
    const position = this.geometry.getBuffer('aVertexPosition'), points = position.data;
    for (let source = 0, target = 0; source < vertexLength; source += 8, target += 2) {
      points[target] = vertices[source]; points[target + 1] = vertices[source + 1];
    }
    for (let channel = 0; channel < 4; channel++) this.color[channel] = vertices[channel + 2];
    this.texture = texture.texture;
    this.tint = this.color;
    this.alpha = this.color[3];
    this.blendMode = SpineTexture.toPixiBlending(blend);
    this.name = name;
    position.update();
  }
}

/** Use the runtime's supported protected mesh-factory extension point rather
 * than the removed slotMeshFactory field on modern SpineOptions. */
export class StableTopologySpine extends Spine {
  constructor(data: SkeletonData) {
    super({ skeletonData: data, autoUpdate: false });
    const known = fixedMeshUvs(data);
    if (!data.slots.some(slot => slot.darkColor)) this.slotMeshFactory = () => new StableTopologySlotMesh(known);
  }
}
