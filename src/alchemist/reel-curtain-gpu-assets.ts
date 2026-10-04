import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import { BlendMode, type SkeletonData } from '@esotericsoftware/spine-core';
import { assetUrl } from './assets';
import { prepareAssetWork } from './asset-readiness';
import type { ReelCurtainProps } from './ReelCurtain';
import type { ReelCurtainLayout } from './reel-curtain-gpu';
import { warmCurtainRenderers } from './reel-curtain-renderer-pool';

const BASE = assetUrl('alchemist/effects/');
const REVISION = 'curtains41-depth';
const ATLAS = 'pirate-curtain-gpu-v21-smooth-atlas';
type Data = { data: SkeletonData; layout: ReelCurtainLayout };
let atlas: Promise<unknown> | undefined;
const datasets = new Map<string, Promise<Data>>();

export function loadGpuCurtain(type: ReelCurtainProps['type']): Promise<Data> {
  let pending = datasets.get(type);
  if (!pending) {
    pending = (async () => {
      atlas ??= Assets.load({ alias: ATLAS, src: `${BASE}hatches-v2.atlas?v=${REVISION}` }).catch((error: unknown) => { atlas = undefined; throw error; });
      const alias = `pirate-curtain-gpu-v21-smooth-${type}`;
      await Promise.all([atlas, Assets.load({ alias, src: `${BASE}reel-${type}-compact-v27.json?v=motion41-depth` })]);
      const raw = Assets.get<{ adaptiveLayout: ReelCurtainLayout }>(alias);
      if (raw.adaptiveLayout?.mode !== 'reel') throw new Error('Missing adaptive curtain layout');
      const temporary = await prepareAssetWork(() => Spine.from({ skeleton: alias, atlas: ATLAS, autoUpdate: false }));
      const data = temporary.skeleton.data;
      temporary.destroy({ children: true, texture: false, baseTexture: false });
      // The Canvas path ignores authored additive modes. Match its accepted
      // compositing on this private GPU data without editing published pixels.
      for (const slot of data.slots) slot.blendMode = BlendMode.Normal;
      return { data, layout: raw.adaptiveLayout };
    })().catch((error: unknown) => { datasets.delete(type); throw error; });
    datasets.set(type, pending);
  }
  return pending;
}

export async function preloadGpuReelCurtains() {
  const curtains = await Promise.all((['blue', 'red', 'gold', 'green'] as const).map(loadGpuCurtain));
  await warmCurtainRenderers(curtains[0].data);
  return curtains;
}
