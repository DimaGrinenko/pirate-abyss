import { Application } from '@pixi/app';
import { Renderer } from '@pixi/core';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import type { SkeletonData } from '@esotericsoftware/spine-core';
import { prepareAssetWork } from './asset-readiness';

const MAX_RENDERERS = 4;
const idle: Application[] = [];
const live = new Set<Application>();
let warming: Promise<void> | undefined;
let disposed = false;
function idleCapacity() {
  // One board renderer, plus a previously opened isolated gallery preview.
  return 2;
}
function usable(app: Application) {
  return app.renderer instanceof Renderer && !app.renderer.gl.isContextLost();
}
function destroy(app: Application) {
  live.delete(app);
  try { app.destroy(true, { children: true, texture: false, baseTexture: false }); } catch { /* Lost contexts are already unusable. */ }
}

/** Retain GPU programs and atlas uploads between spins, with no idle RAF. */
export function acquireCurtainRenderer() {
  if (disposed) throw new Error('Curtain renderer pool disposed');
  while (idle.length) {
    const app = idle.pop()!;
    if (usable(app)) return app;
    destroy(app);
  }
  // An extra developer preview uses the existing Canvas recovery rather than
  // exceeding the four contexts allocated to this effect family.
  if (live.size >= MAX_RENDERERS) throw new Error('Curtain GPU renderer capacity reached');
  const app = new Application({ width: 32, height: 160, resolution: 1,
    autoDensity: true, autoStart: false, antialias: true, backgroundAlpha: 0 });
  live.add(app);
  return app;
}

export function releaseCurtainRenderer(app: Application, discard = false) {
  (app.view as HTMLCanvasElement).remove();
  for (const child of app.stage.removeChildren()) child.destroy({ children: true, texture: false, baseTexture: false });
  if (disposed || discard || !usable(app) || idle.length >= idleCapacity()) { destroy(app); return; }
  // Release the full-height backbuffer, while retaining decoded GPU textures.
  app.renderer.resolution = 1;
  app.renderer.resize(32, 160);
  idle.push(app);
}

/** Loading owns the expensive context/shader/upload work, before any reveal. */
export function warmCurtainRenderers(data: SkeletonData) {
  warming ??= (async () => {
    const leases: Application[] = [];
    try {
      const target = Math.min(1, MAX_RENDERERS - live.size + idle.length);
      for (let i = 0; i < target; i++) {
        await prepareAssetWork(() => {
          const app = acquireCurtainRenderer(); leases.push(app);
          const spine = new VisiblePaintedSpine(data);
          app.stage.addChild(spine); spine.scale.set(.1); spine.position.set(16, 80);
          // Both poses visit the cloth and the revealed world/award materials.
          for (const animation of ['reveal', 'idle']) {
            spine.state.setAnimation(0, animation, true); spine.update(0);
            app.renderer.render(app.stage);
          }
        });
      }
      for (const app of leases) releaseCurtainRenderer(app);
    } catch (error) {
      for (const app of leases) releaseCurtainRenderer(app, true);
      warming = undefined;
      throw error;
    }
  })();
  return warming;
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  // Active components release their leases through React cleanup. Retire idle
  // contexts now, so repeated development updates cannot accumulate uploads.
  for (const app of idle.splice(0)) destroy(app);
  warming = undefined;
});
