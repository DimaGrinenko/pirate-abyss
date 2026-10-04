import { memo, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { assetUrl } from './assets';
import { TintedRasterImage } from './TintedRasterImage';
import type { TintedRasterVariant } from './tinted-raster';
import type { WinTier } from './win-tiers';
import './win-finale-v21.css';

const part = (name: string) => assetUrl(`alchemist/effects/parts/${name}.png`);

/** Pause decorative CSS together with the native scene when the tab is hidden. */
export function useSceneryVisibility() {
  useEffect(() => {
    const update = () => { document.documentElement.dataset.sceneryHidden = String(document.hidden); };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { document.removeEventListener('visibilitychange', update); delete document.documentElement.dataset.sceneryHidden; };
  }, []);
}

export const WelcomeFeatureAmbience = memo(function WelcomeFeatureAmbience({ variant }: { variant: 'lords' | 'reel' | 'scatter' }) {
  return <div className={`welcome-feature-art welcome-feature-art--${variant}`} aria-hidden="true">
    <img className="welcome-feature-art__current" src={part('caustic')} alt="" />
    <img className="welcome-feature-art__halo" src={part('gold-burst')} alt="" />
    {[0, 1, 2].map(i => <img key={i} className="welcome-feature-art__spark" src={part(i === 1 ? 'bubble' : 'spark')} alt="" style={{ '--i': i } as CSSProperties} />)}
  </div>;
});

/** Raster scenery stays behind symbols; rigid frame and grid positions never move. */
const reelTints: Partial<Record<number, TintedRasterVariant>> = { 2: 'reel-2', 3: 'reel-3', 4: 'reel-4' };
export const ReelWaterlight = memo(function ReelWaterlight({ column, paused }: { column: number; paused: boolean }) {
  const tint = reelTints[column];
  return <div className="reel-waterlight" data-paused={paused} aria-hidden="true" style={{ '--lane-phase': `${-column * 2.13}s`, '--lane-cycle': `${13 + column * .9}s` } as CSSProperties}>
    <div className="reel-waterlight__current-clip">{tint
      ? <TintedRasterImage className="reel-waterlight__current" tint={tint} alt="" />
      : <img className="reel-waterlight__current" src={part('caustic')} alt="" />}</div>
    <div className="reel-waterlight__glow-clip"><img className="reel-waterlight__glow" src={part('gold-burst')} alt="" /></div>
    {[0, 1].map(i => <img key={i} className="reel-waterlight__bubble" src={part('bubble')} alt="" style={{ '--bubble-x': `${i ? 84 : 14}%`, '--bubble-phase': `${-column * 1.81 - i * 5.1}s`, '--bubble-cycle': `${10 + column + i * 3}s` } as CSSProperties} />)}
  </div>;
});

const intensity: Record<WinTier, number> = { big: 8, super: 10, mega: 12, epic: 14, legendary: 18, max: 22 };
/** A continuous, already-in-motion atmosphere accompanies the authored Spine props. */
export const WinScenery = memo(function WinScenery({ tier, timeScale }: { tier: WinTier; timeScale: number }) {
  return <div className={`win-scenery win-scenery--${tier}`} aria-hidden="true" style={{ '--scenery-speed': Math.max(.1, timeScale) } as CSSProperties}>
    <img className="win-scenery__halo win-scenery__halo--left" src={part('gold-burst')} alt="" />
    <img className="win-scenery__halo win-scenery__halo--right" src={part('gold-burst')} alt="" />
    <img className="win-scenery__current" src={part('caustic')} alt="" />
    {Array.from({ length: intensity[tier] }, (_, i) => {
      // Two outer streams keep the title and amount clear. Negative starting
      // phases put moving treasure in the very first painted frame.
      const left = i % 2 === 0;
      const kind = tier === 'epic' && i % 3 === 0 ? 'bubble' : i % 4 === 0 ? 'shard' : 'coin';
      return <span key={i} className={`win-scenery__flight win-scenery__flight--${kind}`} style={{
        '--x': `${left ? 4 + i % 5 * 4 : 79 + i % 5 * 3}%`,
        '--flight': `${4.6 + i % 6 * .41}s`, '--phase': `${-i * .63 - .2}s`,
        '--drift': `${(left ? 1 : -1) * (14 + i % 4 * 15)}px`, '--size': `${17 + i % 5 * 5}px`,
        '--turn': `${(left ? 1 : -1) * (190 + i * 31)}deg`, '--spin': `${1.35 + i % 4 * .3}s`,
      } as CSSProperties}><img src={part(kind)} alt="" /></span>;
    })}
    <div className="win-scenery__finale">
      {[0, 1, 2, 3, 4, 5].map(i => <img key={i} src={part('spark')} alt="" style={{ '--i': i } as CSSProperties} />)}
    </div>
    <div className="win-scenery__treasure-salute">
      {[0, 1].map(side => <div className={`win-scenery__salute-origin win-scenery__salute-origin--${side}`} key={side}>
        <img className="win-scenery__salute-light" src={part('gold-burst')} alt="" />
        {Array.from({ length: tier === 'max' ? 12 : tier === 'legendary' ? 8 : 5 }, (_, i) => <span key={i} className="win-scenery__salute-coin" style={{ '--salute-x': `${(i % 2 ? 1 : -1) * (24 + i * 12)}px`, '--salute-y': `${-60 - i % 4 * 28}px`, '--salute-fall': `${85 + i % 5 * 22}px`, '--salute-delay': `${i * .045}s`, '--salute-size': `${14 + i % 4 * 5}px`, '--salute-turn': `${180 + i * 53}deg` } as CSSProperties}><img src={part(i % 4 === 0 ? 'shard' : 'coin')} alt="" /></span>)}
      </div>)}
    </div>
    {tier === 'max' && <img className="win-scenery__max-crown" src={part('gold-burst')} alt="" />}
  </div>;
});
