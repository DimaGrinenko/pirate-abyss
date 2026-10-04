import type { RefObject } from 'react';
import { symbolLabel, wildLabel } from './locale';

export function ReelCurtainAward({ type, multiplier, overlayRef, selectionRef, selecting }: {
  type: 'blue' | 'red' | 'gold' | 'green'; multiplier: number;
  overlayRef: RefObject<HTMLDivElement | null>; selectionRef: RefObject<HTMLSpanElement | null>; selecting: boolean;
}) {
  const size = Math.min(31, 74 / ((String(multiplier).length + 1) * .62));
  return <div ref={overlayRef} className="alchemist-reel-curtain__award" aria-label={`${symbolLabel('wild')} · ${wildLabel(type)} ×${multiplier}`}>
    <small>WILD</small>
    <span ref={selectionRef} className="alchemist-reel-curtain__selection" data-selecting={selecting}>
      <strong style={{ fontSize: `clamp(4px, min(${size}cqw, ${size / 5}cqh), 48px)` }}>
        <span className="alchemist-reel-curtain__result">×{multiplier}</span>
        <span className="alchemist-reel-curtain__pending" aria-hidden="true">×?</span>
      </strong>
    </span>
  </div>;
}
