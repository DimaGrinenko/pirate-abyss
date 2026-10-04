import { assetUrl } from './assets';
import { decodedImage, prepareAssetWork } from './asset-readiness';
import { AsyncAssetLane } from './async-asset-lane';

const caustic = assetUrl('alchemist/effects/parts/caustic.png');
const cabinLight = assetUrl('alchemist/environment/cabin-light-v21.webp');

/** Only fixed colour transforms belong here. Blur, shadows and animated filters
 * stay in CSS because baking them at native size would change their geometry. */
export const TINTED_RASTER_SPECS = {
  'reel-2': { source: caustic, filter: 'hue-rotate(160deg) saturate(.7)' },
  'reel-3': { source: caustic, filter: 'hue-rotate(220deg) saturate(.55)' },
  'reel-4': { source: caustic, filter: 'hue-rotate(320deg)' },
  'cabin-floor': { source: cabinLight, filter: 'sepia(.65) saturate(1.5) hue-rotate(330deg)' },
  'cabin-wall': { source: cabinLight, filter: 'sepia(1) saturate(1.75)' },
  'cabin-candle': { source: cabinLight, filter: 'sepia(1) saturate(2.2)' },
  'wall-warm-cast': { source: cabinLight, filter: 'sepia(1) saturate(1.8)' },
  'wall-paper-light': { source: cabinLight, filter: 'sepia(.7) saturate(1.2)' },
  'captain-ground-shadow': { source: cabinLight, filter: 'brightness(0)' },
} as const;
export type TintedRasterVariant = keyof typeof TINTED_RASTER_SPECS;
export type PreparedTintedRaster = Readonly<{ variant: TintedRasterVariant; url: string }>;

// Three 556x420 caustics and six 408x408 lights: 1,699,344 RGBA pixels
// (6.48 MiB), plus PNG blobs. No atlas or viewport-sized raster is copied.
const pending = new Map<TintedRasterVariant, Promise<PreparedTintedRaster | null>>();
const ready = new Map<TintedRasterVariant, PreparedTintedRaster>();
const sources = new Map<string, Promise<HTMLImageElement>>();
const decodedVariants = new Map<TintedRasterVariant, HTMLImageElement>();
const blobUrls = new Set<string>();
let filtersSupported: boolean | undefined;
let disposed = false;
const tintLane = new AsyncAssetLane(prepareAssetWork);

function supportsColourFilters() {
  if (filtersSupported !== undefined) return filtersSupported;
  filtersSupported = false;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  try {
    const context = canvas.getContext('2d');
    if (!context || !('filter' in context)) return false;
    // Some engines expose the property without applying it. One startup pixel
    // verifies the operation; there are no runtime image or layout reads.
    context.filter = 'grayscale(1)';
    context.fillStyle = '#f00';
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    filtersSupported = red > 0 && Math.abs(red - green) <= 1 && Math.abs(red - blue) <= 1 && alpha === 255;
    return filtersSupported;
  } finally { canvas.width = canvas.height = 0; }
}

async function renderTintedRaster(variant: TintedRasterVariant, source: HTMLImageElement): Promise<PreparedTintedRaster | null> {
  if (disposed) return null;
  const { naturalWidth: width, naturalHeight: height } = source;
  // Keep accidental future large sources out of the startup/memory budget.
  if (!width || !height || width > 768 || height > 768 || width * height > 262144) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  let url: string | undefined;
  try {
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.filter = TINTED_RASTER_SPECS[variant].filter;
    if (context.filter === 'none') return null;
    context.drawImage(source, 0, 0);
    // Lossless encoding preserves the source alpha. One native-sized canvas is
    // live at a time; animation remains the existing CSS transform/opacity.
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Tinted raster encoding timed out')), 5000);
      canvas.toBlob(value => { window.clearTimeout(timer); resolve(value); }, 'image/png');
    });
    if (!blob || disposed) return null;
    url = URL.createObjectURL(blob); blobUrls.add(url);
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      // Optional colour caching must never strand the shared preparation queue.
      const timer = window.setTimeout(() => {
        image.src = '';
        reject(new Error('Tinted raster decode timed out'));
      }, 2000);
      image.decode().then(() => { window.clearTimeout(timer); resolve(); }, error => { window.clearTimeout(timer); reject(error); });
    });
    if (disposed || image.naturalWidth !== width || image.naturalHeight !== height) return null;
    const result = { variant, url };
    decodedVariants.set(variant, image);
    ready.set(variant, result);
    url = undefined; // The page cache now owns the decoded image and its URL.
    return result;
  } finally {
    canvas.width = canvas.height = 0;
    if (url) { URL.revokeObjectURL(url); blobUrls.delete(url); }
  }
}

export function getPreparedTintedRaster(variant: TintedRasterVariant) {
  return ready.get(variant);
}

/** Failure is cached too: unsupported browsers keep the original CSS rendering
 * and remounting scenes never starts another encode or retry loop. */
export function prepareTintedRaster(variant: TintedRasterVariant): Promise<PreparedTintedRaster | null> {
  let work = pending.get(variant);
  if (!work) {
    work = Promise.resolve().then(async () => {
      if (disposed || !supportsColourFilters()) return null;
      const { source } = TINTED_RASTER_SPECS[variant];
      let image = sources.get(source);
      if (!image) { image = decodedImage(source); sources.set(source, image); }
      const decoded = await image;
      return await tintLane.run(() => renderTintedRaster(variant, decoded));
    }).catch(() => null);
    pending.set(variant, work);
  }
  return work;
}

/** Optional startup work; originals remain a complete fallback on any failure. */
export async function preloadTintedScenery(): Promise<void> {
  await Promise.all((Object.keys(TINTED_RASTER_SPECS) as TintedRasterVariant[]).map(prepareTintedRaster));
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls.clear(); decodedVariants.clear(); ready.clear(); pending.clear(); sources.clear();
});
