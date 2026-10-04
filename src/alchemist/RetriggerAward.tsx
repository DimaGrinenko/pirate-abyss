import type { CSSProperties } from 'react';
import { assetUrl } from './assets';
import { decodedImage } from './asset-readiness';
import { language, t } from './locale';
import type { Board } from './engine';
import { symbolImageUrl } from './symbol-assets';
import './retrigger-award.css';

const artwork = {
  crest: symbolImageUrl('scatter'),
  panel: assetUrl('alchemist/ui/v4/button-secondary-base.webp'),
  spark: assetUrl('alchemist/effects/parts/spark.png'),
  light: assetUrl('alchemist/effects/parts/gold-burst.png'),
};

export async function preloadRetriggerAward() {
  await Promise.all(Object.values(artwork).map(decodedImage));
}

type RetriggerAwardProps = {
  count: number;
  /** Natural stopped board, used only to connect the actual Scatters to the award. */
  board?: Board;
  /** The parent owns the award hold and unmount; this scene creates no timer. */
  durationMs: number;
  reducedMotion: boolean;
  paused?: boolean;
};

/** A short, self-contained reward beat using the game's existing raster art.
 * Every CSS stage shares the exact parent presentation duration. */
export function RetriggerAward({ count, board, durationMs, reducedMotion, paused = false }: RetriggerAwardProps) {
  if (count <= 0) return null;
  const sources = board?.flatMap((reel, col) => reel.flatMap((cell, row) => cell.id === 'scatter' ? [{ col, row }] : [])) ?? [];
  return <div className={`retrigger-scene${reducedMotion ? ' retrigger-scene--still' : ''}`}
    data-testid="retrigger-award" data-retrigger-count={count} data-paused={paused || undefined}
    role="status" aria-live="polite" aria-atomic="true"
    style={{ '--award-duration': `${durationMs}ms` } as CSSProperties}>
    {sources.map(({ col, row }) => <img key={`${col}:${row}`} className="retrigger-scene__source" src={artwork.spark}
      alt="" aria-hidden="true" draggable={false} data-retrigger-source={`${col}:${row}`}
      style={{ '--source-x': ((col + .5) / 6 - .5) * 100, '--source-y': ((row + .5) / 5 - .5) * 100 } as CSSProperties} />)}
    <div className="retrigger-scene__card">
      <img className="retrigger-scene__light" src={artwork.light} alt="" aria-hidden="true" draggable={false} />
      <img className="retrigger-scene__panel" src={artwork.panel} alt="" aria-hidden="true" draggable={false} />
      <img className="retrigger-scene__crest" src={artwork.crest} alt="" aria-hidden="true" draggable={false} />
      <div className="retrigger-scene__copy">
        <span className="retrigger-scene__eyebrow" aria-hidden="true">{language === 'ru' ? 'РЕЙД ПРОДОЛЖАЕТСЯ' : 'THE RAID CONTINUES'}</span>
        <strong className="retrigger-scene__number">+{count}</strong>
        <span className="retrigger-scene__label">{t('БЕСПЛАТНЫЕ ВРАЩЕНИЯ')}</span>
      </div>
      <img className="retrigger-scene__glint retrigger-scene__glint--first" src={artwork.light} alt="" aria-hidden="true" draggable={false} />
      <img className="retrigger-scene__glint retrigger-scene__glint--last" src={artwork.light} alt="" aria-hidden="true" draggable={false} />
    </div>
  </div>;
}
