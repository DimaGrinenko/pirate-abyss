import { memo, useEffect, useRef, useState } from 'react';
import { assetUrl } from './assets';
import { TintedRasterImage } from './TintedRasterImage';
import './cabin-wall-relic.css';

const art = (name: string) => assetUrl(`alchemist/environment/${name}`);

/** A rigid object mounted in the original cabin painting's clear wall area.
 * Responsive measurements only hide it; the reel grid never moves for decor. */
export const CabinWallRelic = memo(function CabinWallRelic({ reducedMotion, obscured }: {
  reducedMotion: boolean; obscured: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), piece = useRef<HTMLDivElement>(null);
  const requestMeasure = useRef<(() => void) | null>(null);
  const obscuredRef = useRef(obscured); obscuredRef.current = obscured;
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const element = host.current, relic = piece.current, shell = element?.closest('.game-shell');
    if (!element || !relic || !shell) return;
    const board = shell.querySelector<HTMLElement>('.reel-frame');
    let pendingFrame = 0;
    const measure = () => {
      if (obscuredRef.current || document.hidden) return;
      if (window.innerHeight >= window.innerWidth) { element.dataset.fits = 'false'; return; }
      const r = relic.getBoundingClientRect(), field = board?.getBoundingClientRect();
      const gap = 14;
      const separated = !field || r.left >= field.right + gap || r.right <= field.left - gap || r.bottom <= field.top - gap || r.top >= field.bottom + gap;
      const fits = r.width >= 50 && r.height > 0 && r.left >= 8 && r.right <= window.innerWidth - 8 && r.top >= 6 && r.bottom <= window.innerHeight - 6 && separated;
      element.dataset.fits = String(fits);
    };
    const schedule = () => {
      if (pendingFrame || obscuredRef.current || document.hidden) return;
      pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; measure(); });
    };
    requestMeasure.current = schedule;
    const observer = new ResizeObserver(schedule);
    observer.observe(shell); observer.observe(relic);
    if (board) observer.observe(board);
    window.addEventListener('resize', schedule); schedule();
    return () => { requestMeasure.current = null; cancelAnimationFrame(pendingFrame); observer.disconnect(); window.removeEventListener('resize', schedule); };
  }, []);
  useEffect(() => { if (!obscured && visible) requestMeasure.current?.(); }, [obscured, visible]);
  return <div ref={host} className="cabin-wall-relic" aria-hidden="true" data-fits="false" data-paused={reducedMotion || obscured || !visible} data-reduced={reducedMotion}>
    <div className="cabin-wall-relic__registration">
      <TintedRasterImage className="cabin-wall-relic__cast cabin-wall-relic__cast--warm" tint="wall-warm-cast" alt="" draggable={false} />
      <img className="cabin-wall-relic__cast cabin-wall-relic__cast--sea" src={art('cabin-light-v21.webp')} alt="" draggable={false} />
      <div ref={piece} className="cabin-wall-relic__piece">
        <img className="cabin-wall-relic__plaque" src={art('wall-relic-v32.webp')} alt="" draggable={false} />
        <div className="cabin-wall-relic__paper-light"><TintedRasterImage tint="wall-paper-light" alt="" draggable={false} /></div>
        <span className="cabin-wall-relic__route cabin-wall-relic__route--wake"><img src={art('cabin-mote-v21.webp')} alt="" draggable={false} /></span>
        <span className="cabin-wall-relic__route"><img src={art('cabin-mote-v21.webp')} alt="" draggable={false} /></span>
        <img className="cabin-wall-relic__destination" src={art('cabin-light-v21.webp')} alt="" draggable={false} />
        <span className="cabin-wall-relic__needle-axle"><img src={art('wall-needle-v25.webp')} alt="" draggable={false} /></span>
        <img className="cabin-wall-relic__pivot" src={art('wall-pivot-v25.webp')} alt="" draggable={false} />
        <img className="cabin-wall-relic__glint cabin-wall-relic__glint--crest" src={art('cabin-mote-v21.webp')} alt="" draggable={false} />
        <img className="cabin-wall-relic__glint cabin-wall-relic__glint--dial" src={art('cabin-mote-v21.webp')} alt="" draggable={false} />
      </div>
    </div>
  </div>;
});
