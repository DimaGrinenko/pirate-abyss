import { useContext, useEffect, useRef, useState } from 'react';
import type { Application } from '@pixi/app';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import { DemandFrameLoop } from './demand-frame-loop';
import { ReelCurtainAward } from './ReelCurtainAward';
import type { ReelCurtainProps } from './ReelCurtain';
import { adaptReelCurtain, reelCurtainViewport, ReelCurtainTrack, resetReelCurtainAnchors, type ReelCurtainPlaybackSnapshot } from './reel-curtain-gpu';
import { loadGpuCurtain } from './reel-curtain-gpu-assets';
import { applyReelCurtainEntrance } from './reel-curtain-entrance';
import { acquireCurtainRenderer, releaseCurtainRenderer } from './reel-curtain-renderer-pool';
import { ReelCurtainStageContext } from './ReelCurtainStage';
import { SharedGpuReelCurtain } from './SharedGpuReelCurtain';
import { positionSpineOverlay } from './position-spine-overlay';

/** Native GPU mesh drawing. One independent context per visible expanded reel. */
function StandaloneGpuReelCurtain(props: ReelCurtainProps & { onFailure: (snapshot?: ReelCurtainPlaybackSnapshot) => void }) {
  const { type, multiplier, phase = 'idle', animated = true, active = true, winning = false, timeScale = 1, onFailure } = props;
  const host = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null), selection = useRef<HTMLSpanElement>(null);
  const latest = useRef(props); latest.current = props;
  const controller = useRef<{ configure: () => void; snapshot: () => ReelCurtainPlaybackSnapshot | undefined } | null>(null);
  const [readyType, setReadyType] = useState('');
  const completed = useRef(false);
  const awarded = useRef(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, failed = false;
    let app: Application | undefined, canvas: HTMLCanvasElement | undefined, observer: ResizeObserver | undefined;
    let frameLoop: DemandFrameLoop | undefined, visibilityChanged: (() => void) | undefined;
    const cleanup = () => {
      frameLoop?.dispose(); observer?.disconnect(); controller.current = null;
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      canvas?.removeEventListener('webglcontextlost', contextLost);
      if (app) releaseCurtainRenderer(app, failed);
      app = undefined;
    };
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      const snapshot = controller.current?.snapshot();
      cleanup(); onFailure(snapshot);
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(); };
    const mount = async () => {
      const { data, layout } = await loadGpuCurtain(type);
      if (disposed || failed) return;
      let view = reelCurtainViewport(element.clientWidth, element.clientHeight, window.devicePixelRatio, layout.width);
      app = acquireCurtainRenderer();
      app.renderer.resolution = view.resolution; app.renderer.resize(view.width, view.height);
      canvas = app.view as HTMLCanvasElement;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.dataset.spine = `reel-${type}`; canvas.dataset.spineReady = 'false';
      canvas.dataset.curtainRenderer = 'webgl';
      canvas.addEventListener('webglcontextlost', contextLost);
      element.prepend(canvas);
      const spine = new VisiblePaintedSpine(data);
      app.stage.addChild(spine);
      const awardBone = spine.skeleton.findBone('award');
      const track = new ReelCurtainTrack(spine.state, cue => {
        if (cue === 'award') {
          awarded.current = true;
          if (selection.current) selection.current.dataset.selecting = 'false';
        }
        latest.current.onCue?.(cue);
      }, () => {
        completed.current = true;
        if (selection.current) selection.current.dataset.selecting = 'false';
        latest.current.onComplete?.();
      }, () => !document.hidden);
      spine.beforeUpdateWorldTransforms = () => adaptReelCurtain(spine.skeleton, layout, view.worldHeight);
      let measuredFrames = 0, renderTotal = 0, previousDraw = 0, intervalTotal = 0, intervals = 0;
      const resize = () => {
        if (!app) return;
        const next = reelCurtainViewport(element.clientWidth, element.clientHeight, window.devicePixelRatio, layout.width);
        if (next.width !== view.width || next.height !== view.height || next.resolution !== view.resolution) {
          app.renderer.resolution = next.resolution; app.renderer.resize(next.width, next.height);
        }
        view = next;
        // Spine-Pixi owns its Y-down convention; authored geometry is unchanged.
        spine.scale.set(view.scale); spine.position.set(view.x, view.y);
        frameLoop?.invalidate();
      };
      const draw = (delta: number) => {
        if (!app || disposed || failed) return;
        try {
          const started = import.meta.env.DEV && delta > 0 ? performance.now() : 0;
          if (delta === 0) previousDraw = 0;
          resetReelCurtainAnchors(spine.skeleton, layout);
          spine.update(latest.current.animated !== false && latest.current.active !== false ? delta : 0);
          const currentTrack = spine.state.getCurrent(0);
          applyReelCurtainEntrance(element, currentTrack?.animation?.name, currentTrack?.trackTime ?? 0, latest.current.animated !== false);
          app.renderer.render(app.stage);
          if (canvas) {
            if (canvas.dataset.spineReady !== 'true') canvas.dataset.spineReady = 'true';
            const animation = currentTrack?.animation?.name ?? 'idle';
            if (canvas.dataset.spineAnimation !== animation) canvas.dataset.spineAnimation = animation;
          }
          if (awardBone && overlay.current) {
            positionSpineOverlay(overlay.current, view.x + awardBone.worldX * view.scale, view.y + awardBone.worldY * view.scale, awardBone.a, -awardBone.d);
          }
          if (started && canvas) {
            renderTotal += performance.now() - started;
            if (previousDraw) { intervalTotal += started - previousDraw; intervals++; }
            previousDraw = started;
            if (++measuredFrames === 60) {
              canvas.dataset.renderMs = (renderTotal / measuredFrames).toFixed(2);
              canvas.dataset.frameIntervalMs = (intervalTotal / Math.max(1, intervals)).toFixed(2);
              canvas.dataset.renderSamples = String(measuredFrames);
              canvas.dataset.renderMetric = 'CPU update and GPU submission';
              measuredFrames = 0; renderTotal = 0; intervalTotal = 0; intervals = 0;
            }
          }
        } catch { fail(); }
      };
      frameLoop = new DemandFrameLoop({ request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle) }, draw);
      let previousPhase: ReelCurtainProps['phase'];
      const configure = () => {
        if (disposed || failed) return;
        const current = latest.current, currentPhase = current.phase ?? 'idle';
        if (previousPhase !== currentPhase) { completed.current = false; awarded.current = false; previousPhase = currentPhase; }
        track.configure(currentPhase === 'reveal' ? 'reveal' : current.winning ? 'win' : 'idle',
          current.animated !== false, current.active !== false, current.timeScale ?? 1);
        if (selection.current) selection.current.dataset.selecting = String(track.selectionPending);
        previousDraw = 0;
        frameLoop?.setPlayback(current.animated !== false && current.active !== false, current.active !== false && !document.hidden);
        frameLoop?.invalidate();
      };
      controller.current = { configure, snapshot: () => {
        const current = spine.state.getCurrent(0), animation = current?.animation?.name;
        return current && (animation === 'reveal' || animation === 'idle' || animation === 'win')
          ? { type, animation, trackTime: current.trackTime } : undefined;
      } };
      visibilityChanged = () => {
        previousDraw = 0;
        frameLoop?.setPlayback(latest.current.animated !== false && latest.current.active !== false, latest.current.active !== false && !document.hidden);
      };
      observer = new ResizeObserver(() => { try { resize(); } catch { fail(); } });
      observer.observe(element);
      resize(); configure(); draw(0);
      if (disposed || failed) return;
      document.addEventListener('visibilitychange', visibilityChanged);
      if (!failed) setReadyType(type);
    };
    void mount().catch(fail);
    return () => { disposed = true; cleanup(); };
  }, [type, onFailure]);

  useEffect(() => { controller.current?.configure(); }, [phase, animated, active, winning, timeScale]);
  return <div ref={host} className={`alchemist-reel-curtain alchemist-reel-curtain--${type}`} data-phase={phase}
    data-animated={animated} data-ready={readyType === type} data-failed={false} data-winning={winning} data-curtain-renderer="webgl">
    <ReelCurtainAward type={type} multiplier={multiplier} overlayRef={overlay} selectionRef={selection}
      selecting={phase === 'reveal' && animated && !completed.current && !awarded.current} />
  </div>;
}

export function GpuReelCurtain(props: ReelCurtainProps & { onFailure: (snapshot?: ReelCurtainPlaybackSnapshot) => void }) {
  const stage = useContext(ReelCurtainStageContext);
  return stage ? <SharedGpuReelCurtain {...props} stage={stage} /> : <StandaloneGpuReelCurtain {...props} />;
}
