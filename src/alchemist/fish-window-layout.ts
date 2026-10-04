type Point = readonly [number, number];
export type FishWindowRect = { x: number; y: number; width: number; height: number };

/** Keep logical coordinates in the original scene; only crop empty pixels
 * outside the window masks from the GPU surface. Two pixels retain mask AA. */
export function fishWindowLayout(polygons: Record<string, readonly Point[]>, worldWidth=1672, worldHeight=941) {
  const windows: Record<string, FishWindowRect> = {};
  for (const [name, points] of Object.entries(polygons)) {
    const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))-2);
    const y=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))-2);
    const right=Math.min(worldWidth,Math.ceil(Math.max(...points.map(p=>p[0])))+2);
    const bottom=Math.min(worldHeight,Math.ceil(Math.max(...points.map(p=>p[1])))+2);
    windows[name]={x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
  }
  const rects=Object.values(windows),x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
  const surface={x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};
  return {surface,windows};
}

export function fishOutsideWindow(x: number, y: number, radius: number, bounds: FishWindowRect) {
  return x+radius<bounds.x||x-radius>bounds.x+bounds.width||y+radius<bounds.y||y-radius>bounds.y+bounds.height;
}

/** Crop only pixels outside the clipping cabin viewport. Snap to the original
 * full target's device-pixel grid: the visible fish keep exactly the same
 * sample positions, resolution, camera, mask and route coordinates. */
export function visibleFishSurface(full: FishWindowRect, viewport: FishWindowRect, scale: number, resolution: number, windows: readonly FishWindowRect[] = [full]) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const dpr = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  const fullBufferWidth = Math.max(1, Math.round(full.width * safeScale * dpr));
  const fullBufferHeight = Math.max(1, Math.round(full.height * safeScale * dpr));
  const pixelScaleX = fullBufferWidth / full.width, pixelScaleY = fullBufferHeight / full.height;
  // In portrait the upper porthole is entirely beyond the camera. Its mask
  // should not keep a large transparent strip above/right of the main window.
  const visibleWindows = windows.map(window => ({
    left: Math.max(full.x, viewport.x, window.x), top: Math.max(full.y, viewport.y, window.y),
    right: Math.min(full.x + full.width, viewport.x + viewport.width, window.x + window.width),
    bottom: Math.min(full.y + full.height, viewport.y + viewport.height, window.y + window.height),
  })).filter(window => window.right > window.left && window.bottom > window.top);
  const left = Math.min(...visibleWindows.map(window => window.left)), top = Math.min(...visibleWindows.map(window => window.top));
  const right = Math.max(...visibleWindows.map(window => window.right)), bottom = Math.max(...visibleWindows.map(window => window.bottom));
  if (right <= left || bottom <= top) return {
    visible: false, surface: { x: full.x, y: full.y, width: 1 / pixelScaleX, height: 1 / pixelScaleY },
    bufferWidth: 1, bufferHeight: 1, fullBufferWidth, fullBufferHeight,
  };
  const firstX = Math.max(0, Math.floor((left - full.x) * pixelScaleX));
  const firstY = Math.max(0, Math.floor((top - full.y) * pixelScaleY));
  const lastX = Math.min(fullBufferWidth, Math.ceil((right - full.x) * pixelScaleX));
  const lastY = Math.min(fullBufferHeight, Math.ceil((bottom - full.y) * pixelScaleY));
  return {
    visible: true,
    surface: { x: full.x + firstX / pixelScaleX, y: full.y + firstY / pixelScaleY, width: (lastX - firstX) / pixelScaleX, height: (lastY - firstY) / pixelScaleY },
    bufferWidth: lastX - firstX, bufferHeight: lastY - firstY, fullBufferWidth, fullBufferHeight,
  };
}
