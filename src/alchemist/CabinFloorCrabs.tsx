import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetUrl } from './assets';
import { floorCrabLanes, type FloorRect } from './cabin-floor-crab-layout';
import './cabin-floor-crabs.css';

const art = (name: string) => assetUrl(`alchemist/environment/floor-crabs-v25/${name}.webp`);
const dimensions: Record<string, [number, number]> = {
  crabBody: [219, 165], crabLegLeft: [118, 152], crabLegRight: [118, 155],
  crabClawLeft: [147, 131], crabClawRight: [147, 124],
  crabEyeLeft: [96, 164], crabEyeRight: [96, 155], crabHat: [126, 74],
};

function Part({ name, x, y, width, className = '', socket }: {
  name: string; x: number; y: number; width: number; className?: string; socket?: [number, number];
}) {
  const [w, h] = dimensions[name], height = width * h / w;
  const u = socket?.[0] ?? .5, v = socket?.[1] ?? .5;
  // Same sockets and unscaled lengths as the existing native crab rig.
  return <img src={art(name)} alt="" draggable={false} className={`floor-crab__part ${className}`}
    style={{ left: `${(120 + x - u * width) / 2.4}%`, top: `${(120 - y - v * height) / 2.4}%`,
      width: `${width / 2.4}%`, height: `${height / 2.4}%`,
      transformOrigin: socket ? `${u * 100}% ${v * 100}%` : undefined } as CSSProperties} />;
}

function Crab({ second }: { second: boolean }) {
  return <div className={`floor-crab__lane${second ? ' floor-crab__lane--second' : ''}`} data-enabled="false">
    <div className="floor-crab__runner"><div className="floor-crab__pose">
      {[0, 1, 2].map(index => <div key={index} className={`floor-crab__leg-pair floor-crab__leg-pair--${index}`}>
        <Part name="crabLegLeft" x={-43 - index * 3} y={-25 - index * 5} width={59 + index * 3} className="floor-crab__leg floor-crab__leg--left" />
        <Part name="crabLegRight" x={43 + index * 3} y={-25 - index * 5} width={59 + index * 3} className="floor-crab__leg floor-crab__leg--right" />
      </div>)}
      <Part name="crabClawLeft" x={-43} y={14} width={84} socket={[.82, .80]} className="floor-crab__claw floor-crab__claw--left" />
      <Part name="crabClawRight" x={43} y={14} width={84} socket={[.20, .80]} className="floor-crab__claw floor-crab__claw--right" />
      <Part name="crabBody" x={0} y={0} width={125} />
      <Part name="crabEyeLeft" x={-22} y={38} width={29} className="floor-crab__eye floor-crab__eye--left" />
      <Part name="crabEyeRight" x={22} y={38} width={29} className="floor-crab__eye floor-crab__eye--right" />
      {second && <Part name="crabHat" x={0} y={65} width={72} className="floor-crab__hat" />}
    </div></div>
  </div>;
}

/** Two decorative inhabitants only. Their lanes fit between the real frame
 * and HUD, and are intersected with the original painted cabin floor. */
export const CabinFloorCrabs = memo(function CabinFloorCrabs({ reducedMotion, obscured }: {
  reducedMotion: boolean; obscured: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const requestMeasure = useRef<(() => void) | null>(null);
  const obscuredRef = useRef(obscured); obscuredRef.current = obscured;
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const element = host.current, shell = element?.closest('.game-shell');
    if (!element || !shell) return;
    const board = shell.querySelector<HTMLElement>('.reel-frame');
    const controls = shell.querySelector<HTMLElement>('.control-wrap');
    const readout = shell.querySelector<HTMLElement>('.win-readout');
    const lanes = Array.from(element.querySelectorAll<HTMLElement>('.floor-crab__lane'));
    let disposed = false, pendingFrame = 0;
    const measure = () => {
      if (obscuredRef.current || document.hidden) return;
      const bounds = element.getBoundingClientRect(), field = board?.getBoundingClientRect(), hud = controls?.getBoundingClientRect();
      if (!field || !hud || !bounds.width || !bounds.height) { element.dataset.fits = 'false'; return; }
      const local = (r: DOMRect): FloorRect => ({ left: r.left - bounds.left, right: r.right - bounds.left, top: r.top - bounds.top, bottom: r.bottom - bounds.top });
      const label = readout?.firstElementChild?.getBoundingClientRect();
      const positions = floorCrabLanes(bounds.width, bounds.height, local(field), local(hud), label?.width ? local(label) : undefined);
      element.dataset.fits = String(positions.length > 0);
      element.dataset.lanes = String(positions.length);
      lanes.forEach((lane, index) => {
        const position = positions[index]; lane.dataset.enabled = String(Boolean(position));
        if (!position) return;
        lane.dataset.placement = position.placement;
        lane.style.left = `${position.left}px`; lane.style.top = `${position.top}px`;
        lane.style.width = `${position.right - position.left}px`; lane.style.height = `${position.size}px`;
        lane.style.setProperty('--crab-size', `${position.size}px`);
        lane.style.setProperty('--crab-travel', `${position.travel}px`);
      });
    };
    const schedule = () => {
      if (disposed || pendingFrame || obscuredRef.current || document.hidden) return;
      pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; if (!disposed) measure(); });
    };
    requestMeasure.current = schedule;
    const resize = new ResizeObserver(schedule);
    [element, board, controls, readout].forEach(item => item && resize.observe(item));
    const visibility = () => { setVisible(!document.hidden); if (!document.hidden) schedule(); };
    // Symbol wins, buttons, glow sprites and other decorative animations do
    // not move the floor corridor. Only its actual layout owners can do so.
    const transition = (event: Event) => {
      const target = event.target;
      if (target === shell || target === board || target === controls || target === readout || target instanceof Element && readout?.contains(target)) schedule();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', schedule); window.visualViewport?.addEventListener('resize', schedule);
    shell.addEventListener('transitionend', transition); shell.addEventListener('animationend', transition);
    document.fonts.addEventListener('loadingdone', schedule); void document.fonts.ready.then(schedule);
    schedule();
    return () => {
      disposed = true; if (pendingFrame) cancelAnimationFrame(pendingFrame); requestMeasure.current = null; resize.disconnect();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule); shell.removeEventListener('transitionend', transition); shell.removeEventListener('animationend', transition);
      document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, []);
  // Startup/dialog removal can change position without resizing the frame.
  useEffect(() => { requestMeasure.current?.(); }, [obscured]);
  return <div ref={host} className="cabin-floor-crabs" data-fits="false" data-paused={reducedMotion || obscured || !visible}
    data-reduced={reducedMotion} aria-hidden="true"><div className="floor-crab__corridor"><Crab second={false} /><Crab second /></div></div>;
});
