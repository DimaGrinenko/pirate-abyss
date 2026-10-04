import { useEffect, useRef, useState } from 'react';
import { Application } from '@pixi/app';
import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import { BlendMode, type SkeletonData } from '@esotericsoftware/spine-core';
import { assetUrl } from './assets';
import { ENVIRONMENT_SKELETON_ALIAS, ENVIRONMENT_SKELETON_FILE, ENVIRONMENT_ATLAS_FILE, ENVIRONMENT_ATLAS_ALIAS } from './environment-assets';
import { prepareAssetWork } from './asset-readiness';
import { BackgroundScene } from './BackgroundScene';
import { backgroundGpuLayout, visibleBackgroundSurface } from './background-gpu-layout';
import { GpuBackgroundSpine } from './gpu-background-spine';
import { DemandFrameLoop } from './demand-frame-loop';
import { renderDiagnosticsEnabled } from './render-diagnostics';
import { SpineSideFishSchool } from './spine-side-fish-v38';
import { BonusSharkWindow } from './BonusSharkWindow';
import { FishVolumeWindow } from './FishVolumeWindow';
import { loadFishRouteData } from './fish-route-data';
import { DecorativeBackgroundBudget } from './decorative-background-budget';
import './background-scene.css';
import './environment-v3.css';

const BASE = assetUrl('alchemist/environment/');
let gpuData: Promise<SkeletonData> | undefined;
function loadGpuEnvironment(): Promise<SkeletonData> {
  if (!gpuData) gpuData = (async () => {
    await Assets.load([
      { alias: ENVIRONMENT_SKELETON_ALIAS, src: `${BASE}${ENVIRONMENT_SKELETON_FILE}` },
      { alias: ENVIRONMENT_ATLAS_ALIAS, src: `${BASE}${ENVIRONMENT_ATLAS_FILE}` },
    ]);
    const temporary = await prepareAssetWork(() => Spine.from({ skeleton: ENVIRONMENT_SKELETON_ALIAS, atlas: ENVIRONMENT_ATLAS_ALIAS, autoUpdate: false }));
    const data = temporary.skeleton.data;
    temporary.destroy({ children: true, texture: false, baseTexture: false });
    // The previous Canvas triangle renderer ignores authored additive modes.
    // Preserve that accepted appearance on this private GPU skeleton data;
    // do not mutate the JSON, Canvas loader or any other scene's blend modes.
    for (const slot of data.slots) slot.blendMode = BlendMode.Normal;
    return data;
  })().catch((error: unknown) => { gpuData = undefined; throw error; });
  return gpuData;
}

// Startup shares this component's asset promise without mounting a second scene.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadGpuBackgroundScene() { await Promise.all([loadGpuEnvironment(), loadFishRouteData()]); }

/** One GPU context for the existing animated background, with Canvas recovery. */
export function GpuBackgroundScene({ animated = true, paused = false, timeScale = 1, bonus = false, reducedMotion = false }: { animated?: boolean; paused?: boolean; timeScale?: number; bonus?: boolean; reducedMotion?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const playing = animated && !paused;
  const current = useRef(playing);
  const speed = useRef(timeScale);
  const playback = useRef<DemandFrameLoop | null>(null);
  const [failed, setFailed] = useState(false);
  const volumeReady = useRef(false);
  const bonusState = useRef({ bonus, reducedMotion });
  bonusState.current = { bonus, reducedMotion };
  current.current = playing;
  speed.current = Number.isFinite(timeScale) ? Math.max(.01, timeScale) : 1;

  useEffect(() => {
    if (failed) return;
    const element = host.current;
    if (!element) return;
    let disposed = false, renderFailed = false;
    let app: Application | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let observer: ResizeObserver | undefined;
    let visibilityChanged: (() => void) | undefined;
    const destroyGpu = () => {
      playback.current?.dispose(); playback.current = null;
      observer?.disconnect();
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      canvas?.removeEventListener('webglcontextlost', contextLost);
      try { app?.destroy(true, { children: true, texture: false, baseTexture: false }); }
      catch { /* A lost GL context must still reach the independent Canvas fallback. */ }
      app = undefined;
    };
    const fail = () => {
      if (disposed || renderFailed) return;
      renderFailed = true;
      destroyGpu();
      setFailed(true);
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(); };
    const mount = async () => {
      const [data, fishRoutes] = await Promise.all([loadGpuEnvironment(), loadFishRouteData()]);
      if (disposed || renderFailed) return;
      const initial = backgroundGpuLayout(element.clientWidth, element.clientHeight, window.devicePixelRatio);
      const viewport = element.parentElement;
      const initialSurface = visibleBackgroundSurface(initial, viewport?.clientWidth ?? initial.width, viewport?.clientHeight ?? initial.height);
      const pixelBudget = new DecorativeBackgroundBudget(initial.resolution);
      app = new Application({ width: initialSurface.width, height: initialSurface.height, resolution: initial.resolution, autoDensity: true, backgroundAlpha: 0, antialias: true, autoStart: false });
      canvas = app.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.dataset.spineBackground = 'loading';
      canvas.dataset.spineAnimation = 'idle';
      canvas.dataset.environmentRenderer = 'webgl';
      canvas.dataset.environmentClipper = 'gpu-stencil';
      const measureAnimation = renderDiagnosticsEnabled(import.meta.env.DEV);
      if (measureAnimation) {
        // Inspect this scene's existing context once; never allocate a probe context.
        const gl = (app.renderer as { gl?: WebGLRenderingContext | WebGL2RenderingContext }).gl;
        let rendererName: unknown;
        try {
          const info = gl?.getExtension('WEBGL_debug_renderer_info');
          if (info) rendererName = gl!.getParameter(info.UNMASKED_RENDERER_WEBGL);
        } catch { /* Privacy settings may deny the unmasked renderer. */ }
        if (typeof rendererName !== 'string' || !rendererName.trim()) {
          try { rendererName = gl?.getParameter(gl.RENDERER); } catch { /* A lost context may also reject its generic name. */ }
        }
        canvas.dataset.renderer = typeof rendererName === 'string' && rendererName.trim() ? rendererName : 'unavailable';
      }
      canvas.addEventListener('webglcontextlost', contextLost);
      element.append(canvas);
      const spine = new GpuBackgroundSpine(data);
      const school = new SpineSideFishSchool(fishRoutes.routes, fishRoutes.maskPolygons, fishRoutes.navigationBoundaries);
      let schoolStep = 0;
      // Apply cosmetic local poses before Spine's normal world-transform pass.
      // Running it afterwards used to recompute all 151 world bones twice.
      spine.beforeUpdateWorldTransforms = () => {
        school.apply(spine.skeleton, schoolStep, bonusState.current.bonus, bonusState.current.reducedMotion, volumeReady.current);
      };
      spine.state.setAnimation(0, 'idle', true);
      spine.update(0);
      app.stage.addChild(spine);
      let width = 0, height = 0, resolution = 0, cameraX = 0, cameraY = 0, cameraScale = 0;
      const resize = (resetSampling = true) => {
        if (!app || disposed || renderFailed) return;
        const layout = backgroundGpuLayout(element.clientWidth, element.clientHeight, window.devicePixelRatio);
        pixelBudget.setNativeResolution(layout.resolution);
        const surface = visibleBackgroundSurface(layout, viewport?.clientWidth ?? layout.width, viewport?.clientHeight ?? layout.height, pixelBudget.resolution);
        if (width === surface.width && height === surface.height && resolution === pixelBudget.resolution && cameraX === surface.x && cameraY === surface.y && cameraScale === surface.scale) return;
        if (resetSampling) pixelBudget.resetSampling();
        width = surface.width; height = surface.height; resolution = pixelBudget.resolution;
        cameraX = surface.x; cameraY = surface.y; cameraScale = surface.scale;
        app.renderer.resolution = resolution;
        app.renderer.resize(surface.width, surface.height);
        if (canvas) {
          canvas.style.position = 'absolute'; canvas.style.left = `${surface.left}px`; canvas.style.top = `${surface.top}px`;
          canvas.style.width = `${surface.width}px`; canvas.style.height = `${surface.height}px`;
        }
        // Spine-Pixi's own Y-down skeleton maps +authored Y upwards. Do not
        // flip the container again or change the global Skeleton.yDown flag.
        spine.scale.set(surface.scale);
        spine.position.set(surface.x, surface.y);
        if (measureAnimation && canvas) {
          canvas.dataset.backgroundResolution = resolution.toFixed(2);
          canvas.dataset.backgroundQuality = resolution < layout.resolution ? 'adaptive' : 'native';
          canvas.dataset.backgroundSurface = `${Math.round(surface.width * resolution)}x${Math.round(surface.height * resolution)}`;
          canvas.dataset.backgroundFullSurface = `${Math.round(layout.width * resolution)}x${Math.round(layout.height * resolution)}`;
        }
        playback.current?.invalidate();
      };
      let frames = 0, totalMs = 0, previousDraw = 0, totalInterval = 0, intervals = 0;
      const loop = new DemandFrameLoop({ request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle) }, delta => {
        if (!app || disposed || renderFailed) return;
        try {
          const frameAt = performance.now();
          const started = measureAnimation ? frameAt : 0;
          if (current.current && delta > 0 && !document.hidden) {
            if (pixelBudget.record(frameAt)) resize(false);
          } else pixelBudget.resetSampling();
          if (delta === 0) previousDraw = 0;
          const step = current.current && delta > 0 ? delta * speed.current : 0;
          schoolStep = step;
          spine.update(step);
          app.renderer.render(app.stage);
          if (canvas && canvas.dataset.spineBackground !== 'ready') canvas.dataset.spineBackground = 'ready';
          if (started && delta > 0 && canvas) {
            totalMs += performance.now() - started;
            if (previousDraw) { totalInterval += started-previousDraw; intervals++; }
            previousDraw = started;
            if (++frames === 60) {
              canvas.dataset.renderMs = (totalMs/frames).toFixed(2);
              canvas.dataset.frameIntervalMs = (totalInterval/Math.max(1,intervals)).toFixed(2);
              canvas.dataset.renderSamples = String(frames);
              canvas.dataset.renderMetric = 'CPU update and GPU submission';
              frames=0; totalMs=0; totalInterval=0; intervals=0;
            }
          }
        } catch { fail(); }
      });
      playback.current = loop;
      visibilityChanged = () => {
        element.dataset.environmentMotion = current.current && !document.hidden ? 'running' : 'paused';
        // Exclude hidden/modal intervals from the diagnostic sample window.
        previousDraw=0;
        loop.setPlayback(current.current, !document.hidden);
      };
      observer = new ResizeObserver(() => { try { resize(); } catch { fail(); } });
      observer.observe(element);
      if (viewport) observer.observe(viewport);
      resize();
      document.addEventListener('visibilitychange', visibilityChanged);
      visibilityChanged();
      loop.invalidate();
    };
    void mount().catch(fail);
    return () => { disposed = true; destroyGpu(); };
  }, [failed]);

  useEffect(() => {
    playback.current?.setPlayback(playing, !document.hidden);
    if (host.current) host.current.dataset.environmentMotion = playing && !document.hidden ? 'running' : 'paused';
  }, [playing]);

  useEffect(() => { playback.current?.invalidate(); }, [bonus, reducedMotion]);

  if (failed) return <BackgroundScene animated={playing} timeScale={timeScale} bonus={bonus} reducedMotion={reducedMotion} />;
  return <div ref={host} className="background-scene" data-environment-renderer="webgl" data-environment-motion={playing ? 'running' : 'paused'} aria-hidden="true"><FishVolumeWindow animated={playing} bonus={bonus} reducedMotion={reducedMotion} timeScale={timeScale} onReady={ready => { volumeReady.current = ready; playback.current?.invalidate(); }} /><BonusSharkWindow active={bonus} animated={playing} reducedMotion={reducedMotion} /></div>;
}

