import { assetUrl } from './assets';

/** Spine data, spinning-strip bitmaps and gallery thumbnails share one art revision. */
export const SYMBOL_ART_REVISION = 'material-motion15';

export function symbolImageUrl(id: string): string {
  return `${assetUrl(`alchemist/symbols/${id}.webp`)}?v=${SYMBOL_ART_REVISION}`;
}
