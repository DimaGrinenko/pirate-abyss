import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { assetUrl } from './assets';
import { MARINE_SIDE_ATLAS, MARINE_SIDE_REGIONS } from './marine-side-art-v38';
import './bonus-vault-v14.css';
import './vault-life-v21.css';
import './vault-marine-life-v42.css';

const swimmers = [
  { species: 'fishOrange', window: 'left', y: 40, width: 39, seconds: 31, phase: -9, leftward: false },
  { species: 'clownfish', window: 'right', y: 48, width: 37, seconds: 37, phase: -22, leftward: true },
  { species: 'blue-tang', window: 'channel', y: 23, width: 35, seconds: 34, phase: -12, leftward: false },
  { species: 'mint-fish', window: 'channel', y: 64, width: 31, seconds: 43, phase: -30, leftward: true },
] as const;

/** The painting, glass masks and fish use one cover-cropped coordinate plane.
 * Four whole raster fish drift through the water; their faces never deform. */
export function BonusVaultBackground({ paused, reducedMotion, summary, timeScale = 1 }: {
  paused: boolean; reducedMotion: boolean; summary: boolean; timeScale?: number;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    // Changing animation-duration restarts a CSS route at a different position.
    // Playback rate preserves its current pose and requires no application RAF.
    const rate = Number.isFinite(timeScale) ? Math.max(.01, Math.min(4, timeScale)) : 1;
    scene.current?.getAnimations({ subtree: true }).forEach(animation => animation.updatePlaybackRate(rate));
  }, [timeScale, reducedMotion]);
  return <div ref={scene} className="bonus-vault" aria-hidden="true"
    data-vault-paused={paused || reducedMotion || hidden || timeScale <= 0}
    data-vault-static={reducedMotion} data-vault-summary={summary}>
    <div className="bonus-vault__world">
      <img className="bonus-vault__painting" src={assetUrl('alchemist/ceremony/vault-background-v42.webp')} alt="" draggable={false} />
      {swimmers.map(fish => {
        const [x, y, width, height] = MARINE_SIDE_REGIONS[fish.species];
        return <div key={fish.species} className={`bonus-vault__fish-window bonus-vault__fish-window--${fish.window}`}>
          <div className="bonus-vault__swimmer" data-leftward={fish.leftward}
            style={{ '--fish-y': `${fish.y}%`, '--fish-width': `${fish.width}%`,
              '--fish-duration': `${fish.seconds}s`, '--fish-phase': `${fish.phase}s` } as CSSProperties}>
            <span className="bonus-vault__fish" style={{ aspectRatio: `${width} / ${height}` }}>
              <img src={assetUrl(`alchemist/environment/${MARINE_SIDE_ATLAS}`)} alt="" draggable={false}
                style={{ width: `${2048 / width * 100}%`, height: `${1024 / height * 100}%`,
                  left: `${-x / width * 100}%`, top: `${-y / height * 100}%` }} />
            </span>
          </div>
        </div>;
      })}
      <div className="bonus-vault__reflections">
        {['floor', 'left', 'right'].map(place => <img key={place} className={`bonus-vault__waterlight bonus-vault__waterlight--${place}`} src={assetUrl('alchemist/effects/parts/caustic.png')} alt="" />)}
        {[0, 1].map(index => <img key={index} className={`bonus-vault__lantern bonus-vault__lantern--${index}`} src={assetUrl('alchemist/effects/parts/gold-burst.png')} alt="" />)}
        {[0, 1, 2, 3].map(index => <img key={`glint-${index}`} className="bonus-vault__metal" src={assetUrl('alchemist/effects/parts/spark.png')} alt="" style={{ '--glint-x': `${[8, 22, 81, 94][index]}%`, '--glint-y': `${[36, 67, 23, 58][index]}%`, '--glint-phase': `${-index * 2.13}s` } as CSSProperties} />)}
      </div>
    </div>
    <div className="bonus-vault__shade" />
    {[0, 1, 2].map(index => <img key={`light-${index}`} className={`bonus-vault__light bonus-vault__light--${index}`} src={assetUrl('alchemist/effects/parts/gold-burst.png')} alt="" />)}
    {Array.from({ length: 10 }, (_, index) => <img key={index} className="bonus-vault__mote" src={assetUrl(`alchemist/effects/parts/${index % 3 === 0 ? 'bubble' : 'spark'}.png`)} alt=""
      style={{ '--x': `${5 + (index * 41) % 91}%`, '--y': `${9 + (index * 23) % 82}%`, '--size': `${index % 3 === 0 ? 12 : 7 + index % 5 * 3}px`, '--drift': `${index % 2 ? -22 : 27}px`, '--duration': `${12 + index % 6}s`, '--delay': `${-index * 1.37}s` } as CSSProperties} />)}
  </div>;
}

