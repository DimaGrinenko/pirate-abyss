import { COLS, ROWS, SYMBOLS } from './engine';
import type { Board, BonusMode } from './engine';

/** A purchased feature's introductory display, not an additional paid outcome.
 * It neither consumes a free spin nor evaluates/credits an extra line payout. */
export function purchasedBonusTriggerBoard(mode: BonusMode): Board {
  const board: Board = Array.from({ length: COLS }, (_, col) =>
    Array.from({ length: ROWS }, (_, row) => ({ id: SYMBOLS[(col * 3 + row * 2) % SYMBOLS.length].id })));
  // Compass is purchase-only. Never depict a fabricated Scatter trigger.
  if (mode === 'captains_course') { board[1][2] = { id: 'retort' }; return board; }
  const count = mode === 'reckoning' ? 4 : 3;
  for (let col = 1; col <= count; col++) board[col][(col + 1) % ROWS] = { id: 'scatter' };
  return board;
}
