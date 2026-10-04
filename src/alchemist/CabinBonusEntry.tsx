import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BonusEntryTransitionProps } from './BonusEntryTransition';
import { assetUrl } from './assets';
import { decodedImage } from './asset-readiness';
import { afterVisiblePaint } from './visible-paint';
import { CabinBonusEntryTimeline, cabinEntryCloud, cabinEntryCover, cabinEntryGlint, cabinEntryParticle } from './cabin-bonus-entry-timeline';
import './cabin-bonus-entry-v37.css';

const SPARK = assetUrl('alchemist/ui/icons/spark.webp');
const BUBBLE = assetUrl('alchemist/effects/parts/bubble.png');
const MIST = assetUrl('alchemist/effects/parts/sea-mist-v23.webp');
// Prepare only the transition art. The restored award prepares its actor behind
// its own ready/covered gate; retired guardian scenes must not delay first load.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadCabinBonusEntry(): Promise<void> {
  await Promise.allSettled([
    ...[SPARK, BUBBLE, MIST].map(decodedImage),
  ]);
}

export function CabinBonusEntry({ origin, mode, reducedMotion = false, animated = true, paused = false,
  revealReady = true, timeScale = 1, className = '', onReady, onPhase, onCovered, onComplete }: BonusEntryTransitionProps) {
  const glint = useRef<HTMLImageElement>(null);
  const particles = useRef<HTMLDivElement>(null);
  const clouds = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  const current = useRef({ reducedMotion, animated, paused, revealReady, timeScale, onReady, onPhase, onCovered, onComplete });
  current.current = { reducedMotion, animated, paused, revealReady, timeScale, onReady, onPhase, onCovered, onComplete };
  const refreshPlayback = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    const timeline = new CabinBonusEntryTimeline();
    let disposed = false, frame = 0, ready = false;
    const sprites = Array.from(particles.current?.querySelectorAll('img') ?? []);
    const cloudSprites = Array.from(clouds.current?.querySelectorAll('img') ?? []);
    const draw = () => {
      const time = timeline.elapsedMs;
      const quiet = current.current.reducedMotion;
      const light = cabinEntryGlint(time);
      if (cover.current) cover.current.style.opacity = String(cabinEntryCover(time));
      if (glint.current) {
        glint.current.style.opacity = String(quiet ? 0 : light.opacity);
        glint.current.style.transform = `translate(-50%,-50%) scale(${light.scale}) rotate(${light.rotation}deg)`;
      }
      for (let index = 0; index < sprites.length; index++) {
        const sprite = sprites[index];
        const pose = cabinEntryParticle(time, index);
        sprite.style.opacity = String(quiet ? 0 : pose.opacity);
        sprite.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) scale(${pose.scale})`;
      }
      for (let index = 0; index < cloudSprites.length; index++) {
        const sprite = cloudSprites[index], pose = cabinEntryCloud(time, index);
        sprite.style.opacity = String(quiet ? pose.opacity * .3 : pose.opacity);
        sprite.style.transform = quiet ? 'none' : `translate3d(${pose.x}%,${pose.y}%,0) scale(${pose.scale})`;
      }
    };
    const playback = () => ({ ...current.current, hidden: document.hidden });
    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const cues = timeline.advance(now, playback());
      draw();
      for (const cue of cues) {
        if (disposed) return;
        setStatus(cue);
        if (cue === 'covered') current.current.onCovered?.();
        else if (cue === 'complete') current.current.onComplete?.();
        else current.current.onPhase?.(cue);
      }
      if (!disposed && timeline.needsFrames(playback())) frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      cancelAnimationFrame(frame); frame = 0; timeline.pause();
      if (disposed) return;
      draw();
      if (ready && timeline.needsFrames(playback())) frame = requestAnimationFrame(tick);
    };
    refreshPlayback.current = refresh;
    document.addEventListener('visibilitychange', refresh);
    draw();
    // Independent of paused/animated/revealReady: the mounted DOM can be ready
    // while animation is held, so it cannot deadlock its own reveal gate.
    const cancelReadyPaint = afterVisiblePaint(() => {
      if (disposed) return;
      ready = true; setStatus('ready'); current.current.onReady?.(); refresh();
    });
    return () => {
      disposed = true; refreshPlayback.current = null; cancelReadyPaint();
      cancelAnimationFrame(frame); timeline.pause(); document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => { refreshPlayback.current?.(); }, [paused, animated, revealReady, reducedMotion, timeScale]);
  const bounds = origin ?? { x: .27, y: .5, width: 0, height: 0 };
  const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : .5));
  return <div className={`transition-layer cabin-bonus-entry ${className}`} data-bonus-entry={status} data-bonus-mode={mode}
    data-reduced-motion={reducedMotion} aria-hidden="true" style={{ '--entry-origin-x': `${clamp01(bounds.x + bounds.width / 2) * 100}%`, '--entry-origin-y': `${clamp01(bounds.y + bounds.height / 2) * 100}%` } as CSSProperties}>
    <img ref={glint} className="cabin-bonus-entry__glint" src={SPARK} alt="" draggable={false} />
    <div className="cabin-bonus-entry__sea">
      <div ref={cover} className="cabin-bonus-entry__cover" />
      <div ref={clouds} className="cabin-bonus-entry__clouds">
        {Array.from({ length: 3 }, (_, index) => <img key={index} src={MIST} alt="" draggable={false} />)}
      </div>
    </div>
    <div ref={particles} className="cabin-bonus-entry__field">
      {Array.from({ length: 8 }, (_, index) => <img key={index} src={index % 3 === 0 ? SPARK : BUBBLE} alt="" draggable={false} />)}
    </div>
  </div>;
}
