import type { CSSProperties } from 'react';
import { symbolImageUrl } from './symbol-assets';
import { getCompassCopy } from './compass-copy';
import './compass-mode-v34.css';

export function CompassMarker({ target, reducedMotion }: { target: 1 | 2 | 3 | 4; reducedMotion: boolean }) {
  const copy = getCompassCopy();
  return <div className="compass-rail-track" data-testid="compass-target" data-target-reel={target + 1}
    data-reduced-motion={reducedMotion || undefined} aria-label={`${copy.target} ${target + 1}`} role="status">
    <div className="compass-rail-marker" style={{ '--course-target': target } as CSSProperties}>
      <img src={symbolImageUrl('retort')} alt="" draggable={false}/>
    </div>
  </div>;
}
