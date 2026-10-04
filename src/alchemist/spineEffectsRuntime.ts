import { useEffect, useRef, useState } from 'react';
import {
  AnimationState, AnimationStateData, AtlasAttachmentLoader, CanvasTexture,
  MeshAttachment, Physics, Skeleton, SkeletonJson, SkeletonRenderer, TextureAtlas,
} from '@esotericsoftware/spine-canvas';
import type { SkeletonData } from '@esotericsoftware/spine-canvas';

import { assetUrl } from './assets';
import { decodedImage, prepareAssetWork } from './asset-readiness';
import { SYMBOL_ART_REVISION } from './symbol-assets';
import { ENVIRONMENT_SKELETON_FILE, ENVIRONMENT_ATLAS_FILE } from './environment-assets';
import { SeamlessCanvasSkeletonRenderer } from './SeamlessCanvasSkeletonRenderer';
import { ClippedCanvasSkeletonRenderer } from './ClippedCanvasSkeletonRenderer';
import { FastRegionCanvasRenderer, canUseFastRegionRenderer } from './FastRegionCanvasRenderer';
import { AnimationFrameLoop } from './animation-frame-loop';
import { applySailClothLayout, type SailClothLayout } from './sail-cloth-layout';
import { restoreInitialTrackTime } from './spine-track-recovery';
import { canvasVisualSettingsChanged, configureCanvasTrack, settleCanvasReducedMotion, type CanvasTrackRun } from './canvas-playback-command';
import { renderDiagnosticsEnabled } from './render-diagnostics';
import { applyReelCurtainEntrance } from './reel-curtain-entrance';
import { SpineSideFishSchool } from './spine-side-fish-v38';
import { positionSpineOverlay } from './position-spine-overlay';
import { loadFishRouteData } from './fish-route-data';

const BASE = assetUrl('alchemist/effects');
const datasets = new Map<string, Promise<SkeletonData>>();
const atlases = new Map<string, Promise<TextureAtlas>>();
const SYMBOL_SCENES = new Set(['elixir', 'retort', 'crystal', 'flask', 'atom', 'mercury', 'sulfur', 'copper', 'iron', 'lead', 'scatter', 'wild-blue', 'wild-red', 'wild-gold', 'wild-green']);
type PortraitBone = { dx?: number; dy?: number; scale?: number };
type ResponsiveRig = { height?: number; bones: Record<string, PortraitBone>; slots: Record<string, [string, string]> };
const responsiveRigs = new Map<string, ResponsiveRig>();
type ReelLayout = SailClothLayout & { mode: 'reel'; width: number; anchors: Record<string, { fractionY?: number; tileIndex?: number; tileHeight?: number }> };
const reelLayouts = new Map<string, ReelLayout>();

async function checkedFetch(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spine asset ${url}: ${response.status}`);
  return response;
}
function loadAtlas(base: string, name: string, revision = '') {
  const path = `${base}/${name}`;
  const suffix = revision ? `?v=${revision}` : '';
  const key = `${path}${suffix}`;
  let result = atlases.get(key);
  if (!result) {
    result = checkedFetch(`${path}.atlas${suffix}`).then(r => r.text()).then(async text => {
      const atlas = new TextureAtlas(text);
      await Promise.all(atlas.pages.map(async page => {
        page.setTexture(new CanvasTexture(await decodedImage(`${base}/${page.name}${suffix}`)));
      }));
      return atlas;
    }).catch(error => { atlases.delete(key); throw error; });
    atlases.set(key, result);
  }
  return result;
}
function loadSkeleton(id: string) {
  let result = datasets.get(id);
  if (!result) {
    const isReelEffect = id.startsWith('reel-');
    const isEnvironment = id === 'environment';
    const isEffect = id === 'ambient' || id.startsWith('curtain') || id.startsWith('bigwin') || isReelEffect;
      const base = isEnvironment ? assetUrl('alchemist/environment') : isEffect ? BASE : assetUrl('alchemist/symbols');
    const atlasName = isEnvironment ? ENVIRONMENT_ATLAS_FILE.replace(/\.atlas$/, '') : isReelEffect ? (id === 'reel-frame' ? 'reel-vfx-v36' : 'hatches-v2') : id === 'bigwin-v2' ? 'bigwin-v33' : id === 'curtain-v2' ? 'curtain-v2' : id === 'bigwin' ? 'bigwin-modular' : isEffect ? 'raster-vfx' : 'symbols';
    const originalName = isEnvironment ? 'laboratory-motion' : id;
    const jsonName = isEnvironment ? ENVIRONMENT_SKELETON_FILE.replace(/\.json$/, '') : id === 'bigwin-v2' || /^reel-(blue|red|gold|green)$/.test(id) ? `${originalName}-compact-v27` : originalName;
    const revision = id === 'reel-frame' ? 'frame36-cartoon' : isReelEffect ? 'curtains41-depth' : id === 'bigwin-v2' ? 'cartoon-treasure33' : !isEffect && !isEnvironment ? SYMBOL_ART_REVISION : isEnvironment ? 'marine36' : '';
    result = Promise.all([
      loadAtlas(base, atlasName, revision), checkedFetch(`${base}/${jsonName}.json${revision ? `?v=${revision}` : ''}`).then(r => r.json()),
    ]).then(([atlas, json]) => {
      if (json.portraitLayout) responsiveRigs.set(id, json.portraitLayout as ResponsiveRig);
      if (json.adaptiveLayout?.mode === 'reel') reelLayouts.set(id, json.adaptiveLayout as ReelLayout);
      return prepareAssetWork(() => new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json));
    })
      .catch(error => { datasets.delete(id); throw error; });
    datasets.set(id, result);
  }
  return result;
}

/** Shared atlas and immutable SkeletonData; each mounted instance owns only its pose. */
export async function preloadAlchemistEffects(onProgress?: (done: number, total: number) => void, ids = ['elixir', 'retort', 'crystal', 'flask', 'atom', 'mercury', 'sulfur', 'copper', 'iron', 'lead', 'wild-blue', 'wild-red', 'wild-gold', 'wild-green', 'scatter', 'ambient', 'curtain-v2', 'reel-frame']) {
  // GPU scenes have their own prepared SkeletonData. Do not parse their large
  // animations into a second Canvas data graph unless the GPU path fails.
  let done = 0;
  onProgress?.(done, ids.length);
  await Promise.all(ids.map(async id => { await loadSkeleton(id); onProgress?.(++done, ids.length); }));
}

const animationLoop = new AnimationFrameLoop({
  request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle), hidden: () => document.hidden,
  subscribeVisibility: callback => { document.addEventListener('visibilitychange', callback); return () => document.removeEventListener('visibilitychange', callback); },
});
let phaseIndex = 0;

type CanvasOptions = {
  id: string;
  animation: string;
  nextAnimation?: string | readonly string[];
  animationKey?: string | number;
  animated?: boolean;
  active?: boolean;
  loop?: boolean;
  width?: number;
  height?: number;
  stretch?: boolean;
  fit?: 'contain' | 'cover';
  onComplete?: () => void;
  onEvent?: (name: string) => void;
  overlayBone?: string;
  timeScale?: number;
  initialTrackTime?: number;
  environmentBonus?: boolean;
  environmentReduced?: boolean;
  environmentVolume?: boolean;
};

type CanvasRenderer = SkeletonRenderer | ClippedCanvasSkeletonRenderer | SeamlessCanvasSkeletonRenderer | FastRegionCanvasRenderer;

/** Real Spine 4.2 pose evaluation and Canvas2D attachment rendering, without per-cell WebGL contexts. */
export function useAlchemistSpine({ id, animation, nextAnimation, animationKey, animated = true, active = true, loop = true, width = 288, height = 288, stretch = false, fit = 'contain', onComplete, onEvent, overlayBone, timeScale = 1, initialTrackTime, environmentBonus = false, environmentReduced = false, environmentVolume = false }: CanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<AnimationState | null>(null);
  const poseRef = useRef<{ id: string; canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; renderer: CanvasRenderer; skeleton: Skeleton; state: AnimationState; run: CanvasTrackRun } | null>(null);
  const initialTimeRestored = useRef(false);
  const environmentSchool = useRef<SpineSideFishSchool | null>(null);
  const completeRef = useRef(onComplete);
  const eventRef = useRef(onEvent);
  const playbackSettings = useRef({ active, animated, timeScale, environmentBonus, environmentReduced, environmentVolume });
  playbackSettings.current = { active, animated, timeScale, environmentBonus, environmentReduced, environmentVolume };
  const updatePlaybackRef = useRef<(() => void) | null>(null);
  const [loadedId, setLoadedId] = useState('');
  const [failedId, setFailedId] = useState('');
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => { eventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context || context.isContextLost?.()) {
      poseRef.current?.state.clearListeners(); poseRef.current = null; stateRef.current = null;
      setLoadedId(''); setFailedId(id); return;
    }
    let cancelled = false;
    let renderFailed = false;
    let stop: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    let updatePlayback: (() => void) | undefined;
    let visibilityChanged: (() => void) | undefined;
    let pendingPaint = false;
    const fail = (error: unknown) => {
      if (cancelled || renderFailed) return;
      renderFailed = true;
      stop?.(); stop = undefined; observer?.disconnect();
      // A lost/failed target must not retain a renderer for a later track.
      // Normal track cleanup keeps it; recovery builds a fresh pose/cache.
      if (poseRef.current?.context === context) {
        poseRef.current.state.clearListeners(); poseRef.current = null; stateRef.current = null;
      }
      if (updatePlaybackRef.current === updatePlayback) updatePlaybackRef.current = null;
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      setLoadedId(''); setFailedId(id);
      console.error(error);
    };
    const contextLost = () => { fail(new Error(`Spine canvas lost: ${id}`)); };
    canvas.addEventListener('contextlost', contextLost);
    let widthPx = 1, heightPx = 1, dpr = 1;
    let frameClipLeft = 0, frameClipRight = 0;
    let frameApertureWidth = 1, frameApertureHeight = 1;
    const resize = () => {
      // Layout dimensions exclude ancestor transforms. Reading the transformed bounds
      // during a reel's scaleY reveal would permanently stretch its backing bitmap.
      widthPx = Math.max(canvas.clientWidth, 1); heightPx = Math.max(canvas.clientHeight, 1);
      if (id === 'reel-frame') {
        // ReelFrame's host is pinned to the .reels aperture, while its canvas
        // overscans in both axes for the painted corner brackets and rings.
        frameApertureWidth = Math.max(1, canvas.parentElement?.clientWidth ?? widthPx);
        frameApertureHeight = Math.max(1, canvas.parentElement?.clientHeight ?? heightPx);
        const bounds = canvas.getBoundingClientRect();
        const toLocal = widthPx / Math.max(1, bounds.width);
        frameClipLeft = Math.max(0, -bounds.left) * toLocal;
        frameClipRight = Math.max(0, bounds.right - document.documentElement.clientWidth) * toLocal;
      }
      dpr = Math.min(window.devicePixelRatio || 1, id === 'ambient' || id === 'environment' ? 1.25 : 2);
      const nextWidth = Math.round(widthPx * dpr), nextHeight = Math.round(heightPx * dpr);
      if (canvas.width === nextWidth && canvas.height === nextHeight) return false;
      canvas.width = nextWidth; canvas.height = nextHeight;
      return true;
    };
    Promise.all([loadSkeleton(id), id === 'environment' ? loadFishRouteData() : Promise.resolve(null)]).then(([data, fishRoutes]) => {
      if (cancelled || renderFailed) return;
      if (fishRoutes && !environmentSchool.current) environmentSchool.current = new SpineSideFishSchool(fishRoutes.routes, fishRoutes.maskPolygons, fishRoutes.navigationBoundaries);
      // Retain the living pose across reveal → idle → win; Spine mixes from the current track.
      const retained = poseRef.current;
      // Data identity matters during Fast Refresh as well as a URL/rig change:
      // an unchanged id must never reuse an old atlas or attachment graph.
      const previous = retained?.id === id && retained.canvas === canvas && retained.context === context
        && retained.skeleton.data === data ? retained : null;
      const skeleton = previous?.skeleton ?? new Skeleton(data);
      const state = previous?.state ?? new AnimationState(new AnimationStateData(data));
      if (!previous) state.data.defaultMix = .16;
      // The drapery's reveal already meets idle at the same pose and velocity.
      // A second crossfade would slow its pinned fabric at the handoff.
      if (id.startsWith('reel-') && id !== 'reel-frame') state.data.setMix('reveal', 'idle', 0);
      const requestedSpeed = playbackSettings.current.timeScale;
      state.timeScale = Number.isFinite(requestedSpeed) ? Math.max(.01, requestedSpeed) : 1;
      state.clearListeners();
      stateRef.current = state;
      const preciseSymbol = ['elixir', 'crystal', 'atom'].includes(id);
      const symbolScene = SYMBOL_SCENES.has(id);
      // Retain atlas sampling plans and mesh intermediates through land → idle
      // → win, just as the live pose is retained. Track changes need no new
      // offscreen canvas or renderer caches; a different asset/context does.
      const renderer = previous?.renderer ?? (id === 'environment' ? new ClippedCanvasSkeletonRenderer(context) : id === 'bigwin-v2' || preciseSymbol || (id.startsWith('reel-') && id !== 'reel-frame') ? new SeamlessCanvasSkeletonRenderer(context, undefined, preciseSymbol) : canUseFastRegionRenderer(id, skeleton) ? new FastRegionCanvasRenderer(context) : new SkeletonRenderer(context));
      if (renderer instanceof SkeletonRenderer) renderer.triangleRendering = skeleton.slots.some(slot => slot.getAttachment() instanceof MeshAttachment);
      const run = configureCanvasTrack(state, { animation, animationKey, loop, nextAnimation }, previous?.run);
      const keepTrack = run === previous?.run;
      const entry = run.entry;
      poseRef.current = { id, canvas, context, renderer, skeleton, state, run };
      if (!initialTimeRestored.current) {
        restoreInitialTrackTime(entry, initialTrackTime);
        initialTimeRestored.current = true;
      }
      canvas.dataset.spineAnimation = state.getCurrent(0)?.animation?.name ?? animation;
      // Different idle phases keep the living laboratory from moving in unison.
      if (!keepTrack && initialTrackTime === undefined && loop && width === 288 && animation === 'idle') entry.trackTime = (++phaseIndex * .397) % 2.8;
      state.addListener({ start: started => { canvas.dataset.spineAnimation = started.animation?.name ?? animation; },
      event: (_track, event) => { const settings = playbackSettings.current; if (settings.active && settings.animated && !document.hidden) eventRef.current?.(event.data.name); },
      complete: finished => {
        if (playbackSettings.current.active && !document.hidden && !loop && finished === entry && !run.completed) { run.completed = true; completeRef.current?.(); }
      } });
      resize();
      const overlayPose = overlayBone ? skeleton.findBone(overlayBone) : null;
      const responsiveRig = responsiveRigs.get(id);
      const responsiveAttachments = responsiveRig ? Object.entries(responsiveRig.slots) : [];
      const reelLayout = reelLayouts.get(id);
      const reelAnchorBones = reelLayout ? Object.keys(reelLayout.anchors).map(name => skeleton.findBone(name)).filter(bone => bone !== null) : [];
      const responsiveBones = responsiveRig ? Object.keys(responsiveRig.bones).map(name => skeleton.findBone(name)).filter(bone => bone !== null) : [];
      const trophyBones = id === 'bigwin'
        ? ['trophy-mask', 'trophy-left', 'trophy-right'].map(name => skeleton.findBone(name)).filter(bone => bone !== null)
        : [];
      const trophyVials = trophyBones.slice(1);
      let elapsed = 0;
      let hasPainted = false;
      let appliedPlayback: typeof playbackSettings.current | undefined;
      const measureAnimation = renderDiagnosticsEnabled(import.meta.env.DEV);
      let measuredFrames = 0, renderTotalMs = 0, intervalTotalMs = 0, intervalFrames = 0, previousDrawAt = 0;
      const draw = (delta: number) => {
        if (cancelled || renderFailed) return;
        const settings = playbackSettings.current;
        const shouldAnimate = settings.active && settings.animated && !document.hidden;
        const measuredStart = measureAnimation && delta > 0 ? performance.now() : 0;
        if (context.isContextLost?.()) throw new Error(`Spine canvas lost: ${id}`);
        // Ambient is deliberately 30fps; symbols and celebratory effects remain fluid.
        elapsed += delta;
        if ((id === 'ambient' || id === 'environment') && delta > 0 && elapsed < 1 / 30) return;
        // A resize or resumed first paint must not advance leftover throttled time.
        const environmentDelta = shouldAnimate && delta > 0 ? elapsed : 0;
        if (shouldAnimate) state.update(environmentDelta);
        elapsed = 0;
        // Portrait layout is applied after animation. Restore setup transforms first:
        // burst has no trophy translation timelines, and paused resize redraws must be idempotent.
        for (const bone of responsiveRig ? responsiveBones : trophyBones) bone.setToSetupPose();
        for (const bone of reelAnchorBones) bone.setToSetupPose();
        state.apply(skeleton);
        if (id === 'environment') environmentSchool.current?.apply(skeleton, environmentDelta, settings.environmentBonus, settings.environmentReduced, settings.environmentVolume);
        if (reelLayout) {
          const currentTrack = state.getCurrent(0);
          applyReelCurtainEntrance(canvas.parentElement, currentTrack?.animation?.name, currentTrack?.trackTime ?? 0, settings.animated);
        }
        const portraitFrame = id.startsWith('bigwin') && widthPx / heightPx < .72;
        if (reelLayout) {
          const worldHeight = heightPx / widthPx * reelLayout.width;
          for (const bone of reelAnchorBones) {
            const anchor = reelLayout.anchors[bone.data.name];
            if (anchor.tileIndex !== undefined) bone.y = -worldHeight / 2 + (anchor.tileIndex + .5) * (anchor.tileHeight ?? 320);
            else bone.y += (worldHeight - reelLayout.baseHeight) * (anchor.fractionY ?? 0);
          }
          applySailClothLayout(skeleton, worldHeight, reelLayout);
        }
        if (responsiveRig) {
          for (const [slot, attachments] of responsiveAttachments) skeleton.setAttachment(slot, attachments[portraitFrame ? 1 : 0]);
          if (portraitFrame) for (const bone of responsiveBones) {
            const placement = responsiveRig.bones[bone.data.name];
            bone.x += placement.dx ?? 0; bone.y += placement.dy ?? 0;
            bone.scaleX *= placement.scale ?? 1; bone.scaleY *= placement.scale ?? 1;
          }
        } else if (id === 'bigwin') {
          skeleton.setAttachment('winframe', portraitFrame ? 'winframe-portrait' : 'winframe');
          if (portraitFrame) {
            const mask = trophyBones[0];
            if (mask) { mask.y += 890; mask.scaleX *= 1.65; mask.scaleY *= 1.65; }
            for (const [i, vial] of trophyVials.entries()) {
              vial.x = i === 0 ? -455 : 455; vial.y -= 840;
              vial.scaleX *= 1.3; vial.scaleY *= 1.3;
            }
          }
        }
        if (id === 'reel-frame') {
          // Measure the actual field, never infer it from a fixed -12px inset.
          // The former approach shrank the rails away from small/mobile fields.
          const frameWidth = frameApertureWidth, frameHeight = frameApertureHeight;
          const railScale = frameWidth / 720;
          const seamOverlap = Math.max(.8, Math.min(1.5, railScale * 1.5));
          const railThickness = 27.058823529411764 * railScale;
          // Gold brackets reuse the existing raster, at a scale whose solid leg
          // is the same thickness as the rail. The gem keeps its round shape.
          const ornamentScale = railThickness / (69 * 43 / 128);
          const cornerInset = (69 / 2 - 69 * 43 / 128) * ornamentScale;
          const halfW = frameWidth / 2 + railThickness / 2 - seamOverlap;
          const halfH = frameHeight / 2 + railThickness / 2 - seamOverlap;
          for (const side of ['top', 'bottom', 'left', 'right']) {
            const horizontal = side === 'top' || side === 'bottom';
            const count = horizontal ? 6 : 5;
            const length = horizontal ? frameWidth : frameHeight;
            const span = length / count;
            for (let i = 0; i < count; i++) {
              const bone = skeleton.findBone(`rail-${side}-${i}`)!;
              const position = -length / 2 + span * (i + .5);
              bone.x = horizontal ? position : (side === 'left' ? -halfW : halfW);
              bone.y = horizontal ? (side === 'top' ? halfH : -halfH) : position;
              bone.scaleX = (span + 1.5 * railScale) / 120;
              // Each cartoon rail and its round rivets keep their native aspect.
              bone.scaleY = bone.scaleX;
            }
          }
          for (const side of ['tl', 'tr', 'bl', 'br']) {
            const bone = skeleton.findBone(`corner-${side}`)!;
            bone.x = (side.endsWith('l') ? -1 : 1) * (frameWidth / 2 - cornerInset - seamOverlap);
            bone.y = (side.startsWith('t') ? 1 : -1) * (frameHeight / 2 - cornerInset - seamOverlap);
            bone.scaleX = bone.scaleY = ornamentScale;
          }
          for (const side of ['left', 'right']) {
            const bone = skeleton.findBone(`tank-${side}`)!;
            // Rings belong to the same physical frame as its corner ornaments.
            // A fixed .65 floor made them oversized on mini-player viewports.
            const ringScale = ornamentScale;
            const radius = 18 * ringScale + 2;
            // At the portrait screen edge, overscan alone cannot prevent viewport clipping.
            const minX = -widthPx / 2 + frameClipLeft + radius;
            const maxX = widthPx / 2 - frameClipRight - radius;
            bone.x = Math.max(minX, Math.min(maxX, (side === 'left' ? -1 : 1) * halfW));
            bone.scaleX = bone.scaleY = ringScale;
          }
        }
        skeleton.updateWorldTransform(Physics.update);
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        const sx = id === 'reel-frame' ? 1 : widthPx / width, sy = id === 'reel-frame' ? 1 : heightPx / (portraitFrame ? (responsiveRig?.height ?? 3240) : height);
        const uniformScale = reelLayout ? widthPx / reelLayout.width : fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
        const scaleX = reelLayout ? uniformScale : stretch ? sx : uniformScale;
        const scaleY = reelLayout ? uniformScale : stretch ? sy : uniformScale;
        context.setTransform(dpr * scaleX, 0, 0, -dpr * scaleY, canvas.width / 2, canvas.height / 2);
        renderer.draw(skeleton);
        hasPainted = true;
        // Accessible live text follows an actual Spine bone; it is not a separate CSS animation.
        if (overlayPose && overlayRef.current) {
          positionSpineOverlay(overlayRef.current, widthPx / 2 + overlayPose.worldX * scaleX, heightPx / 2 - overlayPose.worldY * scaleY, overlayPose.a, overlayPose.d);
        }
        if (measuredStart) {
          renderTotalMs += performance.now() - measuredStart;
          if (previousDrawAt) { intervalTotalMs += measuredStart - previousDrawAt; intervalFrames++; }
          previousDrawAt = measuredStart;
          if (++measuredFrames === 60) {
            canvas.dataset.renderMs = (renderTotalMs / measuredFrames).toFixed(2);
            canvas.dataset.frameIntervalMs = (intervalTotalMs / Math.max(1, intervalFrames)).toFixed(2);
            canvas.dataset.renderSamples = String(measuredFrames);
            canvas.dataset.renderMetric = 'CPU update and Canvas submission';
            measuredFrames = 0; renderTotalMs = 0; intervalTotalMs = 0; intervalFrames = 0;
          }
        }
      };
      updatePlayback = () => {
        if (cancelled || renderFailed) return;
        try {
          const settings = playbackSettings.current;
          const moving = settings.active && settings.animated;
          const visualSettingsChanged = canvasVisualSettingsChanged(appliedPlayback, settings, symbolScene);
          const settles = settings.active && !settings.animated && !loop && !run.completed;
          state.timeScale = Number.isFinite(settings.timeScale) ? Math.max(.01, settings.timeScale) : 1;
          // Pause is a transport command. Keep the same pose, queue, listeners,
          // renderer and completion guard; only the shared RAF membership changes.
          elapsed = 0; previousDrawAt = 0;
          if (!moving && stop) { stop(); stop = undefined; }
          if (document.hidden) pendingPaint ||= !hasPainted || visualSettingsChanged || settles;
          else {
            settleCanvasReducedMotion(state, run, settings.active, settings.animated, loop);
            // A pure pause/speed change or a symbol's covered motion toggle
            // already has a correct canvas. First paint, actual visual changes,
            // resize and reduced-motion one-shot settlement still redraw.
            if (!hasPainted || pendingPaint || visualSettingsChanged || settles) draw(0);
            pendingPaint = false;
          }
          appliedPlayback = settings;
          if (moving && !stop) stop = animationLoop.subscribe(draw, fail);
        } catch (error) { fail(error); }
      };
      updatePlaybackRef.current = updatePlayback;
      updatePlayback();
      if (renderFailed) return;
      setFailedId(''); setLoadedId(id);
      visibilityChanged = () => {
        // The shared loop resumes moving scenes. Held/reduced scenes only need
        // a paint if a real setting/resize changed while the document was hidden.
        if (!document.hidden && pendingPaint) updatePlayback?.();
      };
      document.addEventListener('visibilitychange', visibilityChanged);
      // ResizeObserver fires once on observation even when dimensions did not change.
      // Assigning canvas.width in that callback cleared the finished reveal for one frame.
      observer = new ResizeObserver(() => { try { if (resize()) { if (document.hidden) pendingPaint = true; else draw(0); } } catch (error) { fail(error); } }); observer.observe(canvas);
    }).catch(fail);
    return () => {
      cancelled = true; stop?.(); observer?.disconnect(); stateRef.current = null;
      if (updatePlaybackRef.current === updatePlayback) updatePlaybackRef.current = null;
      if (visibilityChanged) document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('contextlost', contextLost);
      // Keep the last fully rendered frame while a new track is configured.
      // The next draw clears and replaces it atomically; unmount removes the canvas.
    };
  }, [id, animation, nextAnimation, animationKey, loop, width, height, stretch, fit, overlayBone, initialTrackTime]);
  useEffect(() => {
    updatePlaybackRef.current?.();
  }, [active, animated, timeScale, environmentBonus, environmentReduced, environmentVolume]);
  return { canvasRef, overlayRef, ready: loadedId === id, failed: failedId === id };
}

