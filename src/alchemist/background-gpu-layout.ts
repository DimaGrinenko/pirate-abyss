export const BACKGROUND_WORLD = { width: 1672, height: 941 } as const;

/** The existing CSS host already covers the viewport; keep its centred camera. */
export function backgroundGpuLayout(width: number, height: number, devicePixelRatio: number) {
  const w = Math.max(1, width), h = Math.max(1, height);
  return {
    width: w, height: h,
    resolution: Math.min(devicePixelRatio || 1, 1.25),
    scale: Math.min(w / BACKGROUND_WORLD.width, h / BACKGROUND_WORLD.height),
    x: w / 2, y: h / 2,
  };
}

/** The cover host can be several screens wide in portrait. Its CSS parent
 * clips those pixels anyway, so allocate only that visible central rectangle.
 * Outward snapping keeps the original device-pixel grid and edge coverage. */
export function visibleBackgroundSurface(layout: ReturnType<typeof backgroundGpuLayout>, visibleWidth: number, visibleHeight: number, resolution = layout.resolution) {
  const dpr = Number.isFinite(resolution) && resolution > 0 ? resolution : layout.resolution;
  const width = Math.min(layout.width, Math.max(1, visibleWidth || layout.width));
  const height = Math.min(layout.height, Math.max(1, visibleHeight || layout.height));
  const left = Math.floor((layout.width - width) * .5 * dpr) / dpr;
  const top = Math.floor((layout.height - height) * .5 * dpr) / dpr;
  const right = Math.min(layout.width, Math.ceil((layout.width + width) * .5 * dpr) / dpr);
  const bottom = Math.min(layout.height, Math.ceil((layout.height + height) * .5 * dpr) / dpr);
  return { width: right - left, height: bottom - top, left, top, x: layout.x - left, y: layout.y - top, scale: layout.scale };
}
