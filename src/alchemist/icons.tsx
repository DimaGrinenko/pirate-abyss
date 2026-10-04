import type { CSSProperties } from 'react';
import { assetUrl } from './assets';

const ASSET_BASE = assetUrl('alchemist/ui/icons/');
const CREAM_ASSET_BASE = assetUrl('alchemist/ui/v35/icons/');
const CREAM_ICONS = new Set<IconName>(['spin', 'stop', 'plus', 'minus', 'close', 'play', 'reset', 'settings', 'sound', 'muted', 'auto', 'turbo', 'spark', 'info']);
export type IconName = 'sound' | 'muted' | 'settings' | 'info' | 'close' | 'spin' | 'turbo' | 'auto' | 'minus' | 'plus' | 'flask' | 'play' | 'stop' | 'spark' | 'reset';
/** Generated bitmap glyphs. Small interface actions use calm cream silhouettes. */
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <img src={`${CREAM_ICONS.has(name) ? CREAM_ASSET_BASE : ASSET_BASE}${name}.webp`} alt="" aria-hidden="true" draggable={false} width={size} height={size} style={{ display: 'block', objectFit: 'contain', flex: 'none', ...style }} />;
}
