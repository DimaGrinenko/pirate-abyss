import { t } from './locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChemicalSymbol } from './ChemicalSymbol';
import { SYMBOLS } from './engine';
import type { Cell } from './engine';
import { planReelStop, reelStopPosition, reelStopVelocity, reelPullback, spinMotionProfile } from './presentation';
import { symbolImageUrl } from './symbol-assets';
import { preparedImage } from './asset-readiness';

const images = new Map<string, HTMLImageElement>();

function bitmap(cell: Cell) {
  const id = cell.id === 'wild' ? `wild-${cell.wildType}` : cell.id;
  let img = images.get(id);
  if (!img) {
    const url = symbolImageUrl(id);
    img = preparedImage(url);
    if (!img) { img = new Image(); img.src = url; }
    images.set(id, img);
  }
  return img;
}

export function ReelColumn({ column, col, rolling, anticipation, spinId, turbo, reducedMotion, covered = false, paused = false, winRows, dimmed, children, onStopped, onSettled }: {
  column: Cell[]; col: number; rolling: boolean; anticipation: boolean; spinId: number;
  turbo: boolean; reducedMotion: boolean; covered?: boolean; paused?: boolean; winRows: Set<number>; dimmed: boolean; children?: ReactNode;
  onStopped?: (col: number, spinId: number) => void; onSettled?: (col: number, spinId: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnRef = useRef(column);
  const teaseRef = useRef(anticipation);
  const [moving, setMoving] = useState(false);
  const [landingId, setLandingId] = useState<number>();
  const profile = useMemo(() => spinMotionProfile(turbo, reducedMotion), [turbo, reducedMotion]);
  const callbacks = useRef({ onStopped, onSettled }); callbacks.current = { onStopped, onSettled };
  const motion = useRef({ distance: 0, started: 0, elapsed: 0, speed: 0, strip: column.slice(), last: 0, id: 0, landed: new Set<number>(), settled: false, failedSpin: -1 });
  columnRef.current = column;
  teaseRef.current = anticipation;

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = motion.current;
    const staticLanding = () => {
      setMoving(false); setLandingId(undefined);
      state.started = 0;
      if (!rolling && spinId > 0) { callbacks.current.onStopped?.(col, spinId); callbacks.current.onSettled?.(col, spinId); }
    };
    if (!canvas || reducedMotion) { staticLanding(); return; }
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx || state.failedSpin === spinId || ctx.isContextLost?.()) { state.failedSpin = spinId; staticLanding(); return; }
    if (!rolling && !motion.current.started) return;
    let frame = 0;
    const begin = performance.now();
    if (rolling) {
      state.strip = [...columnRef.current, ...Array.from({ length: 27 }, (_, i) => ({ id: SYMBOLS[(i * 7 + col * 3 + spinId) % SYMBOLS.length].id }))];
      state.strip.forEach(bitmap);
      state.started = begin; state.last = begin; state.distance = 0; state.speed = 0; state.elapsed = 0;
      state.id = spinId; state.landed.clear(); state.settled = false;
      setLandingId(undefined); setMoving(true);
    }
    const stopPlan = planReelStop(state.distance, state.speed || profile.speed);
    const target = columnRef.current.slice();
    target.forEach(bitmap);
    let stopElapsed = 0, width = 0, height = 0, dpr = 1;
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight; dpr = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
      if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas);
    const contextLost = () => { cancelAnimationFrame(frame); state.failedSpin = spinId; staticLanding(); };
    canvas.addEventListener('contextlost', contextLost);
    const visibilityChanged = () => { state.last = performance.now(); };
    document.addEventListener('visibilitychange', visibilityChanged);

    const render = (time: number) => {
      if (!width || !height) { frame = requestAnimationFrame(draw); return; }
      if (document.hidden) { state.last = time; frame = requestAnimationFrame(draw); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const h = height / 5, dt = Math.min((time - state.last) / 1000, .05);
      state.last = time;
      let progress = 0;
      if (rolling) {
        state.elapsed += dt * 1000;
        const elapsed = state.elapsed;
        const startMs = profile.start;
        const ramp = Math.min(elapsed / startMs, 1);
        const desired = teaseRef.current ? profile.anticipationSpeed : profile.speed;
        state.speed += (desired - state.speed) * (1 - Math.exp(-dt * (teaseRef.current ? 5 : 12)));
        // A short mechanical pullback precedes the continuous downward strip.
        if (ramp < .35) state.distance = reelPullback(ramp / .35);
        else {
          const launch = Math.min(1, (ramp - .35) / .65);
          state.distance += state.speed * dt * (launch * launch * (3 - 2 * launch));
        }
      } else {
        stopElapsed += dt * 1000;
        progress = Math.min(stopElapsed / stopPlan.duration, 1);
        state.distance = reelStopPosition(stopPlan, stopElapsed);
      }
      const drawCell = (cell: Cell, y: number, velocity: number) => {
        const img = bitmap(cell);
        if (!img.complete || !img.naturalWidth) return;
        // Match the native 288-unit symbol camera exactly at the final reel stop.
        const size = Math.min(width, h);
        const ratio = img.naturalWidth / img.naturalHeight;
        const iw = ratio > 1 ? size : size * ratio, ih = ratio > 1 ? size / ratio : size;
        const x = (width - iw) / 2, top = y + (h - ih) / 2;
        // Exposure samples follow the moving strip without stretching the art.
        // The blur fades continuously during deceleration instead of switching
        // off abruptly at a single velocity threshold.
        const blur = Math.min(1, Math.max(0, (velocity - 7) / 23));
        if (blur > 0) {
          const exposure = Math.min(h * .22, velocity * h / 120);
          for (let sample = 0; sample < 3; sample++) {
            ctx.globalAlpha = (.10 + sample * .05) * blur;
            ctx.drawImage(img, x, top - exposure * (3 - sample) / 3, iw, ih);
          }
        }
        ctx.globalAlpha = 1 - .45 * blur;
        ctx.drawImage(img, x, top, iw, ih);
        ctx.globalAlpha = 1;
      };
      const whole = Math.floor(state.distance), fraction = state.distance - whole;
      for (let row = -1; row < 6; row++) {
        const logical = row - whole, index = (logical % state.strip.length + state.strip.length) % state.strip.length;
        const targetRow = logical + stopPlan.end;
        const cell = !rolling && targetRow >= 0 && targetRow < target.length ? target[targetRow] : state.strip[index];
        const velocity = rolling ? state.speed : reelStopVelocity(stopPlan, stopElapsed);
        drawCell(cell, (row + fraction) * h, velocity);
      }
      if (!rolling && progress >= 1) {
        state.started = 0; setLandingId(spinId); setMoving(false);
        callbacks.current.onStopped?.(col, spinId); return;
      }
      frame = requestAnimationFrame(draw);
    };
    const draw = (time: number) => {
      try { render(time); }
      catch (error) {
        // A failed cosmetic canvas must still acknowledge its fixed result.
        // The static symbols remain visible and the other reels can settle.
        console.error(error); state.failedSpin = spinId; staticLanding();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener('contextlost', contextLost); document.removeEventListener('visibilitychange', visibilityChanged); };
  }, [rolling, col, spinId, profile, reducedMotion]);

  const landed = (row: number, id: number) => {
    const state = motion.current;
    if (id !== state.id || state.settled) return;
    state.landed.add(row);
    if (state.landed.size === column.length) { state.settled = true; callbacks.current.onSettled?.(col, id); }
  };

  return <div className={`reel-column ${moving ? 'rolling' : ''} ${anticipation ? 'anticipating' : ''}`} data-reel={col} data-anticipation={anticipation || undefined}>
    <div className="reel-still" style={{ visibility: moving ? 'hidden' : 'visible' }}>
      {column.map((cell, row) => <div className={`reel-cell ${winRows.has(row) ? 'symbol-winner' : dimmed ? 'symbol-muted' : ''}`} key={row} data-row={row}>
        <ChemicalSymbol {...cell} animated={!reducedMotion && !moving && !covered} active={!paused} timeScale={profile.timeScale} winning={winRows.has(row)} landKey={moving || landingId === undefined ? undefined : `${landingId}:${row}`} onLandComplete={() => { if (landingId !== undefined) landed(row, landingId); }} />
      </div>)}
    </div>
    <canvas ref={canvasRef} className="reel-motion" style={{ visibility: moving ? 'visible' : 'hidden' }} aria-hidden="true" />
    {anticipation && <div className="reel-anticipation" aria-label={t("Ожидание специального символа на барабане {p0}", { p0: col + 1 })}><i /><i /><i /></div>}
    {children}
  </div>;
}
