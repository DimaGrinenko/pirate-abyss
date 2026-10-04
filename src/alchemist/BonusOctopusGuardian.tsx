import { useEffect, useRef, useState } from 'react';
import { Application } from '@pixi/app';
import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import type { SkeletonData } from '@esotericsoftware/spine-core';
import { assetUrl } from './assets';
import { decodedImage, prepareAssetWork } from './asset-readiness';
import { afterVisiblePaint } from './visible-paint';
import { AnimationFrameLoop } from './animation-frame-loop';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import { parkRetainedSurface, restoreRetainedSurface } from './retained-surface';
import { guardianCanAnimate, playOctopusGuardian } from './bonus-octopus-guardian-motion';

export interface BonusOctopusGuardianProps {
  held?: boolean;
  reducedMotion?: boolean;
  timeScale?: number;
  intro?: boolean;
  rewarded?: boolean;
  className?: string;
  onReady?: () => void;
}

const BASE = assetUrl('alchemist/altar/');
const SKELETON = 'pirate-octopus-only-v41-data', ATLAS = 'pirate-octopus-only-v41-atlas';
const POSTER = `${BASE}octopus-guardian-poster-v41.webp`;
const animationLoop = new AnimationFrameLoop({
  request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle), hidden: () => document.hidden,
  subscribeVisibility: callback => { document.addEventListener('visibilitychange', callback); return () => document.removeEventListener('visibilitychange', callback); },
});

let dataPromise: Promise<SkeletonData> | undefined;
function loadGuardian() {
  if (!dataPromise) dataPromise = (async () => {
    await Assets.load([
      { alias: SKELETON, src: `${BASE}octopus-guardian-v41.json` },
      { alias: ATLAS, src: `${BASE}octopus-guardian-v41.atlas` },
    ]);
    return prepareAssetWork(() => {
      const temporary = Spine.from({ skeleton: SKELETON, atlas: ATLAS, autoUpdate: false });
      const data = temporary.skeleton.data;
      temporary.destroy({ children: true, texture: false, baseTexture: false });
      return data;
    });
  })().catch((error: unknown) => { dataPromise = undefined; throw error; });
  return dataPromise;
}

type Renderer = { app: Application; spine: VisiblePaintedSpine };
let spare: Renderer | undefined, preparing: Promise<void> | undefined, poolDisposed = false;
const isLost = (r: Renderer) => (r.app.renderer as { gl?: WebGLRenderingContext }).gl?.isContextLost() ?? false;
function destroy(r: Renderer) { try { r.app.destroy(true, { children: true, texture: false, baseTexture: false }); } catch { /* Lost context. */ } }
function release(r: Renderer) {
  r.spine.state.clearListeners(); r.spine.state.clearTracks();
  (r.app.view as HTMLCanvasElement).remove();
  if (!spare && !poolDisposed && !isLost(r)) {
    try { parkRetainedSurface(r.app.renderer); spare = r; return; } catch { /* Retire an unusable context. */ }
  }
  destroy(r);
}
async function createRenderer(): Promise<Renderer> {
  const data = await loadGuardian();
  return prepareAssetWork(() => {
    const app = new Application({ width: 450, height: 410, resolution: 1, autoDensity: true, backgroundAlpha: 0, antialias: true, autoStart: false });
    const spine = new VisiblePaintedSpine(data), renderer = { app, spine };
    try {
      app.stage.addChild(spine); spine.scale.set(.5); spine.position.set(225, 410);
      playOctopusGuardian(spine.state, false, false, true); spine.update(0);
      app.renderer.render(app.stage);
      if (isLost(renderer)) throw Error('Octopus context lost during preparation');
      return renderer;
    } catch (error) { destroy(renderer); throw error; }
  });
}
async function prepareRenderer() {
  if (spare) { if (!isLost(spare)) return; destroy(spare); spare = undefined; }
  if (!preparing) preparing = createRenderer().then(release).finally(() => { preparing = undefined; });
  await preparing;
}
async function acquireRenderer() {
  await prepareRenderer();
  if (spare) { const renderer = spare; spare = undefined; if (!isLost(renderer)) return renderer; destroy(renderer); }
  return createRenderer();
}
function preparationBudget(work: Promise<void>): Promise<void> {
  // Optional decoration must not keep the global loader pending on a stalled
  // GPU/JSON request. A late renderer is still parked for a future presentation.
  return new Promise(resolve => {
    const timer = window.setTimeout(resolve, 15000);
    work.then(() => { window.clearTimeout(timer); resolve(); }, () => { window.clearTimeout(timer); resolve(); });
  });
}
if (import.meta.hot) import.meta.hot.dispose(() => { poolDisposed = true; if (spare) destroy(spare); spare = undefined; });

// eslint-disable-next-line react-refresh/only-export-components
export async function preloadBonusOctopusGuardian(): Promise<void> {
  await Promise.all([preparationBudget(prepareRenderer()), decodedImage(POSTER).then(() => undefined).catch(() => undefined)]);
}

/** Transparent octopus only. A separate foreground actor owns the new chest. */
export function BonusOctopusGuardian({ held = false, reducedMotion = false, timeScale = 1, intro = false, rewarded = false, className = '', onReady }: BonusOctopusGuardianProps) {
  const host = useRef<HTMLDivElement>(null), poster = useRef<HTMLImageElement>(null);
  const actor = useRef<VisiblePaintedSpine | null>(null);
  const refresh = useRef<(() => void) | null>(null), fallbackReady = useRef<(() => void) | null>(null);
  const latest = useRef({ held, reducedMotion, timeScale, intro, rewarded, onReady });
  latest.current = { held, reducedMotion, timeScale, intro, rewarded, onReady };
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, didFail = false, hasViewport = false, inView = true, announced = false;
    let renderer: Renderer | undefined, canvas: HTMLCanvasElement | undefined;
    let observer: ResizeObserver | undefined, intersection: IntersectionObserver | undefined;
    let stop: (() => void) | undefined, cancelPaint: (() => void) | undefined;
    const announce = () => {
      if (disposed || announced || cancelPaint) return;
      cancelPaint = afterVisiblePaint(() => {
        cancelPaint = undefined;
        if (disposed) return;
        announced = true; latest.current.onReady?.(); refresh.current?.();
      });
    };
    const showFallback = () => {
      if (didFail && poster.current?.complete && poster.current.naturalWidth > 0) announce();
    };
    fallbackReady.current = showFallback;
    const fail = (error: unknown) => {
      if (disposed || didFail) return;
      didFail = true; stop?.(); stop = undefined; cancelPaint?.(); cancelPaint = undefined;
      window.clearTimeout(preparationTimeout);
      observer?.disconnect(); intersection?.disconnect();
      actor.current = null; refresh.current = null;
      canvas?.removeEventListener('webglcontextlost', contextLost);
      if (renderer) { destroy(renderer); renderer = undefined; }
      setReady(false); setFailed(true);
      void decodedImage(POSTER).then(showFallback, announce);
      showFallback();
      console.warn('The octopus uses its transparent raster fallback.', error);
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(Error('Octopus WebGL context lost')); };
    const updatePlayback = () => {
      stop?.(); stop = undefined;
      if (disposed || didFail || !renderer || document.hidden || !hasViewport || !inView) return;
      try {
        renderer.app.renderer.render(renderer.app.stage); setReady(true); announce();
        if (guardianCanAnimate({ ...latest.current, visible: !document.hidden && inView, viewport: hasViewport, ready: announced })) {
          stop = animationLoop.subscribe(delta => {
            if (!renderer || disposed || didFail) return;
            renderer.spine.update(delta * Math.min(4, latest.current.timeScale));
            renderer.app.renderer.render(renderer.app.stage);
          }, fail);
        }
      } catch (error) { fail(error); }
    };
    document.addEventListener('visibilitychange', updatePlayback);
    const mount = async () => {
      const acquired = await acquireRenderer();
      if (disposed || didFail) { release(acquired); return; }
      window.clearTimeout(preparationTimeout);
      renderer = acquired; canvas = acquired.app.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
      canvas.addEventListener('webglcontextlost', contextLost); element.append(canvas);
      actor.current = acquired.spine;
      acquired.spine.state.clearTracks(); acquired.spine.skeleton.setToSetupPose();
      playOctopusGuardian(acquired.spine.state, latest.current.intro, latest.current.rewarded, latest.current.reducedMotion);
      acquired.spine.update(0);
      refresh.current = updatePlayback;
      const resize = () => {
        if (!renderer || disposed || didFail) return;
        try {
          const width = element.clientWidth, height = element.clientHeight;
          hasViewport = width > 0 && height > 0;
          if (hasViewport) {
            const scale = Math.min(width / 900, height / 820);
            restoreRetainedSurface(renderer.app.renderer, width, height, window.devicePixelRatio);
            renderer.spine.scale.set(scale); renderer.spine.position.set(width / 2, (height + 820 * scale) / 2);
          }
          updatePlayback();
        } catch (error) { fail(error); }
      };
      observer = new ResizeObserver(resize); observer.observe(element);
      if (typeof IntersectionObserver !== 'undefined') {
        intersection = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; updatePlayback(); });
        intersection.observe(element);
      }
      resize();
    };
    const preparationTimeout = window.setTimeout(() => fail(Error('Octopus preparation timed out')), 15000);
    void mount().catch(fail);
    return () => {
      disposed = true; stop?.(); cancelPaint?.(); observer?.disconnect(); intersection?.disconnect();
      window.clearTimeout(preparationTimeout);
      document.removeEventListener('visibilitychange', updatePlayback);
      canvas?.removeEventListener('webglcontextlost', contextLost);
      refresh.current = null; fallbackReady.current = null; actor.current = null;
      if (renderer) release(renderer);
    };
  }, []);

  useEffect(() => {
    if (actor.current) {
      playOctopusGuardian(actor.current.state, intro, rewarded, latest.current.reducedMotion);
      actor.current.update(0);
    }
    refresh.current?.();
  }, [intro, rewarded]);
  useEffect(() => { refresh.current?.(); }, [held, reducedMotion, timeScale]);
  return <div className={`bonus-octopus-guardian ${className}`} aria-hidden="true" data-octopus-guardian={ready ? 'ready' : failed ? 'fallback' : 'loading'} data-playback={held ? 'held' : reducedMotion ? 'static' : 'playing'} style={{ position: 'relative', width: '100%', height: '100%', aspectRatio: '900 / 820', pointerEvents: 'none' }}>
    {!ready && <img ref={poster} src={POSTER} alt="" onLoad={() => fallbackReady.current?.()} onError={() => { /* WebGL may still succeed. */ }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
    <div ref={host} hidden={failed} style={{ position: 'absolute', inset: 0 }} />
  </div>;
}

export default BonusOctopusGuardian;
