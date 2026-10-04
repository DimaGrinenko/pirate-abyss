import { assetUrl } from './assets';
import { FISH_ROUTES_FILE, CABIN_WINDOW_REGISTRATION_FILE } from './environment-assets';
import type { FishWaterPolygon } from './fish-spacing';

export type FishRoute = { name: string; window?: string; species: string; width: number; height: number; centerX: number; centerY: number; amplitude: number; bob: number; period: number; phase: number; nativeFacing: number; constantDepthOpacity: number };
export type FishRouteData = { routes: FishRoute[]; navigationBoundaries: Record<string, FishWaterPolygon>; maskPolygons: Record<string, FishWaterPolygon> };
let routeData: Promise<FishRouteData> | undefined;

/** One registration/route record shared by volume, GPU fallback and Canvas.
 * Sharing immutable polygons also reuses the precomputed clearance tables. */
export function loadFishRouteData() {
  const fetchJson = (file: string) => fetch(assetUrl(`alchemist/environment/${file}`), { signal: AbortSignal.timeout(15000) })
    .then(response => { if (!response.ok) throw Error('Fish routes unavailable'); return response.json(); });
  return routeData ??= Promise.all([fetchJson(FISH_ROUTES_FILE), fetchJson(CABIN_WINDOW_REGISTRATION_FILE)])
    .then(([routes, registration]) => ({ ...routes, maskPolygons: registration.polygons }) as FishRouteData)
    .catch(error => { routeData = undefined; throw error; });
}
