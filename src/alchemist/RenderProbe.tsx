import { useId, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import './render-probe.css';

const modes = [
  ['full', 'Full scene'],
  ['freeze-character', 'Freeze character draw'],
  ['freeze-environment', 'Freeze environment draw'],
  ['freeze-symbols', 'Freeze symbol draw'],
  ['freeze-all', 'Freeze all draw'],
  ['freeze-css', 'Freeze CSS animation'],
  ['no-filters', 'No CSS filters'],
  ['no-blends', 'No blend modes'],
  ['no-waterlight', 'No reel waterlight'],
  ['no-character', 'No character'],
  ['no-environment', 'No environment'],
  ['no-symbols', 'No symbols'],
] as const;
export type RenderProbeMode = typeof modes[number][0];
type ProbeProps = { shellRef: RefObject<HTMLElement | null>; mode: RenderProbeMode; onModeChange: (mode: RenderProbeMode) => void; disabled?: boolean };

/** Explicit, local-only diagnostic; removing the URL flag restores the scene. */
export function renderProbeRequested(location: Pick<Location, 'hostname' | 'search'> = window.location) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const query = new URLSearchParams(location.search);
  return local && query.get('dev') === '1' && query.get('renderProbe') === '1';
}

function Probe({ shellRef, mode, onModeChange, disabled }: ProbeProps) {
  const id = useId();
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const previous = shell.getAttribute('data-render-probe');
    shell.setAttribute('data-render-probe', mode);
    return () => {
      if (previous === null) shell.removeAttribute('data-render-probe');
      else shell.setAttribute('data-render-probe', previous);
    };
  }, [mode, shellRef]);
  return <details className="render-probe" data-testid="render-probe" open>
    <summary>Render probe</summary>
    <label htmlFor={id}>Render isolation</label>
    <select id={id} value={mode} disabled={disabled} onChange={event => onModeChange(event.currentTarget.value as RenderProbeMode)}>
      {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <output aria-live="polite">{modes.find(([value]) => value === mode)?.[1]}</output>
    <small>Idle only · freeze retains painted pose · remove renderProbe=1 to close</small>
  </details>;
}

export function RenderProbe(props: ProbeProps) {
  return renderProbeRequested() ? <Probe {...props} /> : null;
}
