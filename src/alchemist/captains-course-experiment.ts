/**
 * Deterministic rules for the separately versioned Compass candidate. Default
 * released modes remain unchanged; runtime support is explicitly gated by the
 * session. This module has no RNG, wallet operations or mode registration.
 * Amounts are integer hundredths of ONE base bet, independent of entry cost.
 */
import { COLS, INITIAL_FREE_SPINS, MAX_WIN_MULTIPLIER, PAYLINES, ROWS, SYMBOLS, WILD_TYPES, validateBoard,
  type Board, type Cell, type SymbolId } from './engine';

export const CAPTAINS_COURSE_RELEASED = false;
export const COURSE_REELS = [1, 2, 3, 4] as const;
export type CourseReel = typeof COURSE_REELS[number];
export const COURSE_CAP = MAX_WIN_MULTIPLIER * 100;

export interface CourseState {
  /** Zero-based reel, visible before the next result is revealed. */
  targetReel: CourseReel;
  spinsRemaining: number;
  spinsPlayed: number;
  /** The full paid round includes any entry-spin payout. */
  roundWin: number;
  raidWin: number;
  finished: boolean;
}
export interface CourseLineWin {
  line: number;
  symbol: SymbolId;
  count: number;
  multiplier: number;
  /** Before the round cap, in hundredths of the base bet. */
  payout: number;
}
export interface CourseEvent {
  type: 'captainsCourseSpin';
  /** One-based within this raid; this is the separate Compass event contract. */
  sequence: number;
  targetBefore: CourseReel;
  targetAfter: CourseReel;
  board: Board;
  expandedBoard: Board;
  expandedReels: number[];
  wins: CourseLineWin[];
  uncappedPayout: number;
  payout: number;
  scatters: number;
  extraSpins: number;
  courseAdvanced: boolean;
  capped: boolean;
  state: CourseState;
}

const symbols = new Map<SymbolId, typeof SYMBOLS[number]>(SYMBOLS.map(symbol => [symbol.id, symbol]));
const clone = (board: Board): Board => board.map(reel => reel.map(cell => ({ ...cell })));
const isNormal = (cell: Cell): cell is Cell & { id: SymbolId } => symbols.has(cell.id as SymbolId);
function integer(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`${name} must be a non-negative safe integer`);
}
function validateState(state: CourseState) {
  if (!COURSE_REELS.includes(state.targetReel)) throw Error('Compass must point to a central reel');
  for (const key of ['spinsRemaining', 'spinsPlayed', 'roundWin', 'raidWin'] as const) integer(state[key], key);
  if (state.roundWin > COURSE_CAP || state.raidWin > state.roundWin) throw Error('Invalid course totals');
  if (state.finished !== (state.spinsRemaining === 0)) throw Error('Invalid course completion state');
  if (state.roundWin === COURSE_CAP && !state.finished) throw Error('Capped course must be finished');
}

/** A prospective natural trigger may pass its paid entry result into the cap.
 * This does not debit a balance or invent an entry/price/trigger probability. */
export function createCourseState(entryRoundWin = 0): CourseState {
  integer(entryRoundWin, 'Entry payout');
  if (entryRoundWin > COURSE_CAP) throw Error('Entry payout exceeds round cap');
  const finished = entryRoundWin === COURSE_CAP;
  return { targetReel: 1, spinsRemaining: finished ? 0 : INITIAL_FREE_SPINS, spinsPlayed: 0,
    roundWin: entryRoundWin, raidWin: 0, finished };
}

function evaluateLines(board: Board): CourseLineWin[] {
  const wins: CourseLineWin[] = [];
  PAYLINES.forEach((rows, line) => {
    const first = board[0][rows[0]];
    if (!isNormal(first)) return;
    let count = 1;
    let wildSum = 0;
    for (let col = 1; col < COLS; col++) {
      const cell = board[col][rows[col]];
      if (cell.id !== first.id && cell.id !== 'wild') break;
      count++;
      if (cell.id === 'wild') wildSum += cell.multiplier!;
    }
    if (count < 3) return;
    const multiplier = wildSum || 1;
    const basePayout = Math.round(symbols.get(first.id)!.payouts[count - 3] * 100);
    wins.push({ line, symbol: first.id, count, multiplier, payout: basePayout * multiplier });
  });
  return wins;
}

/** Consume a supplied natural board. Never reinterpret the five existing modes
 * with these rules: the extra expansion changes their mathematics. */
export function stepCaptainsCourse(state: CourseState, suppliedBoard: Board): CourseEvent {
  validateState(state);
  if (state.finished) throw Error('The course has already finished');
  if (state.spinsPlayed === Number.MAX_SAFE_INTEGER) throw Error('Spin count overflow');
  validateBoard(suppliedBoard);
  const board = clone(suppliedBoard);
  const candidates = board.flatMap((reel, col) => {
    const wild = reel.find(cell => cell.id === 'wild');
    return wild && (col === state.targetReel || WILD_TYPES[wild.wildType!].linkedReel === col)
      ? [{ col, wild }] : [];
  });
  // As in the shipped modes, candidates are evaluated simultaneously so that
  // two compatible expansions can create a win together. Non-winning reels stay closed.
  const hypothetical = clone(board);
  candidates.forEach(({ col, wild }) => { hypothetical[col] = Array.from({ length: ROWS }, () => ({ ...wild })); });
  const potentialWins = evaluateLines(hypothetical);
  const expandedReels = candidates.filter(({ col }) => potentialWins.some(win => col < win.count)).map(({ col }) => col);
  const expandedBoard = clone(board);
  candidates.forEach(({ col, wild }) => {
    if (expandedReels.includes(col)) expandedBoard[col] = Array.from({ length: ROWS }, () => ({ ...wild }));
  });
  const wins = evaluateLines(expandedBoard);
  const uncappedPayout = wins.reduce((sum, win) => sum + win.payout, 0);
  const payout = Math.min(uncappedPayout, COURSE_CAP - state.roundWin);
  const roundWin = state.roundWin + payout;
  const capped = roundWin === COURSE_CAP;
  const scatters = board.flat().filter(cell => cell.id === 'scatter').length;
  const extraSpins = capped ? 0 : scatters === 2 ? 2 : scatters >= 3 ? 4 : 0;
  const spinsRemaining = capped ? 0 : state.spinsRemaining - 1 + extraSpins;
  const finished = spinsRemaining === 0;
  // No promise of a future target on the final/capped spin.
  const courseAdvanced = !finished && expandedReels.includes(state.targetReel);
  const targetAfter: CourseReel = courseAdvanced ? COURSE_REELS[state.targetReel % COURSE_REELS.length] : state.targetReel;
  const next: CourseState = { targetReel: targetAfter, spinsRemaining, spinsPlayed: state.spinsPlayed + 1,
    roundWin, raidWin: state.raidWin + payout, finished };
  validateState(next);
  return { type: 'captainsCourseSpin', sequence: next.spinsPlayed, targetBefore: state.targetReel, targetAfter,
    board, expandedBoard, expandedReels, wins, uncappedPayout, payout, scatters, extraSpins,
    courseAdvanced, capped, state: next };
}

/** Deterministic replay validation for candidate books; no acceptance of
 * arbitrary visual state or a summary that does not match its entire path. */
export function replayCaptainsCourse(boards: readonly Board[], entryRoundWin = 0) {
  let state = createCourseState(entryRoundWin);
  const events: CourseEvent[] = [];
  for (const board of boards) {
    const event = stepCaptainsCourse(state, board);
    events.push(event);
    state = event.state;
  }
  return { events, state, complete: state.finished };
}
