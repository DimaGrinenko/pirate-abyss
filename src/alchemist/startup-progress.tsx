import { useEffect, useRef } from 'react';
import { t } from './locale';

/** Interpolate only towards completed work. No estimated advance or synthetic 100%. */
export function StartupProgress({ target, failed, errorMessage, reducedMotion = false }: { target: number; failed: boolean; errorMessage?: string; reducedMotion?: boolean }) {
  const meter = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const current = useRef({ target, failed, errorMessage, reducedMotion });
  const value = useRef(0);
  const tick = useRef<(() => void) | null>(null);
  current.current = { target, failed, errorMessage, reducedMotion };
  useEffect(() => {
    let frame = 0, previous = 0, disposed = false, percent = -1;
    const paint = (amount: number) => {
      if (fill.current) fill.current.style.transform = `scaleX(${amount / 100})`;
      const rounded = amount >= 100 ? 100 : Math.floor(amount);
      if (meter.current && percent !== rounded) meter.current.setAttribute('aria-valuenow', String(rounded));
      if (label.current) label.current.textContent = current.current.failed ? current.current.errorMessage || t('Не удалось загрузить ресурсы') : `${rounded}%`;
      percent = rounded;
    };
    const update = (now: number) => {
      frame = 0;
      if (disposed || document.hidden) { previous = 0; return; }
      const bound = Math.max(0, Math.min(100, Number.isFinite(current.current.target) ? current.current.target : 0));
      const elapsed = previous ? Math.min(48, now - previous) : 16.67;
      previous = now;
      if (current.current.reducedMotion) value.current = Math.max(value.current, bound);
      else if (bound > value.current) {
        const next = value.current + (bound - value.current) * (1 - Math.exp(-elapsed / 115));
        value.current = bound - next < .04 ? bound : Math.min(bound, next);
      }
      paint(value.current);
      if (!current.current.failed && bound > value.current) frame = requestAnimationFrame(update);
    };
    const resume = () => { if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(update); };
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; previous = 0; } else resume(); };
    tick.current = resume;
    document.addEventListener('visibilitychange', visibility);
    resume();
    return () => { disposed = true; cancelAnimationFrame(frame); tick.current = null; document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => { tick.current?.(); }, [target, failed, errorMessage, reducedMotion]);
  return <>
    <div ref={meter} className="entry-progress entry-progress--smooth" role="progressbar" aria-label={t('Загрузка ресурсов')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><i ref={fill} style={{ width: '100%', transform: 'scaleX(0)', transformOrigin: '0 50%', transition: 'none' }} /></div>
    <span ref={label}>0%</span>
  </>;
}
