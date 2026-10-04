import { assetUrl } from './assets';

/** Shared by startup and the living award so its first visible frame already
 * has decoded art. A failed decoration never blocks a round or continuation. */
export const CABIN_BONUS_ART = {
  frame: assetUrl('alchemist/ui/cabin-frame-v42.webp'),
  helm: assetUrl('alchemist/ui/bonus-helm-v38.webp'),
  water: assetUrl('alchemist/ui/bonus-water-v38.webp'),
  ring: assetUrl('alchemist/ui/bonus-orbit-v38.webp'),
  mist: assetUrl('alchemist/effects/parts/sea-mist-v23.webp'),
  chest: assetUrl('alchemist/altar/guardian-v41/side-poster.webp'),
  treasure: assetUrl('alchemist/ui/bonus-gold-v39.webp'),
  depth: assetUrl('alchemist/ui/bonus-depth-v41.webp'),
  bubble: assetUrl('alchemist/ui/bonus-bubble-v41.webp'),
  ray: assetUrl('alchemist/ui/bonus-ray-v41.webp'),
} as const;
