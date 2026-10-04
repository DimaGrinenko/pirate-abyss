import { memo, useEffect, useState, type ImgHTMLAttributes } from 'react';
import { getPreparedTintedRaster, prepareTintedRaster, TINTED_RASTER_SPECS, type TintedRasterVariant } from './tinted-raster';

type TintedRasterImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & { tint: TintedRasterVariant };

/** Preserve the caller's CSS-filtered original until a decoded replacement is
 * ready. Changing src keeps the same element, animation phase and geometry. */
export const TintedRasterImage = memo(function TintedRasterImage({ tint, style, ...props }: TintedRasterImageProps) {
  const [prepared, setPrepared] = useState(() => getPreparedTintedRaster(tint));
  const cached = prepared?.variant === tint ? prepared : getPreparedTintedRaster(tint);
  useEffect(() => {
    let active = true;
    void prepareTintedRaster(tint).then(result => { if (active && result) setPrepared(result); });
    return () => { active = false; };
  }, [tint]);
  return <img {...props} src={cached?.url ?? TINTED_RASTER_SPECS[tint].source}
    data-raster-tinted={Boolean(cached)} style={{ ...style, filter: cached ? 'none' : style?.filter }} />;
});
