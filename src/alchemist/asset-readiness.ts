/** Decode once and retain the image used by startup and later decorative scenes.
 * A valid loaded image is also drawable if the browser's optional decode job
 * rejects or stalls; that optimization must not become a fatal startup error. */
const decodedImages = new Map<string, Promise<HTMLImageElement>>();
const preparedImages = new Map<string, HTMLImageElement>();
/** Reuse the exact decoded image for reel drawing after startup. */
export function preparedImage(url: string) { return preparedImages.get(url); }
export function decodedImage(url: string): Promise<HTMLImageElement> {
  let pending = decodedImages.get(url);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      let settled = false, decoding = false;
      let networkTimer: number | undefined, decodeTimer: number | undefined;
      const drawable = () => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      const finish = (failure?: Error) => {
        if (settled) return;
        const error = failure ?? (drawable() ? undefined : new Error(`Empty image: ${url}`));
        settled = true;
        if (networkTimer !== undefined) window.clearTimeout(networkTimer);
        if (decodeTimer !== undefined) window.clearTimeout(decodeTimer);
        image.onload = null; image.onerror = null;
        if (error) {
          // Stop a truly stalled request. Captured, already queued callbacks
          // still encounter the settlement guard and cannot publish stale data.
          image.src = '';
          reject(error);
        } else {
          preparedImages.set(url, image);
          resolve(image);
        }
      };
      const decode = () => {
        if (settled || decoding) return;
        if (!drawable()) { finish(new Error(`Empty image: ${url}`)); return; }
        decoding = true;
        if (networkTimer !== undefined) window.clearTimeout(networkTimer);
        networkTimer = undefined;
        // Start this budget only once the download is complete. Returning the
        // already loaded image is the same fallback as a rejected decode().
        decodeTimer = window.setTimeout(() => finish(), 10000);
        try { void image.decode().then(() => finish(), () => finish()); }
        catch { finish(); }
      };
      image.onload = decode;
      image.onerror = () => finish(new Error(`Image unavailable: ${url}`));
      networkTimer = window.setTimeout(() => {
        networkTimer = undefined;
        // Long synchronous Spine work can delay delivery of onload beyond this
        // timer. Inspect the image itself before declaring its network failed.
        if (drawable()) decode();
        else finish(new Error(`Image download timed out: ${url}`));
      }, 20000);
      image.src = url;
      if (drawable()) decode();
    }).catch(error => { decodedImages.delete(url); throw error; });
    decodedImages.set(url, pending);
  }
  return pending;
}

/** Let the loading UI paint between synchronous Spine parses. No changes to
 * animation data, resolution or running scene clocks are involved. */
export function yieldAssetPaint(): Promise<void> {
  return new Promise(resolve => {
    if (document.hidden) { window.setTimeout(resolve, 0); return; }
    let settled = false;
    let frame: number | undefined, afterPaint: number | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safety);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (afterPaint !== undefined) window.clearTimeout(afterPaint);
      resolve();
    };
    const safety = window.setTimeout(finish, 100);
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      if (!settled) afterPaint = window.setTimeout(finish, 0);
    });
  });
}

let assetWork: Promise<unknown> = Promise.resolve();
export function prepareAssetWork<T>(work: () => T): Promise<T> {
  const next = assetWork.catch(() => undefined).then(yieldAssetPaint).then(work);
  assetWork = next;
  return next;
}

export async function prepareImages(urls: readonly string[], onReady: () => void, concurrency = 8) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (cursor < urls.length) { const url = urls[cursor++]; await decodedImage(url); onReady(); }
  }));
}
