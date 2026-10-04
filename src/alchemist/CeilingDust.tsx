import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetUrl } from './assets';
import { laboratoryAudio } from './audio';
import './ceiling-dust.css';

const dust = assetUrl('alchemist/environment/cabin-mote-v21.webp');
const puff = assetUrl('alchemist/effects/parts/sea-mist-v23.webp');
const grains = Array.from({ length: 20 }, (_, index) => ({
  x: index < 16 ? 31.5 + index * 2.65 : 92 + (index - 16) * 1.1,
  y: 1.4 + (index % 3) * .85, delay: index * 650 / 19,
  drift: (index % 2 ? -1 : 1) * (10 + index % 5 * 6),
  fall: 9 + index % 5 * 1.2, size: 2 + index % 3,
}));

/** A single short interior burst, driven by an actual shark contact event.
 * Source positions follow the cabin cover image, away from either porthole. */
export const CeilingDust = memo(function CeilingDust({ reducedMotion, obscured }: {
  reducedMotion: boolean; obscured: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), sequence = useRef(0);
  const [burst, setBurst] = useState<number | null>(null);
  useEffect(() => {
    let cancelSound: (() => void) | undefined;
    if (reducedMotion || obscured) setBurst(null);
    const impact = (event: Event) => {
      if (reducedMotion || obscured || document.hidden) return;
      const ownShell = host.current?.closest('.game-shell');
      const sourceShell = event.target instanceof Element ? event.target.closest('.game-shell') : null;
      if (!ownShell || ownShell !== sourceShell) return;
      if (ownShell.querySelector('.asset-gallery, .asset-gallery-fullscreen')) return;
      cancelSound?.();
      cancelSound = laboratoryAudio.sharkImpactCue();
      setBurst(++sequence.current);
    };
    const visibility = () => { if (document.hidden) { setBurst(null); cancelSound?.(); } };
    document.addEventListener('pirate-shark-impact', impact);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelSound?.();
      document.removeEventListener('pirate-shark-impact', impact);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reducedMotion, obscured]);
  useEffect(() => {
    if (burst === null) return;
    // Safety cleanup if animations are disabled while the event is running.
    const timer = window.setTimeout(() => setBurst(current => current === burst ? null : current), 2350);
    return () => window.clearTimeout(timer);
  }, [burst]);
  return <div ref={host} className="ceiling-dust" aria-hidden="true">
    {burst !== null && <div key={burst} className="ceiling-dust__burst">
      {[33, 46, 65, 93].map((left, index) => <img key={`puff:${index}`} src={puff} className="ceiling-dust__puff"
        alt="" draggable={false} style={{ left: `${left}%`, animationDelay: `${index * .06}s` }} />)}
      {grains.map((grain, index) => <img key={index} src={dust} alt="" draggable={false} className="ceiling-dust__grain"
        style={{ left: `${grain.x}%`, top: `${grain.y}%`, width: `${grain.size}px`, height: `${grain.size}px`,
          animationDelay: `${grain.delay}ms`, '--dust-drift': `${grain.drift}px`, '--dust-fall': `${grain.fall}cqh`,
        } as CSSProperties} onAnimationEnd={index === grains.length - 1
          ? () => setBurst(current => current === burst ? null : current) : undefined} />)}
    </div>}
  </div>;
});
