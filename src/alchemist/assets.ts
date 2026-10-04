/** Public assets travel with the bundle when Engine mounts a release in a subdirectory. */
export function assetUrl(path: string): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string; PROD?: boolean } }).env;
  // Vite emits every JS chunk into assets/. Resolve from that known location:
  // an embedding page's <base> or history path must not redirect game artwork.
  if (env?.PROD) {
    const moduleUrl = import.meta.url;
    return new URL(path.replace(/^\/+/, ''), new URL('../', moduleUrl)).href;
  }
  const raw = env?.BASE_URL ?? './';
  const base = raw.endsWith('/') ? raw : `${raw}/`;
  const relative = `${base}${path.replace(/^\/+/, '')}`;
  return typeof document === 'undefined' ? relative : new URL(relative, document.baseURI).href;
}
