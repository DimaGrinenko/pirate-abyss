import { useEffect, useRef, useState } from 'react';
import { Application } from '@pixi/app';
import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import type { SkeletonData } from '@esotericsoftware/spine-core';
import { assetUrl } from './assets';
import { ALTAR_SKELETON_ALIAS, ALTAR_SKELETON_FILE, ALTAR_ATLAS_ALIAS, ALTAR_ATLAS_FILE, ALTAR_POSTERS } from './altar-assets';
import { applyAltarRewardVisibility, configureAltarAnimation, setAltarAnimationHeld, type AltarSceneVariant } from './altar-animation';
import { AnimationFrameLoop } from './animation-frame-loop';
import { afterVisiblePaint } from './visible-paint';
import { decodedImage, prepareAssetWork } from './asset-readiness';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import { parkRetainedSurface, restoreRetainedSurface } from './retained-surface';
import './altar-scene.css';

export type { AltarSceneVariant } from './altar-animation';
export type AltarSceneCue = 'arrival' | 'opening' | 'settled';
export interface AltarSceneProps {
  variant?: AltarSceneVariant;
  animated?: boolean;
  /** A zero bonus total keeps an intact quiet chest, including its exit. */
  rewarded?: boolean;
  /** Pause at the current pose; a new entrance starts held at frame zero. */
  held?: boolean;
  paused?: boolean;
  timeScale?: number;
  className?: string;
  onReady?: () => void;
  onCue?: (cue: AltarSceneCue) => void;
  onRewardEvent?: (cue: 'crack' | 'gold-land') => void;
  onExitComplete?: () => void;
}
const BASE = assetUrl('alchemist/altar/');
const animationLoop = new AnimationFrameLoop({
  request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle), hidden: () => document.hidden,
  subscribeVisibility: callback => { document.addEventListener('visibilitychange', callback); return () => document.removeEventListener('visibilitychange', callback); },
});
let dataPromise: Promise<SkeletonData> | undefined;
let posterPromise: Promise<void> | undefined;
function boundedLoad<T>(promise: Promise<T>, milliseconds = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Pirate treasure preparation timed out')), milliseconds);
    promise.then(value => { window.clearTimeout(timeout); resolve(value); }, error => { window.clearTimeout(timeout); reject(error); });
  });
}
function preloadPosters(): Promise<void> {
  if (!posterPromise) posterPromise = Promise.all(Object.values(ALTAR_POSTERS)
    .map(file => boundedLoad(decodedImage(`${BASE}${file}`), 8000).catch(() => undefined))).then(() => undefined);
  return posterPromise;
}
function loadAltar(): Promise<SkeletonData> {
  if (!dataPromise) {
    dataPromise = (async () => {
      await Assets.load([
        { alias: ALTAR_SKELETON_ALIAS, src: `${BASE}${ALTAR_SKELETON_FILE}` },
        { alias: ALTAR_ATLAS_ALIAS, src: `${BASE}${ALTAR_ATLAS_FILE}` },
      ]);
      return prepareAssetWork(() => {
        const temporary = Spine.from({ skeleton: ALTAR_SKELETON_ALIAS, atlas: ALTAR_ATLAS_ALIAS, autoUpdate: false });
        const data = temporary.skeleton.data;
        temporary.destroy({ children: true, texture: false, baseTexture: false });
        return data;
      });
    })().catch((error: unknown) => { dataPromise = undefined; throw error; });
  }
  return dataPromise;
}
function play(spine: Spine, variant: AltarSceneVariant, animated: boolean, held: boolean, rewarded = true) {
  configureAltarAnimation(spine.state, spine.skeleton, variant, animated, held, rewarded);
  spine.update(0);
  applyAltarRewardVisibility(spine.skeleton, rewarded);
}

type AltarRenderer = { app: Application; spine: Spine };
let spareRenderer: AltarRenderer | undefined;
let preparingRenderer: Promise<void> | undefined;
let poolDisposed = false;
function rendererLost(renderer: AltarRenderer) {
  const gl = (renderer.app.renderer as { gl?: WebGLRenderingContext }).gl;
  return gl?.isContextLost() ?? false;
}
function destroyRenderer(renderer: AltarRenderer) {
  try { renderer.app.destroy(true, { children: true, texture: false, baseTexture: false }); } catch { /* A lost context is already unusable. */ }
}
function releaseRenderer(renderer: AltarRenderer) {
  renderer.spine.state.clearListeners();
  renderer.spine.state.clearTracks();
  (renderer.app.view as HTMLCanvasElement).remove();
  // Keep one already-uploaded context for the reward screen. No idle RAF runs.
  if (!poolDisposed && !spareRenderer && !rendererLost(renderer)) {
    try { parkRetainedSurface(renderer.app.renderer); spareRenderer = renderer; }
    catch { destroyRenderer(renderer); }
  }
  else destroyRenderer(renderer);
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  poolDisposed = true;
  if (spareRenderer) destroyRenderer(spareRenderer);
  spareRenderer = undefined;
});
async function createRenderer(): Promise<AltarRenderer> {
  const data = await boundedLoad(loadAltar());
  return prepareAssetWork(() => {
  const app = new Application({ width: 450, height: 410, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, backgroundAlpha: 0, antialias: true, autoStart: false });
  const spine = new VisiblePaintedSpine(data);
  const renderer = { app, spine };
  try {
    spine.state.data.defaultMix = .25;
    spine.state.data.setMix('pour', 'reward', .12);
    spine.state.data.setMix('reward', 'idle', .35);
    app.stage.addChild(spine);
    spine.scale.set(.5); spine.position.set(225, 410);
    // Upload both the intact guardian and the reward's broken-board/gold page
    // in the same GL context that the visible scene will claim, not a throwaway.
    play(spine, 'summary', false, true); app.renderer.render(app.stage);
    play(spine, 'intro', true, true); app.renderer.render(app.stage);
    if (rendererLost(renderer)) throw new Error('Pirate treasure WebGL context lost during preparation');
    return renderer;
  } catch (error) { destroyRenderer(renderer); throw error; }
  });
}
async function prepareRenderer(): Promise<void> {
  // Browsers may evict a detached context while other scenes are playing.
  // Its loss event happened before the mounted scene could subscribe.
  if (spareRenderer) {
    if (!rendererLost(spareRenderer)) return;
    destroyRenderer(spareRenderer); spareRenderer = undefined;
  }
  if (!preparingRenderer) preparingRenderer = createRenderer().then(releaseRenderer).finally(() => { preparingRenderer = undefined; });
  await preparingRenderer;
}
async function acquireRenderer(): Promise<AltarRenderer> {
  await prepareRenderer();
  if (spareRenderer) {
    const renderer = spareRenderer; spareRenderer = undefined;
    if (!rendererLost(renderer)) return renderer;
    destroyRenderer(renderer);
  }
  return createRenderer();
}
// GPU preparation is optional: the decoded poster remains a usable presentation
// when WebGL or a native asset fails. It must not strand the startup screen.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadAltarScene(): Promise<void> {
  await Promise.all([prepareRenderer().catch(() => undefined), preloadPosters()]);
}

/** A coherent treasure chest: a rigid body and a lid projected about a fixed hinge. */
export function AltarScene({ variant = 'welcome', animated = true, rewarded = true, held = false, paused = false, timeScale = 1, className = '', onReady, onCue, onRewardEvent, onExitComplete }: AltarSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const instance = useRef<Spine | null>(null);
  const fallbackImage = useRef<HTMLImageElement>(null);
  const refreshPlayback = useRef<(() => void) | null>(null);
  const latest = useRef({ variant, animated, rewarded, held, paused, timeScale, onReady, onCue, onRewardEvent, onExitComplete });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rewardBroken, setRewardBroken] = useState(false);
  latest.current = { variant, animated, rewarded, held, paused, timeScale, onReady, onCue, onRewardEvent, onExitComplete };
  useEffect(() => {
    let disposed = false;
    let app: Application | undefined;
    let renderer: AltarRenderer | undefined;
    let observer: ResizeObserver | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let stop: (() => void) | undefined;
    let visibilityChanged: (() => void) | undefined;
    let renderFailed = false;
    let hasViewport = false;
    let readyAnnounced = false;
    let cancelReadyPaint: (() => void) | undefined;
    const pendingCues: (() => void)[] = [];
    const element = host.current;
    const wrapper = scene.current;
    if (!element || !wrapper) return;
    const announceReady = () => {
      if (readyAnnounced) return;
      readyAnnounced = true;
      latest.current.onReady?.();
    };
    const flushCues = () => { if (readyAnnounced && !disposed) pendingCues.splice(0).forEach(deliver => deliver()); };
    const presentReady = (fallback = false) => {
      if (disposed || readyAnnounced || cancelReadyPaint) return;
      cancelReadyPaint = afterVisiblePaint(() => {
        cancelReadyPaint = undefined;
        if (disposed || renderFailed !== fallback) return;
        announceReady();
        if (fallback || !latest.current.animated || latest.current.variant === 'summary' && !latest.current.rewarded) latest.current.onCue?.('settled');
        else flushCues();
        refreshPlayback.current?.();
      });
    };
    const fail = (error: unknown) => {
      if (disposed || renderFailed) return;
      renderFailed = true;
      stop?.(); observer?.disconnect();
      cancelReadyPaint?.(); cancelReadyPaint = undefined; pendingCues.length = 0;
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      canvas?.removeEventListener('webglcontextlost', contextLost);
      refreshPlayback.current = null;
      instance.current = null;
      // Do not retain a failed full-size GPU buffer behind the raster fallback.
      // Normal cleanup below must never release this retired lease twice.
      if (renderer) { destroyRenderer(renderer); renderer = undefined; app = undefined; }
      setReady(false); setFailed(true);
      // Decode the actual DOM fallback before releasing the count/audio. The
      // timeout is an error escape, never a normal animation delay.
      void boundedLoad(preloadPosters(), 8000).catch(() => undefined).then(async () => {
        if (disposed) return;
        const image = fallbackImage.current;
        if (image) await boundedLoad(image.decode(), 3000).catch(() => undefined);
        if (disposed) return;
        if (readyAnnounced) latest.current.onCue?.('settled');
        else presentReady(true);
      });
      console.warn('The pirate treasure uses its aligned raster fallback.', error);
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(new Error('Pirate treasure WebGL context lost')); };
    const mount = async () => {
      const acquired = await acquireRenderer();
      if (disposed) { releaseRenderer(acquired); return; }
      renderer = acquired; app = acquired.app;
      canvas = app.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.addEventListener('webglcontextlost', contextLost);
      element.append(canvas);
      const spine = acquired.spine;
      spine.state.clearListeners();
      spine.state.addListener({ event: (_entry, event) => {
        const name = event.data.name;
        if (!disposed && (name === 'arrival' || name === 'opening' || name === 'settled')) {
          pendingCues.push(() => { wrapper.dataset.altarCue = name; latest.current.onCue?.(name); });
        }
        if (!disposed && latest.current.variant === 'summary' && latest.current.rewarded && (name === 'crack' || name === 'gold-land')) {
          pendingCues.push(() => { if (name === 'crack') setRewardBroken(true); latest.current.onRewardEvent?.(name); });
        }
      }, complete: entry => {
        if (!disposed && (entry.animation?.name === 'exit' || entry.animation?.name === 'reward_broken_exit')) pendingCues.push(() => latest.current.onExitComplete?.());
      } });
      instance.current = spine;
      play(spine, latest.current.variant, latest.current.animated, latest.current.held, latest.current.rewarded);
      const resize = () => {
        if (disposed || renderFailed || !app) return;
        hasViewport = element.clientWidth > 0 && element.clientHeight > 0;
        if (!hasViewport) return;
        const width = element.clientWidth, height = element.clientHeight;
        const scale = Math.min(width / 900, height / 820);
        const offsetX = (width - 900 * scale) / 2;
        const offsetY = (height - 820 * scale) / 2;
        wrapper.dataset.altarLayout = 'preserve-aspect';
        wrapper.style.setProperty('--altar-scale', String(scale));
        wrapper.style.setProperty('--altar-offset-x', `${offsetX}px`);
        wrapper.style.setProperty('--altar-offset-y', `${offsetY}px`);
        restoreRetainedSurface(app.renderer, width, height, window.devicePixelRatio);
        spine.scale.set(scale);
        spine.position.set(width / 2, offsetY + 820 * scale);
        if (!document.hidden) { app.renderer.render(app.stage); setReady(true); presentReady(); }
      };
      observer = new ResizeObserver(() => { try { resize(); } catch (error) { fail(error); } });
      observer.observe(element);
      resize();
      if (renderFailed) return;
      const refresh = () => {
        stop?.(); stop = undefined;
        if (disposed || renderFailed || !app || document.hidden || !hasViewport) return;
        try {
          // A held or reduced-motion pose needs one paint, not continuous redraws.
          app.renderer.render(app.stage);
          setReady(true); presentReady(); flushCues();
          if (readyAnnounced && latest.current.animated && !latest.current.held && !latest.current.paused) stop = animationLoop.subscribe(delta => {
            if (disposed || renderFailed || !app) return;
            spine.update(delta * Math.max(0, latest.current.timeScale));
            applyAltarRewardVisibility(spine.skeleton, latest.current.rewarded);
            app.renderer.render(app.stage);
            flushCues();
          }, fail);
        } catch (error) { fail(error); }
      };
      refreshPlayback.current = refresh;
      visibilityChanged = refresh;
      document.addEventListener('visibilitychange', visibilityChanged);
      refresh();
    };
    void mount().catch(fail);
    return () => {
      disposed = true;
      stop?.();
      cancelReadyPaint?.(); pendingCues.length = 0;
      refreshPlayback.current = null;
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      observer?.disconnect();
      canvas?.removeEventListener('webglcontextlost', contextLost);
      instance.current = null;
      if (renderer) { if (renderFailed) destroyRenderer(renderer); else releaseRenderer(renderer); }
    };
  }, []);
  useEffect(() => {
    if (variant !== 'exit') setRewardBroken(variant === 'summary' && rewarded && !animated);
    if (instance.current) play(instance.current, variant, animated, latest.current.held, rewarded);
    refreshPlayback.current?.();
  }, [variant, animated, rewarded]);
  useEffect(() => {
    if (instance.current) setAltarAnimationHeld(instance.current.state, animated, held);
    refreshPlayback.current?.();
  }, [animated, held]);
  useEffect(() => { refreshPlayback.current?.(); }, [paused, timeScale]);
  useEffect(() => { if (failed && variant === 'exit') latest.current.onExitComplete?.(); }, [failed, variant]);
  // A lost context must not visually rebuild a chest that already fractured.
  const poster = rewarded && (variant === 'summary' || variant === 'exit') && (rewardBroken || variant === 'summary' && !animated)
    ? ALTAR_POSTERS.broken
    : variant === 'intro' || variant === 'welcome' || variant === 'purchase' ? ALTAR_POSTERS.arrival : ALTAR_POSTERS.intact;
  return <div ref={scene} className={`altar-scene ${className}`} aria-hidden="true" data-spine-altar={ready ? 'ready' : failed ? 'fallback' : 'loading'} data-altar-variant={variant} data-altar-playback={!animated ? 'static' : held ? 'held' : 'playing'}>
    {!ready && <img ref={fallbackImage} src={`${BASE}${poster}`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
    <div ref={host} className="altar-scene__canvas" hidden={failed} />
  </div>;
}
export default AltarScene;
