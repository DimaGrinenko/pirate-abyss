import { useState } from 'react';
import type { CSSProperties } from 'react';
import { assetUrl } from './assets';
import { language } from './locale';
import type { WinTier } from './win-tiers';
import { WIN_TITLE_ATLAS } from './win-title-atlas-v17';
import './win-lettering-v17.css';

/** Original painted lettering stays intact; the real localized heading remains
 * available to assistive technology and if an image cannot be loaded. */
export function WinTitle({ text, tier }: { text: string; tier: WinTier }) {
  // Read the live locale binding: authentication can require English social copy.
  const atlas = WIN_TITLE_ATLAS[language];
  const region = atlas.regions[tier];
  const src = assetUrl(`alchemist/ui/win-lettering-${language}-v17.webp`);
  const [loadedSource, setLoadedSource] = useState('');
  const [failedSource, setFailedSource] = useState('');
  const ready = loadedSource === src && failedSource !== src;
  return <h2 id="celebration-title" className="win-celebration__title win-title--painted" aria-label={text}
    data-lettering-tier={tier} data-lettering-ready={ready}
    style={{ '--title-art-ratio': region.width / region.height } as CSSProperties}>
    <span className="win-title__crop" aria-hidden="true">
      <span className="win-title__fallback">{text}</span>
      {failedSource !== src && <img key={src} className="win-title__art" src={src} alt="" draggable={false}
        width={atlas.width} height={atlas.height} decoding="async"
        onLoad={() => setLoadedSource(src)} onError={() => setFailedSource(src)}
        style={{
          width: `${atlas.width / region.width * 100}%`,
          height: `${atlas.height / region.height * 100}%`,
          left: `${-region.x / region.width * 100}%`,
          top: `${-region.y / region.height * 100}%`,
        }} />}
    </span>
  </h2>;
}

function PayoutGlyphs({ value }: { value: string }) {
  return <>{Array.from(value).map((glyph, index, glyphs) => <span
    key={glyphs.length - index}
    className={`win-amount__glyph ${/\d/u.test(glyph) ? 'win-amount__digit' : /\s/u.test(glyph) ? 'win-amount__space' : 'win-amount__separator'}`}
    data-glyph={glyph}
    style={{ '--digit-delay': `${Math.min(glyphs.length - index - 1, 15) * 34}ms` } as CSSProperties}
  >{glyph}</span>)}</>;
}

/** A final-width measuring row prevents the count-up from pushing nearby art. */
export function WinAmount({ shown, final }: { shown: string; final: string }) {
  return <div className="win-celebration__amount" aria-hidden="true">
    <span className="win-amount__measure"><PayoutGlyphs value={final} /></span>
    <span className="win-amount__live" data-testid="celebration-payout"><PayoutGlyphs value={shown} /></span>
  </div>;
}
