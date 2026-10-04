import { Application } from '@pixi/app';
import { Renderer } from '@pixi/core';
import type { SkeletonData } from '@esotericsoftware/spine-core';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import { RetainedRendererPool } from './retained-renderer-pool';
import { prepareAssetWork } from './asset-readiness';

const pool = new RetainedRendererPool<Application>({
  create: () => new Application({ width: 32, height: 18, resolution: 1,
    autoDensity: true, backgroundAlpha: 0, antialias: true, autoStart: false }),
  usable: app => app.renderer instanceof Renderer && !app.renderer.gl.isContextLost(),
  reset: app => {
    (app.view as HTMLCanvasElement).remove();
    for (const child of app.stage.removeChildren()) child.destroy({ children: true, texture: false, baseTexture: false });
    app.renderer.resolution = 1;
    app.renderer.resize(32, 18);
  },
  destroy: app => {
    try { app.destroy(true, { children: true, texture: false, baseTexture: false }); }
    catch { /* A lost context must not obstruct Canvas recovery. */ }
  },
});

export const acquireBigwinRenderer = () => pool.acquire();
export const releaseBigwinRenderer = (app: Application, discard = false) => pool.release(app, discard);
let warming: Promise<void> | undefined;

/** Shader compilation and atlas uploads belong to loading, not the first win.
 * Keep exactly the warmed GL context for the real presentation to claim.
 */
export function warmBigwinRenderer(data: SkeletonData): Promise<void> {
  warming ??= (async () => {
    let app: Application | undefined;
    try {
      app = await prepareAssetWork(acquireBigwinRenderer);
      const spine = new VisiblePaintedSpine(data);
      app.stage.addChild(spine);
      spine.scale.set(32 / 1200); spine.position.set(16, 9);
      for (const tier of ['big', 'super', 'mega', 'epic', 'legendary', 'max']) {
        await prepareAssetWork(() => {
          // Visit each tier's actual props and particles, including pages that
          // are fully transparent in the first frame of its entrance.
          for (const phase of ['entrance', 'celebrate']) {
            spine.state.clearTracks(); spine.skeleton.setToSetupPose();
            const entry = spine.state.setAnimation(0, `${tier}-${phase}`, false);
            entry.trackTime = entry.animationEnd * .55;
            spine.update(0); app!.renderer.render(app!.stage);
          }
        });
      }
      releaseBigwinRenderer(app);
    } catch (error) {
      if (app) releaseBigwinRenderer(app, true);
      warming = undefined;
      throw error;
    }
  })();
  return warming;
}

if (import.meta.hot) import.meta.hot.dispose(() => { pool.dispose(); warming = undefined; });
