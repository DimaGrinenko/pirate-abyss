import boards from './million-demo-boards.json';
import { createState, demoBoard, spin } from './engine';
import type { Board } from './engine';

export const MILLION_DEMO_KEY = 'pirate-abyss.one-shot-million.claimed.v1';
type DemoStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function millionDemoAvailable(storage: DemoStorage): boolean {
  try { return storage.getItem(MILLION_DEMO_KEY) === null; } catch { return false; }
}
/** Claim before playing. Cancelling or reloading must not grant another show. */
export function claimMillionDemo(storage: DemoStorage): boolean {
  try {
    if (!millionDemoAvailable(storage)) return false;
    storage.setItem(MILLION_DEMO_KEY, 'claimed');
    return storage.getItem(MILLION_DEMO_KEY) === 'claimed';
  } catch { return false; }
}
/** Explicit local preview, never passed to RoundSession or an RGS response.
 * Every payout comes from the unchanged engine and the actual shown board.
 */
export function createMillionDemo() {
  const initial = createState(10000, 100);
  let state = spin(initial, { forcedBoard: demoBoard('devastation') }).state;
  const outcomes = boards.map(fixture => {
    const outcome = spin(state, { forcedBoard: fixture.board as Board });
    if (outcome.payout !== fixture.payout) throw new Error('Million preview fixture no longer matches the paytable');
    state = outcome.state;
    return outcome;
  });
  if (outcomes.length !== 10 || state.lastBonusWin !== 1000000 || state.freeSpins !== 0) throw new Error('Million preview must finish exactly ten free spins at one million CR');
  return { initial, outcomes, index: 0 };
}
