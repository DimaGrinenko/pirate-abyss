type SurfaceRenderer = { resolution: number; resize(width: number, height: number): void };

/** Preserve shaders and uploaded atlases while returning the unused full-size
 * colour/depth/MSAA target to the browser between presentations. */
export function parkRetainedSurface(renderer: SurfaceRenderer): void {
  renderer.resolution = 1;
  renderer.resize(32, 18);
}

/** Restore pixel density before resize and the first visible render. */
export function restoreRetainedSurface(renderer: SurfaceRenderer, width: number, height: number, devicePixelRatio: number): void {
  renderer.resolution = Math.min(devicePixelRatio || 1, 2);
  renderer.resize(width, height);
}
