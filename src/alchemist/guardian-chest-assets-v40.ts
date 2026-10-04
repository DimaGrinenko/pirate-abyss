import {assetUrl} from './assets';
import {CHEST_MATERIALS} from './guardian-chest-v40';
export const GUARDIAN_CHEST_MATERIALS = Object.fromEntries(CHEST_MATERIALS.map(name=>[name,assetUrl('alchemist/altar/guardian-v41/'+name+'.webp')]));
export const GUARDIAN_CHEST_POSTER = assetUrl('alchemist/altar/guardian-v41/open-poster.webp');
export const GUARDIAN_SIDE_CHEST = assetUrl('alchemist/altar/guardian-v41/side-poster.webp');
