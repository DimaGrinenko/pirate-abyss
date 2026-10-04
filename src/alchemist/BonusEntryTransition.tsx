import { useEffect, useRef, useState } from 'react';
import { AnimationState, AnimationStateData, AtlasAttachmentLoader, CanvasTexture, Physics, Skeleton, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-canvas';
import type { SkeletonData } from '@esotericsoftware/spine-canvas';
import type { BonusMode } from './engine';
import { assetUrl } from './assets';
import { SeamlessCanvasSkeletonRenderer } from './SeamlessCanvasSkeletonRenderer';
import { afterVisiblePaint } from './visible-paint';
import { decodedImage, prepareAssetWork } from './asset-readiness';
import { OptionalScenePreparation } from './optional-scene-preparation';
import './bonus-entry-transition.css';

export const BONUS_ENTRY_DURATION_MS = 3100;
export const BONUS_ENTRY_COVERED_AT_MS = 1550;
export type BonusEntryPhase = 'anticipation' | 'conjure' | 'reveal';
export type BonusEntryOrigin = { x: number; y: number; width: number; height: number };
export type BonusEntryTransitionProps = {
  /** Normalized bounds of the captain's lantern. */
  origin?: BonusEntryOrigin;
  mode?: BonusMode;
  reducedMotion?: boolean;
  animated?: boolean;
  paused?: boolean;
  /** Keep the covered frame until the incoming bonus has actually painted. */
  revealReady?: boolean;
  timeScale?: number;
  className?: string;
  onReady?: () => void;
  onPhase?: (phase: BonusEntryPhase) => void;
  onCovered?: () => void;
  onComplete?: () => void;
};
const BASE = assetUrl('alchemist/effects/');
const WORLD_WIDTH = 1600, WORLD_HEIGHT = 1000;
const mistPreparation = new OptionalScenePreparation(() => decodedImage(`${BASE}parts/sea-mist-v23.webp`));
const preloadMist = () => mistPreparation.load().catch(() => undefined);
const scenePreparation = new OptionalScenePreparation<SkeletonData>(async () => {
      const [jsonResponse, atlasResponse] = await Promise.all([
        fetch(`${BASE}bonus-entry-compact-v27.json?v=hinged11`, { signal: AbortSignal.timeout(15000) }),
        fetch(`${BASE}bonus-entry.atlas?v=hinged11`, { signal: AbortSignal.timeout(15000) }),
      ]);
      if (!jsonResponse.ok || !atlasResponse.ok) throw new Error('Bonus-entry assets could not be loaded');
      const atlas = new TextureAtlas(await atlasResponse.text());
      await Promise.all(atlas.pages.map(page => new Promise<void>((resolve, reject) => {
        const image = new Image();
        const timeout = window.setTimeout(() => reject(new Error('Bonus-entry texture timed out')), 15000);
        image.onload = () => { void image.decode().catch(() => undefined).then(() => { window.clearTimeout(timeout); page.setTexture(new CanvasTexture(image)); resolve(); }); };
        image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Bonus-entry texture could not be loaded')); };
        image.src = `${BASE}${page.name}?v=hinged11`;
      })));
      const json = await jsonResponse.json();
      return prepareAssetWork(() => new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json));
});
function loadBonusEntry(): Promise<SkeletonData> { return scenePreparation.load(); }
// A network failure must not prevent startup: the transition also has a
// guaranteed opaque fallback and still completes the same lifecycle callbacks.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadBonusEntry(): Promise<void> { await Promise.all([loadBonusEntry().catch(() => undefined), preloadMist()]); }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function veilFade(time: number) {
  const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  if (time < .5) return 0;
  if (time < 1.55) return smooth((time - .5) / 1.05);
  if (time < 1.85) return 1;
  return smooth((3.1 - time) / 1.25);
}

/** The clock starts only after assets or the safe fallback have rendered.
 * Lifecycle callbacks follow actual visible animation time, including tab pause.
 */
export function BonusEntryTransition({ origin, mode, reducedMotion = false, animated = true, paused = false, revealReady = true, timeScale = 1, className = '', onReady, onPhase, onCovered, onComplete }: BonusEntryTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mistRef = useRef<HTMLDivElement>(null);
  const current = useRef({ origin, reducedMotion, animated, paused, revealReady, timeScale, onReady, onPhase, onCovered, onComplete });
  current.current = { origin, reducedMotion, animated, paused, revealReady, timeScale, onReady, onPhase, onCovered, onComplete };
  const refreshPlayback = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas) return;
    let disposed = false, frame = 0, previous = 0, elapsed = 0, lastDrawTime = -1;
    let readyAnnounced = false, cancelReadyPaint: (() => void) | undefined;
    let covered = false, complete = false, width = 1, height = 1, resolution = 1;
    let skeleton: Skeleton | undefined, animation: AnimationState | undefined, renderer: SeamlessCanvasSkeletonRenderer | undefined;
    let fallback = !context;
    const notified = new Set<BonusEntryPhase>();
    const resize = () => {
      width = Math.max(canvas.clientWidth, 1); height = Math.max(canvas.clientHeight, 1);
      resolution = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * resolution); canvas.height = Math.round(height * resolution);
      lastDrawTime = -1;
    };
    const draw = (time: number) => {
      const reduced = current.current.reducedMotion || fallback;
      if (mistRef.current) {
        const rise = clamp(time / 1.05, 0, 1), fall = clamp((3.1 - time) / 1.25, 0, 1);
        const density = Math.sin(rise * Math.PI / 2) * (fall * fall * (3 - 2 * fall));
        mistRef.current.style.opacity = String(reduced ? 0 : density);
        mistRef.current.style.setProperty('--mist-travel', `${time / 3.1}`);
      }
      canvas.style.opacity = String(reduced && current.current.animated ? veilFade(time) : 1);
      if (!context || fallback) {
        // The element itself remains a guaranteed opaque magical backing
        // even if this device cannot allocate a Canvas2D rendering context.
        canvas.style.backgroundColor = '#0a5967';
        return;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!skeleton || !animation || !renderer) {
        // Plain teal UI backing is used only if raster loading fails.
        context.fillStyle = '#0a5967'; context.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      skeleton.setToSetupPose();
      const track = animation.getCurrent(0);
      if (track) track.trackTime = reduced ? 1.7 : time;
      animation.apply(skeleton);
      // The guardian owns the only chest reveal. Keep the transition to
      // light, mist and treasure, instead of a second floating chest prop.
      for (const slot of skeleton.slots) if (slot.data.name.startsWith('apparition-') || slot.data.name.startsWith('navigator-')) slot.color.a = 0;
      const scale = Math.max(width / WORLD_WIDTH, height / WORLD_HEIGHT);
      const impact = skeleton.findBone('impact-root');
      const bounds = current.current.origin ?? { x: .5, y: .65, width: 0, height: 0 };
      if (impact) {
        const u = clamp((time - .35) / .9, 0, 1);
        const sourceWeight = 1 - u * u * (3 - 2 * u);
        impact.x += sourceWeight * (bounds.x + bounds.width / 2 - .5) * width / scale;
        impact.y += sourceWeight * (.5 - bounds.y - bounds.height / 2) * height / scale;
      }
      skeleton.updateWorldTransform(Physics.update);
      context.setTransform(resolution * scale, 0, 0, -resolution * scale, canvas.width / 2, canvas.height / 2);
      renderer.draw(skeleton);
    };
    const safeDraw = (time: number) => {
      try { draw(time); }
      catch (error: unknown) {
        fallback = true;
        canvas.style.backgroundColor = '#0a5967';
        canvas.style.opacity = String(current.current.animated ? veilFade(time) : 1);
        console.warn('Pirate bonus entrance recovered from a renderer failure.', error);
      }
    };
    const phase = (name: BonusEntryPhase) => {
      if (notified.has(name)) return;
      notified.add(name); setStatus(name); current.current.onPhase?.(name);
    };
    const tick = (now: number) => {
      frame = 0;
      if (disposed || document.hidden) { previous = 0; return; }
      const delta = previous ? Math.max(0, Math.min((now - previous) / 1000, .05)) : 0;
      previous = now;
      if (!document.hidden) {
        if (current.current.animated && !current.current.paused && !complete && !(covered && !current.current.revealReady)) {
          const next = Math.min(3.1, elapsed + delta * Math.max(0, current.current.timeScale));
          // Always paint the actual coverage frame before mounting/releasing
          // the incoming episode. A large delta cannot jump past this gate.
          elapsed = !covered ? Math.min(BONUS_ENTRY_COVERED_AT_MS / 1000, next) : next;
        }
        const time = current.current.animated ? elapsed : 1.15;
        if (time !== lastDrawTime) { safeDraw(time); lastDrawTime = time; }
        if (current.current.animated) {
          const reduced = current.current.reducedMotion || fallback;
          if (!reduced && elapsed >= .08) phase('anticipation');
          if (elapsed >= .5) phase('conjure');
          if (!covered && elapsed >= BONUS_ENTRY_COVERED_AT_MS / 1000) { covered = true; setStatus('covered'); current.current.onCovered?.(); }
          if (elapsed >= 1.85) phase('reveal');
          if (!complete && elapsed >= BONUS_ENTRY_DURATION_MS / 1000) { complete = true; setStatus('complete'); current.current.onComplete?.(); }
        }
      }
      if (!disposed && !complete && current.current.animated && !current.current.paused && !(covered && !current.current.revealReady)) frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0; lastDrawTime = -1;
      if (!disposed && readyAnnounced && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(() => { resize(); safeDraw(current.current.animated ? elapsed : 1.15); });
    const contextLost = (event: Event) => {
      event.preventDefault(); fallback = true; lastDrawTime = -1;
      safeDraw(current.current.animated ? elapsed : 1.15);
    };
    canvas.addEventListener('contextlost', contextLost);
    const mount = async () => {
      try {
        if (!context) throw new Error('Canvas2D is unavailable; use the DOM magical backing.');
        const [data] = await Promise.all([loadBonusEntry(), preloadMist()]);
        if (disposed) return;
        skeleton = new Skeleton(data); animation = new AnimationState(new AnimationStateData(data));
        animation.setAnimation(0, 'transition', false); renderer = new SeamlessCanvasSkeletonRenderer(context);
      } catch (error: unknown) {
        if (disposed) return;
        fallback = true; console.warn('Pirate bonus entrance uses the veil fallback.', error);
      }
      if (disposed) return;
      resize(); safeDraw(current.current.animated ? 0 : 1.15); observer.observe(canvas);
      refreshPlayback.current = refresh;
      document.addEventListener('visibilitychange', refresh);
      cancelReadyPaint = afterVisiblePaint(() => {
        if (disposed) return;
        readyAnnounced = true;
        setStatus(fallback ? 'fallback-ready' : 'ready'); current.current.onReady?.();
        refresh();
      });
    };
    void mount();
    return () => { disposed = true; refreshPlayback.current = null; cancelReadyPaint?.(); cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', refresh); canvas.removeEventListener('contextlost', contextLost); };
  }, []);
  useEffect(() => { refreshPlayback.current?.(); }, [animated, paused, revealReady, timeScale, reducedMotion, origin]);
  return <div className={`transition-layer bonus-entry-transition ${className}`} aria-hidden="true" data-bonus-entry={status} data-bonus-mode={mode}>
    <canvas ref={canvasRef} />
    <div ref={mistRef} className="bonus-entry-mist"><img src={assetUrl('alchemist/effects/parts/sea-mist-v23.webp')} alt="" /><img src={assetUrl('alchemist/effects/parts/sea-mist-v23.webp')} alt="" /><img src={assetUrl('alchemist/effects/parts/sea-mist-v23.webp')} alt="" /></div>
  </div>;
}
