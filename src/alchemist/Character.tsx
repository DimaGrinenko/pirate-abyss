import { t } from './locale';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Application } from '@pixi/app';
import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import type { SkeletonData } from '@esotericsoftware/spine-core';

import { assetUrl } from './assets';
import { prepareAssetWork } from './asset-readiness';
import { captainPlacement, captainPosterPlacement, CAPTAIN_PLATFORM } from './character-layout';
import { createCaptainPalmTurn } from './character-palm';
import { CAPTAIN_AMBIENT_REACTIONS, configureCaptainMixes, setCaptainPlayback, playCaptainReaction, queueCaptainIdleGesture } from './character-animation';
import { CAPTAIN_SKELETON_ALIAS, CAPTAIN_SKELETON_FILE, CAPTAIN_ATLAS_ALIAS, CAPTAIN_ATLAS_FILE, CAPTAIN_POSTER_FILE } from './character-assets';
import { DemandFrameLoop } from './demand-frame-loop';
import { renderDiagnosticsEnabled } from './render-diagnostics';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import './character-performance.css';

export type CharacterMood = 'idle' | 'anticipation' | 'suspense' | 'cast' | 'summon' | 'win' | 'loss' | 'bonus' | 'laugh' | 'wave' | 'tiphat' | 'look' | 'cheer' | 'salute' | 'lantern' | 'curious' | 'surprise' | 'approve' | 'disappointed' | 'triumph'
  | 'approve-proud' | 'approve-amused' | 'win-resolve' | 'curious-doubletake' | 'lantern-listen';
export interface CharacterProps {
  mood: CharacterMood;
  reducedMotion?: boolean;
  animated?: boolean;
  /** Inspection pause retains the exact live pose and queued reactions. */
  paused?: boolean;
  timeScale?: number;
  className?: string;
  onLaugh?: () => void;
  interactive?: boolean;
  /** Increment for a new event even when its mood matches the previous event. */
  cue?: number;
}

const BASE = assetUrl('alchemist/character/');
let characterData: Promise<SkeletonData> | undefined;

/** Share the coherent native raster captain Spine atlas across mounts. */
function loadCharacter(): Promise<SkeletonData> {
  if (!characterData) {
    characterData = (async () => {
      await Assets.load([
        { alias: CAPTAIN_SKELETON_ALIAS, src: `${BASE}${CAPTAIN_SKELETON_FILE}` },
        { alias: CAPTAIN_ATLAS_ALIAS, src: `${BASE}${CAPTAIN_ATLAS_FILE}` },
      ]);
      const temporary = await prepareAssetWork(() => Spine.from({
        skeleton: CAPTAIN_SKELETON_ALIAS,
        atlas: CAPTAIN_ATLAS_ALIAS,
        autoUpdate: false,
      }));
      const data = temporary.skeleton.data;
      temporary.destroy({ children: true, texture: false, baseTexture: false });
      return data;
    })().catch((error: unknown) => {
      characterData = undefined;
      throw error;
    });
  }
  return characterData;
}

// The startup loader shares the exact asset promise used by this component.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadCharacter(): Promise<void> {
  await loadCharacter();
}

function play(spine: Spine, mood: CharacterMood, reducedMotion: boolean, animated: boolean, variation = 0) {
  if (!animated) {
    spine.state.clearTracks();
    spine.skeleton.setToSetupPose();
    spine.state.timeScale = 0;
    spine.update(0);
    return;
  }
  if (reducedMotion) {
    spine.state.clearTracks();
    spine.skeleton.setToSetupPose();
  }
  playCaptainReaction(spine.state, mood, reducedMotion, variation);
  spine.state.timeScale = reducedMotion ? 0 : 1;
  spine.update(0);
}

/** A continuous painted mesh follows articulated limbs, planted feet and facial acting. */
export function Character({ mood, reducedMotion = false, animated = true, paused = false, timeScale = 1, className, onLaugh, interactive = false, cue = 0 }: CharacterProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Spine | null>(null);
  const playback = useRef<DemandFrameLoop | null>(null);
  const greeting = useRef(0);
  const reactions = useRef<Partial<Record<CharacterMood, number>>>({});
  const nextReaction = (name: CharacterMood) => {
    const count = reactions.current[name] ?? 0;
    reactions.current[name] = count + 1;
    return count;
  };
  const current = useRef({ mood, reducedMotion, animated, paused, timeScale, onLaugh });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeAnimation, setActiveAnimation] = useState<string>('static');
  current.current = { mood, reducedMotion, animated, paused, timeScale, onLaugh };

  // Register both the deck and poster before GL loads. A failed renderer must
  // retain the same painted boot contacts, scale and stance as the live rig.
  useLayoutEffect(() => {
    const element = host.current, holder = element?.parentElement;
    if (!element || !holder) return;
    const measure = () => {
      const width = Math.max(element.clientWidth, 1), height = Math.max(element.clientHeight, 1);
      const placement = captainPlacement(width, height), poster = captainPosterPlacement(width, height);
      holder.style.setProperty('--captain-platform-width', `${CAPTAIN_PLATFORM.width * placement.scale}px`);
      holder.style.setProperty('--captain-platform-left', `${placement.originX + CAPTAIN_PLATFORM.left * placement.scale}px`);
      holder.style.setProperty('--captain-platform-top', `${placement.originY - CAPTAIN_PLATFORM.top * placement.scale}px`);
      for (const [key, value] of Object.entries(poster)) holder.style.setProperty(`--captain-poster-${key}`, `${value}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let app: Application | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let visibilityChanged: (() => void) | undefined;
    let renderFailed = false;
    const element = host.current;
    if (!element) return;
    const release = () => {
      playback.current?.dispose(); playback.current = null;
      resizeObserver?.disconnect();
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      canvas?.removeEventListener('webglcontextlost', contextLost);
      instance.current?.state.clearListeners(); instance.current = null;
      try { app?.destroy(true, { children: true, texture: false, baseTexture: false }); }
      catch { /* The aligned raster fallback also works after a lost GL context. */ }
      app = undefined;
    };
    const fail = (error: unknown) => {
      if (disposed || renderFailed) return;
      renderFailed = true; release(); setReady(false); setFailed(true);
      console.warn('The captain uses his aligned raster fallback.', error);
    };
    const contextLost = (event: Event) => { event.preventDefault(); fail(new Error('Captain WebGL context lost')); };

    const mount = async () => {
      const data = await loadCharacter();
      if (disposed || renderFailed) return;
      app = new Application({
        width: Math.max(element.clientWidth, 1),
        height: Math.max(element.clientHeight, 1),
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoStart: false,
      });
      canvas = app.view as HTMLCanvasElement;
      canvas.style.cssText = 'display:block;width:100%;height:100%;';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.addEventListener('webglcontextlost', contextLost);
      element.append(canvas);
      const measureAnimation = renderDiagnosticsEnabled(import.meta.env.DEV);
      if(measureAnimation){
        // Query once when explicitly diagnosing; never select or force a GPU
        // backend. Privacy-restricted browsers retain their masked labels.
        try{
          const gl=(app.renderer as typeof app.renderer & {gl?:WebGLRenderingContext}).gl;
          if(gl){const info=gl.getExtension('WEBGL_debug_renderer_info');canvas.dataset.gpuVendor=String(gl.getParameter(info?.UNMASKED_VENDOR_WEBGL??gl.VENDOR));canvas.dataset.gpuRenderer=String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL??gl.RENDERER));canvas.dataset.gpuApi=String(gl.getParameter(gl.VERSION));canvas.dataset.gpuDebugInfo=String(Boolean(info));}
        }catch{canvas.dataset.gpuDebugInfo='unavailable';}
      }
      const spine = new VisiblePaintedSpine(data);
      spine.beforeUpdateWorldTransforms = createCaptainPalmTurn(spine.skeleton);
      configureCaptainMixes(spine.state);
      let idleVariation = 0;
      spine.state.addListener({
        start: entry => {
          if (!disposed) setActiveAnimation(entry.animation?.name ?? 'static');
          if (entry.animation?.name === 'idle' && !current.current.reducedMotion) {
            const gesture = CAPTAIN_AMBIENT_REACTIONS[idleVariation++ % CAPTAIN_AMBIENT_REACTIONS.length];
            queueCaptainIdleGesture(spine.state, entry, gesture);
          }
        },
        event: (_entry, event) => {
          if (event.data.name === 'laugh' && current.current.animated && !current.current.reducedMotion && !current.current.paused && !document.hidden) {
            current.current.onLaugh?.();
          }
        },
      });
      instance.current = spine;
      app.stage.addChild(spine);
      play(spine, current.current.mood, current.current.reducedMotion, current.current.animated, nextReaction(current.current.mood));
      setCaptainPlayback(spine.state, current.current.animated, current.current.reducedMotion, current.current.paused, current.current.timeScale);
      const resize = () => {
        if (!app || !canvas || disposed || renderFailed) return;
        const width = Math.max(element.clientWidth, 1);
        const height = Math.max(element.clientHeight, 1);
        const placement = captainPlacement(width, height);
        app.renderer.resize(placement.canvasWidth, height);
        canvas.style.width = `${placement.canvasWidth}px`;
        canvas.style.marginLeft = `${-placement.gutterLeft}px`;
        spine.scale.set(placement.scale);
        spine.position.set(placement.originX + placement.gutterLeft, placement.originY);
        if (!document.hidden) app.renderer.render(app.stage);
        else playback.current?.invalidate();
      };
      resizeObserver = new ResizeObserver(() => { try { resize(); } catch (error) { fail(error); } });
      resizeObserver.observe(element);
      resize();
      if (disposed || renderFailed) return;
      setReady(true);
      let sampleCount = 0, sampleMs = 0, sampleInterval = 0, previousSample = 0;
      const loop = new DemandFrameLoop({
        request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle),
      }, delta => {
        if (disposed || renderFailed || !app || !canvas) return;
        try {
        if (delta === 0) { sampleCount = 0; sampleMs = 0; sampleInterval = 0; previousSample = 0; }
        const measuredStart = measureAnimation && delta > 0 ? performance.now() : 0;
        if (current.current.animated && !current.current.reducedMotion && !current.current.paused) spine.update(delta);
        app.renderer.render(app.stage);
        if (measuredStart) {
          sampleMs += performance.now() - measuredStart;
          if (previousSample) sampleInterval += measuredStart - previousSample;
          previousSample = measuredStart;
          if (++sampleCount === 60) {
            canvas.dataset.renderMs = (sampleMs / sampleCount).toFixed(2);
            canvas.dataset.frameIntervalMs = (sampleInterval / 59).toFixed(2);
            canvas.dataset.renderSamples = String(sampleCount);
            canvas.dataset.renderMetric = 'CPU update and GPU submission';
            sampleCount = 0; sampleMs = 0; sampleInterval = 0; previousSample = 0;
          }
        }
        } catch (error) { fail(error); }
      });
      playback.current = loop;
      visibilityChanged = () => loop.setPlayback(current.current.animated && !current.current.reducedMotion && !current.current.paused, !document.hidden);
      document.addEventListener('visibilitychange', visibilityChanged);
      visibilityChanged();
      if (document.hidden) loop.invalidate();
    };
    void mount().catch(fail);

    return () => {
      disposed = true;
      release();
    };
  }, []);

  useEffect(() => {
    if (!instance.current) return;
    play(instance.current, mood, reducedMotion, true, nextReaction(mood));
    setCaptainPlayback(instance.current.state, current.current.animated, reducedMotion, current.current.paused, current.current.timeScale);
    playback.current?.invalidate();
  }, [mood, reducedMotion, cue]);

  useEffect(() => {
    // A modal pauses the exact pose. Resuming must not restart a gesture or
    // snap the captain back to his setup painting.
    const spine = instance.current;
    if (!spine) return;
    if (animated && !spine.state.getCurrent(0)) play(spine, current.current.mood, reducedMotion, true, nextReaction(current.current.mood));
    setCaptainPlayback(spine.state, animated, reducedMotion, paused, timeScale);
    playback.current?.setPlayback(animated && !reducedMotion && !paused, !document.hidden);
  }, [animated, reducedMotion, paused, timeScale]);

  const greet = () => {
    if (!interactive || !animated || paused || !instance.current) return;
    const gestures = ['approve', 'curious', 'look', 'laugh'] as const;
    const gesture = gestures[greeting.current++ % gestures.length];
    play(instance.current, gesture, reducedMotion, true, nextReaction(gesture));
    setCaptainPlayback(instance.current.state, animated, reducedMotion, paused, timeScale);
    playback.current?.invalidate();
  };
  return (
    <div
      className={className}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t('Поприветствовать капитана') : t("Капитан-призрак с фонарём")}
      onClick={interactive ? greet : undefined}
      onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) greet(); } } : undefined}
      data-spine-character={ready ? 'ready' : failed ? 'fallback' : 'loading'}
      data-character-mood={mood}
      data-character-animation={activeAnimation}
      data-character-paused={paused}
      data-character-speed={timeScale}
      style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'pointer' : undefined }}
    >
      <img className="captain-platform" src={`${BASE}captain-platform-v42.webp`} alt="" aria-hidden="true" draggable={false} />
      {!ready && <img className="captain-poster" data-character-fallback src={`${BASE}${CAPTAIN_POSTER_FILE}`} alt="" />}
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}

export default Character;

