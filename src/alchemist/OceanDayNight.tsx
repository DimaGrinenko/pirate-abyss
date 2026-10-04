import { useEffect, useRef, type CSSProperties } from 'react';
import { assetUrl } from './assets';
import { DemandFrameLoop } from './demand-frame-loop';
import { oceanNightAmount, OCEAN_CYCLE_SECONDS } from './ocean-cycle';
import './ocean-day-night.css';

type Subscriber = { running: boolean; draw: (night: number) => void };
const subscribers = new Set<Subscriber>();
let elapsed = 0, clock: DemandFrameLoop | undefined;
function ensureClock() {
  if (clock) return clock;
  clock = new DemandFrameLoop({ request: fn => requestAnimationFrame(fn), cancel: id => cancelAnimationFrame(id) }, delta => {
    elapsed = (elapsed + delta) % OCEAN_CYCLE_SECONDS;
    const night = oceanNightAmount(elapsed);
    // A second visible scene may keep the shared clock running, but hidden,
    // held and static-preview subscribers must retain their last painted pose.
    for (const item of subscribers) if (item.running) item.draw(night);
  });
  return clock;
}
const sync = () => clock?.setPlayback([...subscribers].some(item => item.running), !document.hidden);

/** The welcome and cabin share one visible-time cycle. Only two threshold
 * changes per cycle enter React; light opacity updates stay on this layer. */
export function OceanDayNight({ playing, reducedMotion, preview, onNight, onLight }: {
  playing: boolean; reducedMotion: boolean; preview?: 'day' | 'night'; onNight: (night: boolean) => void; onLight?: (amount: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialNight = useRef(preview ? Number(preview === 'night') : oceanNightAmount(elapsed)).current;
  const latest = useRef({ playing, reducedMotion, preview, onNight, onLight });
  latest.current = { playing, reducedMotion, preview, onNight, onLight };
  const refresh = useRef<(() => void) | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const scenery = element.closest<HTMLElement>('.environment,.entry-backdrop,.asset-gallery__world');
    let shown = -1, school: boolean | undefined;
    const draw = (amount: number) => {
      const state = latest.current;
      const night = state.preview ? Number(state.preview === 'night') : amount;
      if (Math.abs(shown - night) > .0003) {
        element.style.setProperty('--ocean-night', night.toFixed(4));
        element.dataset.oceanLight = night <= .001 ? 'day' : night >= .999 ? 'night' : 'twilight';
        // Scope inherited light to scenery: 30 symbols and the HUD do not need
        // their styles invalidated during every dusk/dawn light update.
        scenery?.style.setProperty('--cabin-night', night.toFixed(4));
        state.onLight?.(night);
        shown = night;
      }
      const nextSchool = night >= .55;
      if (nextSchool !== school) { school = nextSchool; state.onNight(nextSchool); }
    };
    const member: Subscriber = { running: false, draw };
    const update = () => {
      member.running = latest.current.playing && !latest.current.reducedMotion && !latest.current.preview;
      draw(oceanNightAmount(elapsed)); sync();
    };
    subscribers.add(member); ensureClock();
    if (subscribers.size === 1) document.addEventListener('visibilitychange', sync);
    refresh.current = update; update();
    return () => {
      refresh.current = null; subscribers.delete(member); sync();
      if (!subscribers.size) { document.removeEventListener('visibilitychange', sync); clock?.dispose(); clock = undefined; }
    };
  }, []);
  useEffect(() => { refresh.current?.(); }, [playing, reducedMotion, preview]);
  // Mount an explicit night preview (or a scene joining the shared night) in
  // its correct light before effects run, avoiding a first-frame day flash.
  return <div ref={host} className="ocean-day-night" style={{ '--ocean-night': initialNight } as CSSProperties} data-ocean-light={initialNight <= .001 ? 'day' : initialNight >= .999 ? 'night' : 'twilight'} aria-hidden="true">
    <div className="ocean-day-night__shade" />
    <img className="ocean-day-night__lamp ocean-day-night__lamp--left" src={assetUrl('alchemist/environment/cabin-light-v21.webp')} alt="" />
    <img className="ocean-day-night__lamp ocean-day-night__lamp--right" src={assetUrl('alchemist/environment/cabin-light-v21.webp')} alt="" />
    <img className="ocean-day-night__core ocean-day-night__core--lantern" src={assetUrl('alchemist/environment/cabin-light-v21.webp')} alt="" />
    <img className="ocean-day-night__core ocean-day-night__core--candle-one" src={assetUrl('alchemist/environment/cabin-light-v21.webp')} alt="" />
    <img className="ocean-day-night__core ocean-day-night__core--candle-two" src={assetUrl('alchemist/environment/cabin-light-v21.webp')} alt="" />
  </div>;
}
