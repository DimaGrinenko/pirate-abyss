import { useEffect, useRef, type RefObject } from 'react';
import { FrameTimingWindow } from './frame-timing';
import { renderDiagnosticsEnabled } from './render-diagnostics';

/** Local workshop diagnostics only. No game state, forced outcomes or network access. */
export function useFrameDiagnostics(host: RefObject<HTMLDivElement | null>, enabled: boolean, phase: string) {
  const currentPhase = useRef(phase);
  useEffect(() => { currentPhase.current = phase; }, [phase]);
  useEffect(() => {
    const element = host.current;
    if (!enabled || !element) return;
    if (renderDiagnosticsEnabled(import.meta.env.DEV)) {
      const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      // Capture QA context once, separately from the per-frame sample window.
      // Unsupported/coarsened browser fields are not a physical-device inventory.
      element.dataset.runtimeInfo = JSON.stringify({
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : null,
        deviceMemory: deviceMemory !== undefined && Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : null,
        devicePixelRatio: window.devicePixelRatio,
      });
    }
    const timer = new FrameTimingWindow();
    const windows: object[] = [];
    let handle: number | null = null;
    const tick = (time: number) => {
      handle = null;
      if (document.hidden) return;
      const probe = element.dataset.renderProbe;
      const result = timer.record(time, currentPhase.current + (probe && probe !== 'full' ? `:${probe}` : ''));
      if (result) {
        windows.push({ ...result, at: new Date().toISOString(), width: innerWidth, height: innerHeight,
          dpr: devicePixelRatio, canvases: element.querySelectorAll('canvas').length });
        if (windows.length > 60) windows.shift();
        element.dataset.frameDiagnostics = JSON.stringify(windows);
      }
      handle = requestAnimationFrame(tick);
    };
    const visibility = () => {
      timer.reset();
      if (handle !== null) cancelAnimationFrame(handle);
      handle = document.hidden ? null : requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      if (handle !== null) cancelAnimationFrame(handle);
      document.removeEventListener('visibilitychange', visibility);
      delete element.dataset.frameDiagnostics;
      delete element.dataset.runtimeInfo;
    };
  }, [enabled, host]);
}
