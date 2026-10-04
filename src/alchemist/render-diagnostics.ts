/** Timing only: local production previews may expose CPU submission samples.
 * This does not enable gallery controls, forced results or wallet actions. */
export function renderDiagnosticsEnabled(development = false, location: Pick<Location, 'hostname' | 'search'> = window.location) {
  if (development) return true;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
  return local && new URLSearchParams(location.search).get('dev') === '1';
}
