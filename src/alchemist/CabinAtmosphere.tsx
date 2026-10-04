import { memo, useEffect, useState, type CSSProperties } from 'react';
import { assetUrl } from './assets';
import { TintedRasterImage } from './TintedRasterImage';
import './cabin-atmosphere.css';

const light = assetUrl('alchemist/environment/cabin-light-v21.webp');
const mote = assetUrl('alchemist/environment/cabin-mote-v21.webp');
const motes = [
  [89, 44, 17.8, -6.4], [93, 60, 21.3, -13.6], [88, 73, 18.4, -9.8],
  [43, 87, 23.6, -12.1], [64, 89, 19.7, -3.4], [79, 84, 22.1, -17.7],
];

/** Interior light only. Geometry uses the painted 1672x941 cover coordinates;
 * none of these layers contains fish, bubbles or the porthole's water. */
export const CabinAtmosphere = memo(function CabinAtmosphere({ reducedMotion, obscured, inBonus }: {
  reducedMotion: boolean; obscured: boolean; inBonus: boolean;
}) {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className="cabin-atmosphere" aria-hidden="true" data-paused={reducedMotion || obscured || !visible}
    data-reduced={reducedMotion} data-bonus={inBonus}>
    <div className="cabin-atmosphere__paint">
      <div className="cabin-atmosphere__floor"><img src={light} alt="" draggable={false} /><TintedRasterImage tint="cabin-floor" alt="" draggable={false} /></div>
      <div className="cabin-atmosphere__wall"><TintedRasterImage tint="cabin-wall" alt="" draggable={false} /></div>
      <TintedRasterImage className="cabin-atmosphere__candle" tint="cabin-candle" alt="" draggable={false} />
      <img className="cabin-atmosphere__brass cabin-atmosphere__brass--chest" src={mote} alt="" draggable={false} />
      <img className="cabin-atmosphere__brass cabin-atmosphere__brass--shelf" src={mote} alt="" draggable={false} />
      {motes.map(([x, y, duration, delay], index) => <img className="cabin-atmosphere__dust" key={index}
        src={mote} alt="" draggable={false} style={{ left: `${x}%`, top: `${y}%`, '--drift': `${index % 2 ? -13 : 17}px`,
          animationDuration: `${duration}s`, animationDelay: `${delay}s` } as CSSProperties} />)}
    </div>
  </div>;
});
