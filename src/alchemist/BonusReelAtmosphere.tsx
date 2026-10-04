import { memo, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Board, GameMode, WildType } from './engine';
import { assetUrl } from './assets';
import './bonus-reel-atmosphere.css';

type Props = {
  layer: 'world' | 'reels';
  inBonus: boolean;
  mode: GameMode;
  phase: 'idle' | 'spinning' | 'revealing';
  spinId: number;
  landed: number;
  expanded: readonly number[];
  openingReels: readonly number[];
  board?: Board;
  payout: number;
  winning: boolean;
  obscured: boolean;
  reducedMotion: boolean;
};
const part = (name: string) => assetUrl(`alchemist/effects/parts/${name}.png`);
const hue: Record<WildType, string> = { blue: '145deg', red: '330deg', gold: '0deg', green: '55deg' };
const columns = [0, 1, 2, 3, 4, 5];

/** Cosmetic response to the existing presentation only. Continuous scenery is
 * never keyed by a spin: only a launch, a reveal or the actual win gets a key. */
export const BonusReelAtmosphere = memo(function BonusReelAtmosphere(props: Props) {
  const { layer, inBonus, mode, phase, spinId, landed, expanded, openingReels, board, payout, winning, obscured, reducedMotion } = props;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!inBonus || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      element.dataset.offscreen = String(!entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [inBonus]);
  if (!inBonus) return null;
  const rewarded = winning && payout > 0;
  return <div ref={host} className={`bonus-atmosphere bonus-atmosphere--${layer}`} aria-hidden="true"
    data-mode={mode} data-phase={phase} data-paused={obscured || reducedMotion}
    data-reduced={reducedMotion} data-rewarded={rewarded}>
    {layer === 'world' ? <>
      <div className="bonus-sea-mist" aria-hidden="true">{[0, 1, 2].map(i => <img key={i} src={assetUrl('alchemist/effects/parts/sea-mist-v23.webp')} alt="" />)}</div>
      {/* Floor reflections and distant light live behind the whole machine. */}
      <div className="bonus-depth-light">
        {[0, 1].map(side => <div className={`bonus-depth-light__side bonus-depth-light__side--${side}`} key={side}>
          <img className="bonus-depth-light__current" src={part('caustic')} alt="" />
          <img className="bonus-depth-light__lantern" src={part('gold-burst')} alt="" />
          {[0, 1, 2, 3].map(i => <span className="bonus-depth-light__mote" key={i} style={{
            '--mote-x': `${18 + i * 20}%`, '--mote-cycle': `${8.3 + i * 1.37 + side * .8}s`,
            '--mote-phase': `${-i * 2.47 - side * 4.1}s`, '--mote-drift': `${(side ? -1 : 1) * (12 + i * 8)}px`,
          } as CSSProperties}><img src={part(i === 1 ? 'shard' : 'spark')} alt="" /></span>)}
        </div>)}
      </div>
      {spinId > 0 && phase === 'spinning' && <div key={`launch:${spinId}`} className="bonus-undertow">
        {[0, 1].map(side => <img key={side} className={`bonus-undertow__wake bonus-undertow__wake--${side}`} src={part('caustic')} alt="" />)}
      </div>}
      {rewarded && <div key={`reward:${spinId}`} className="bonus-treasure-response">
        {[0, 1].map(side => <div className={`bonus-treasure-response__side bonus-treasure-response__side--${side}`} key={side}>
          <img className="bonus-treasure-response__light" src={part('gold-burst')} alt="" />
          {[0, 1, 2].map(i => <span className="bonus-treasure-response__coin" key={i} style={{ '--coin-order': i, '--coin-x': `${22 + i * 24}%`, '--coin-drift': `${(side ? -1 : 1) * (16 + i * 13)}px` } as CSSProperties}><img src={part(i === 2 ? 'shard' : 'coin')} alt="" /></span>)}
        </div>)}
      </div>}
    </> : <>
      <div className="bonus-atmosphere__lanes">
        {columns.map(col => {
          const wild = board?.[col]?.find(cell => cell.id === 'wild')?.wildType;
          return <div className="bonus-atmosphere__lane" key={col} data-column={col}
            data-opening={openingReels.includes(col)} data-expanded={expanded.includes(col)}
            style={{ '--reveal-hue': hue[wild ?? 'gold'] } as CSSProperties}>
            {/* landed requests deceleration; the :has(.rolling) rule holds this
                beat until ReelColumn has really completed its native stop. */}
            {spinId > 0 && phase !== 'idle' && landed > col && <div className="bonus-stop-light" key={`stop:${spinId}`}>
              <img className="bonus-stop-light__top" src={part('spark')} alt="" />
              <img className="bonus-stop-light__bottom" src={part('gold-burst')} alt="" />
            </div>}
            {expanded.includes(col) && <div className="bonus-reveal-current" key={`reveal:${spinId}:${col}`}>
              {[0, 1].map(side => <span key={side} className={`bonus-reveal-current__edge bonus-reveal-current__edge--${side}`}>
                <img src={part('gold-burst')} alt="" />
              </span>)}
            </div>}
          </div>;
        })}
      </div>
      {rewarded && <div className="bonus-reward-rim" key={`rim:${spinId}`}>
        {[0, 1, 2, 3, 4].map(i => <img key={i} src={part('spark')} alt="" style={{ '--rim-order': i } as CSSProperties} />)}
      </div>}
    </>}
  </div>;
});
