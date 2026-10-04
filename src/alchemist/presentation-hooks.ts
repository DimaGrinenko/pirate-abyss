import { useEffect, useMemo, useRef, useState } from 'react';
import { CeremonyExitGate, PresentationCountClock } from './presentation-count-clock';

export function usePresentationCount(duration: number, reducedMotion: boolean, held: boolean, skip: boolean, timeScale: number) {
  const [progress, setProgress] = useState(reducedMotion ? 1 : 0);
  // The award owns the clock. Holds, skips and preference changes never reset it.
  const clock = useMemo(() => new PresentationCountClock(duration), [duration]);
  useEffect(() => {
    if (reducedMotion) { clock.finish(); setProgress(1); return; }
    if (skip) clock.finishWithin();
    if (held || clock.progress >= 1) return;
    let frame = 0;
    const update = (time: number) => {
      if (document.hidden) { clock.pause(); return; }
      const p = clock.advance(time, timeScale);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(update);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      clock.pause();
      if (!document.hidden && clock.progress < 1) {
        clock.resume(performance.now());
        frame = requestAnimationFrame(update);
      }
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); clock.pause(); document.removeEventListener('visibilitychange', visibility); };
  }, [reducedMotion, held, skip, clock, timeScale]);
  return reducedMotion ? 1 : progress;
}

export function useCeremonyExit(exiting: boolean, held: boolean, reducedMotion: boolean, onContinue: () => void, timeScale: number) {
  const gate = useRef(new CeremonyExitGate());
  const callback = useRef(onContinue);
  callback.current = onContinue;
  useEffect(() => {
    if (!exiting || held) return;
    const exitGate = gate.current;
    let frame = 0;
    const tick = (time: number) => {
      if (document.hidden) { exitGate.clock.pause(); return; }
      if (exitGate.advance(time, reducedMotion, timeScale)) { callback.current(); return; }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      exitGate.clock.pause();
      if (!document.hidden) { exitGate.clock.resume(performance.now()); frame = requestAnimationFrame(tick); }
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); exitGate.clock.pause(); document.removeEventListener('visibilitychange', visibility); };
  }, [exiting, held, reducedMotion, timeScale]);
  return () => gate.current.markAnimationComplete();
}

/** Assets normally deliver the cue. A stalled loader or missing event still
 * leaves the presentation operable after a bounded amount of visible time. */
export function usePresentationDeadline(duration: number, enabled: boolean, held: boolean, onElapsed: () => void, timeScale: number) {
  const clock = useMemo(() => new PresentationCountClock(duration), [duration]);
  const callback = useRef(onElapsed);
  callback.current = onElapsed;
  useEffect(() => {
    if (!enabled || held || clock.progress >= 1) return;
    let frame = 0;
    const tick = (time: number) => {
      if (document.hidden) { clock.pause(); return; }
      if (clock.advance(time, timeScale) >= 1) { callback.current(); return; }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame); clock.pause();
      if (!document.hidden && clock.progress < 1) { clock.resume(performance.now()); frame = requestAnimationFrame(tick); }
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); clock.pause(); document.removeEventListener('visibilitychange', visibility); };
  }, [clock, enabled, held, timeScale]);
}

