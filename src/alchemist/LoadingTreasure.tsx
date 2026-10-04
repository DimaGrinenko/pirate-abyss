import { useEffect, useState, type CSSProperties } from 'react';
import { assetUrl } from './assets';
import './loading-treasure.css';

const atlas = assetUrl('alchemist/ui/loading-treasure-v26.webp');
/** The lid pivots around its painted hinge; the lower box remains stationary.
 * Only one small image request is needed, even before the main assets load. */
export function LoadingTreasure({ reducedMotion = false, failed = false }: { reducedMotion?: boolean; failed?: boolean }) {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className="loading-treasure" aria-hidden="true" data-paused={!visible || failed || reducedMotion || !ready}
    data-static={reducedMotion} style={{ '--loading-atlas': `url("${atlas}")` } as CSSProperties}>
    <img className="loading-treasure__asset" src={atlas} alt="" fetchPriority="high" decoding="async" onLoad={() => setReady(true)} />
    <div className="loading-treasure__stage">
      <i className="loading-treasure__chest loading-treasure__lid" />
      <i className="loading-treasure__chest loading-treasure__body" />
      <i className="loading-treasure__coin loading-treasure__coin--one" />
      <i className="loading-treasure__coin loading-treasure__coin--two" />
      <i className="loading-treasure__glint loading-treasure__glint--one" />
      <i className="loading-treasure__glint loading-treasure__glint--two" />
    </div>
  </div>;
}
