import type { Board, WildType } from './engine';

/** A visible curtain owns its crest; a closed lane shows its original captain. */
export function reelCrestType(homeType: WildType, col: number, board: Board | undefined, expanded: readonly number[], openingReel: number | null): WildType {
  if (!expanded.includes(col) && openingReel !== col) return homeType;
  return board?.[col]?.find(cell => cell.id === 'wild')?.wildType ?? homeType;
}
