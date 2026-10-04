import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Application } from '@pixi/app';
import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import { BlendMode, type SkeletonData, type TrackEntry } from '@esotericsoftware/spine-core';
import { assetUrl } from './assets';
import { prepareAssetWork } from './asset-readiness';
import { DemandFrameLoop } from './demand-frame-loop';
import { BigwinPhaseDelivery, bigwinGpuLayout, createBigwinResponsivePose } from './bigwin-gpu-layout';
import type { BigwinPlayback, BigwinPortraitLayout } from './bigwin-gpu-layout';
import { afterVisiblePaint } from './visible-paint';
import { acquireBigwinRenderer, releaseBigwinRenderer, warmBigwinRenderer } from './bigwin-renderer-pool';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';

type Callbacks = { onReady: () => void; onComplete: () => void; onEvent: (name: string) => void; playback?: BigwinPlayback };
export type GpuBigwinSceneProps = {
  active?: boolean;
  paused?: boolean;
  timeScale?: number;
  reducedMotion?: boolean;
  tier?: 'big' | 'super' | 'mega' | 'epic' | 'legendary' | 'max';
  phase?: 'entrance' | 'celebrate' | 'exit';
  onComplete?: () => void;
  onReady?: () => void;
  onEvent?: (name: string) => void;
  renderFallback: (callbacks: Callbacks) => ReactNode;
};

const DATA_ALIAS = 'pirate-bigwin-gpu-treasure33-cartoon-data', ATLAS_ALIAS = 'pirate-bigwin-gpu-treasure33-cartoon-atlas';
let cached: Promise<{ data: SkeletonData; portrait: BigwinPortraitLayout }> | undefined;
async function loadBigwin() {
  if (!cached) cached = (async () => {
    const base = assetUrl('alchemist/effects/');
    await Assets.load([
      { alias: DATA_ALIAS, src: `${base}bigwin-v2-compact-v27.json?v=motion27` },
      { alias: ATLAS_ALIAS, src: `${base}bigwin-v33.atlas` },
    ]);
    const json = Assets.get(DATA_ALIAS) as { portraitLayout: BigwinPortraitLayout };
    const temporary = await prepareAssetWork(() => Spine.from({ skeleton: DATA_ALIAS, atlas: ATLAS_ALIAS, autoUpdate: false }));
    const data = temporary.skeleton.data;
    temporary.destroy({ children: true, texture: false, baseTexture: false });
    // Canvas's accepted raster composition uses ordinary alpha blending even
    // for authored additive slots. Keep that appearance on this private data.
    for (const slot of data.slots) slot.blendMode = BlendMode.Normal;
    return { data, portrait: json.portraitLayout };
  })().catch((error: unknown) => { cached = undefined; throw error; });
  return cached;
}

/** Decode the native award before play so its first appearance has no load gap. */
export async function preloadGpuBigwin(): Promise<void> {
  const { data } = await loadBigwin();
  await warmBigwinRenderer(data);
}

/** One temporary GL context renders the real mesh animation of the celebration. */
export function GpuBigwinScene({ active = true, paused = false, timeScale = 1, reducedMotion = false, tier = 'big', phase = 'entrance', onReady, onComplete, onEvent, renderFallback }: GpuBigwinSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ active, paused, timeScale, reducedMotion, tier, phase, onReady, onComplete, onEvent });
  current.current = { active, paused, timeScale, reducedMotion, tier, phase, onReady, onComplete, onEvent };
  const configure = useRef<(() => void) | null>(null);
  const delivery = useRef(new BigwinPhaseDelivery());
  const recovery = useRef<BigwinPlayback | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const phaseKey = `${tier}:${phase}`;

  useEffect(() => {
    delivery.current.begin(phaseKey);
    // A later genuine phase cycle must not revive the one-time loss snapshot.
    if (recovery.current?.phaseKey !== phaseKey) recovery.current = undefined;
  }, [phaseKey]);

  useEffect(() => {
    if (!active || failed) return;
    const element = host.current;
    if (!element) return;
    let disposed = false, broken = false;
    let app: Application | undefined, canvas: HTMLCanvasElement | undefined;
    let observer: ResizeObserver | undefined, loop: DemandFrameLoop | undefined;
    let visibilityChanged: (() => void) | undefined;
    let snapshot: (() => BigwinPlayback | undefined) | undefined;
    let paintReady = false, cancelReadyPaint: (() => void) | undefined;
    const pendingCues: (() => void)[] = [];
    const flushCues = () => { if (paintReady && !disposed && !broken && !current.current.paused) pendingCues.splice(0).forEach(deliver => deliver()); };
    const destroy = () => {
      configure.current = null; loop?.dispose(); observer?.disconnect();
      cancelReadyPaint?.(); pendingCues.length = 0;
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      canvas?.removeEventListener('webglcontextlost', contextLost);
      if (app) releaseBigwinRenderer(app, broken);
      app = undefined;
    };
    const fail = () => {
      if (disposed || broken) return;
      recovery.current = snapshot?.();
      broken = true; destroy(); setFailed(true);
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(); };
    const mount = async () => {
      const { data, portrait } = await loadBigwin();
      if (disposed || broken) return;
      let layout = bigwinGpuLayout(element.clientWidth, element.clientHeight, window.devicePixelRatio, portrait.height);
      app = acquireBigwinRenderer();
      app.renderer.resolution = layout.resolution;
      app.renderer.resize(layout.width, layout.height);
      canvas = app.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'block' });
      canvas.dataset.spine = 'bigwin'; canvas.dataset.spineReady = 'false'; canvas.dataset.bigwinRenderer = 'webgl';
      canvas.addEventListener('webglcontextlost', contextLost); element.append(canvas);
      const spine = new VisiblePaintedSpine(data);
      spine.state.data.defaultMix = .28;
      for (const name of ['big', 'super', 'mega', 'epic', 'legendary', 'max']) {
        spine.state.data.setMix(`${name}-entrance`, `${name}-idle`, .24);
        spine.state.data.setMix(`${name}-idle`, `${name}-celebrate`, .32);
        spine.state.data.setMix(`${name}-celebrate`, `${name}-idle`, .35);
      }
      // Called after AnimationState.apply, exactly where Canvas applies these
      // offsets; restoration happens before every update, including resize.
      const responsivePose = createBigwinResponsivePose(spine.skeleton, portrait);
      spine.beforeUpdateWorldTransforms = () => responsivePose.apply(layout.portrait);
      app.stage.addChild(spine);
      let commandKey = '', entry: TrackEntry | null = null, wasReduced = false, reducedCompletion: string | null = null;
      snapshot = () => {
        const playing = spine.state.getCurrent(0);
        return playing?.animation ? { phaseKey: commandKey, animation: playing.animation.name, trackTime: playing.trackTime } : undefined;
      };
      const complete = (key: string) => {
        if (disposed || broken || `${current.current.tier}:${current.current.phase}` !== key) return;
        if (!paintReady || current.current.paused) { pendingCues.push(() => complete(key)); return; }
        if (delivery.current.complete(key)) current.current.onComplete?.();
      };
      const command = () => {
        const options = current.current, key = `${options.tier}:${options.phase}`;
        delivery.current.begin(key);
        const changedPhase = commandKey !== key;
        if (changedPhase) {
          commandKey = key;
          spine.state.clearListeners();
          entry = spine.state.setAnimation(0, `${options.tier}-${options.phase}`, false);
          const phaseEntry = entry;
          if (options.phase !== 'exit') spine.state.addAnimation(0, `${options.tier}-idle`, true, entry.animationEnd);
          spine.state.addListener({
            start: started => { if (canvas) canvas.dataset.spineAnimation = started.animation?.name ?? ''; },
            event: (track, event) => {
              if (track !== phaseEntry || disposed || broken || document.hidden || current.current.reducedMotion || `${current.current.tier}:${current.current.phase}` !== key) return;
              pendingCues.push(() => { if (`${current.current.tier}:${current.current.phase}` === key && delivery.current.cue(key, event.data.name)) current.current.onEvent?.(event.data.name); });
            },
            complete: finished => { if (finished === phaseEntry) complete(key); },
          });
          if (canvas) { canvas.dataset.spineAnimation = entry.animation?.name ?? ''; canvas.dataset.celebrationPhase = options.phase; }
        }
        if (options.reducedMotion && (changedPhase || !wasReduced)) {
          // Settle the current phase once. Re-enabling motion resumes its
          // queued idle; replaying the entrance would pop every prop to zero.
          const playing = spine.state.getCurrent(0);
          if (playing && playing.animation?.name !== `${options.tier}-idle`) playing.trackTime = playing.animationEnd;
          spine.state.update(0); reducedCompletion = key;
        }
        wasReduced = options.reducedMotion;
        loop?.setPlayback(!options.reducedMotion && !options.paused, !document.hidden); loop?.invalidate();
      };
      configure.current = command;
      const resize = () => {
        if (!app || disposed || broken) return;
        const next = bigwinGpuLayout(element.clientWidth, element.clientHeight, window.devicePixelRatio, portrait.height);
        if (next.width !== layout.width || next.height !== layout.height || next.resolution !== layout.resolution) {
          app.renderer.resolution = next.resolution; app.renderer.resize(next.width, next.height);
        }
        layout = next; spine.scale.set(layout.scale); spine.position.set(layout.x, layout.y); loop?.invalidate();
      };
      let ready = false, samples = 0, totalMs = 0, previous = 0, intervalTotal = 0, intervals = 0;
      loop = new DemandFrameLoop({ request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle) }, delta => {
        if (!app || disposed || broken) return;
        try {
          const started = import.meta.env.DEV ? performance.now() : 0;
          if (delta === 0) previous = 0;
          responsivePose.reset();
          spine.update(!paintReady || current.current.reducedMotion || current.current.paused ? 0 : delta * Math.max(0, current.current.timeScale));
          app.renderer.render(app.stage);
          if (canvas && !ready) { canvas.dataset.spineReady = 'true'; ready = true; }
          if (!paintReady && !cancelReadyPaint) cancelReadyPaint = afterVisiblePaint(() => {
            if (disposed || broken) return;
            paintReady = true;
            current.current.onReady?.();
            flushCues();
          });
          flushCues();
          if (reducedCompletion) { const key = reducedCompletion; reducedCompletion = null; complete(key); }
          if (started && delta > 0 && canvas) {
            totalMs += performance.now() - started;
            if (previous) { intervalTotal += started - previous; intervals++; }
            previous = started;
            if (++samples === 60) {
              canvas.dataset.renderMs = (totalMs / samples).toFixed(2);
              canvas.dataset.frameIntervalMs = (intervalTotal / Math.max(1, intervals)).toFixed(2);
              canvas.dataset.renderSamples = String(samples); canvas.dataset.renderMetric = 'CPU update and GPU submission';
              samples = 0; totalMs = 0; intervalTotal = 0; intervals = 0;
            }
          }
        } catch { fail(); }
      });
      visibilityChanged = () => { previous = 0; loop?.setPlayback(!current.current.reducedMotion && !current.current.paused, !document.hidden); };
      observer = new ResizeObserver(() => { try { resize(); } catch { fail(); } }); observer.observe(element);
      document.addEventListener('visibilitychange', visibilityChanged);
      resize(); command(); visibilityChanged(); loop.invalidate();
    };
    void mount().catch(fail);
    return () => { disposed = true; destroy(); };
  }, [active, failed]);

  useEffect(() => { configure.current?.(); }, [tier, phase, reducedMotion, paused, timeScale]);

  if (!active) return null;
  if (failed) return renderFallback({
    playback: recovery.current,
    onReady: () => current.current.onReady?.(),
    onComplete: () => { if (delivery.current.complete(phaseKey)) current.current.onComplete?.(); },
    onEvent: name => { if (!current.current.reducedMotion && delivery.current.cue(phaseKey, name)) current.current.onEvent?.(name); },
  });
  return <div ref={host} data-bigwin-renderer="webgl" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
