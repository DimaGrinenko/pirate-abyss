import { PAYLINES, SYMBOLS } from './engine';
import type { Board } from './engine';
import { createCourseState, stepCaptainsCourse, type CourseEvent } from './captains-course-experiment';
import type { MathBook, UnitSpinResult } from './math/types';

export const COMPASS_MATH_VERSION = 'pirate-compass-captain-rc-v34-20260930';
export const COMPASS_MODE = 'captains_course' as const;
export interface CompassWireBook { id: number; payoutMultiplier: number; events: (CourseEvent & { index: number })[] }

/** An explicit loopback-only local development opt-in cannot enable a live bet. */
export function localCompassEnabled(launch: string): boolean {
  const url = new URL(launch);
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.searchParams.get('courseDev') === '1'
    && !url.searchParams.has('sessionID') && !url.searchParams.has('rgs_url') && url.searchParams.get('replay') !== 'true';
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(key => left[key] !== undefined), other = Object.keys(right).filter(key => right[key] !== undefined);
  return keys.length === other.length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

/** Lossless presentation adapter. Money is converted from integer hundredths of
 * a base bet to existing unit fields exactly once; wallet scaling happens later. */
export function courseUnitResult(event: CourseEvent): UnitSpinResult {
  const end = event.state.finished;
  return {
    board: structuredClone(event.board), expandedBoard: structuredClone(event.expandedBoard),
    expandedReels: [...event.expandedReels], activatedTypes: [], newlyActivatedTypes: [], scatters: event.scatters,
    wins: event.wins.map(win => ({ ...win, payout: win.payout / 100,
      basePayout: SYMBOLS.find(symbol => symbol.id === win.symbol)!.payouts[win.count - 3],
      positions: PAYLINES[win.line].slice(0, win.count).map((row, col) => ({ row, col })) })),
    payout: event.payout / 100, uncappedPayout: event.uncappedPayout / 100, cost: 0,
    bonusTriggered: null, extraSpins: event.extraSpins, bonusEnded: end, bonusTotalWin: event.state.raidWin / 100,
    capped: event.capped, playedMode: COMPASS_MODE,
    course: { targetBefore: event.targetBefore, targetAfter: event.targetAfter, advanced: event.courseAdvanced },
    state: { mode: end ? 'base' : COMPASS_MODE, freeSpins: event.state.spinsRemaining,
      bonusWin: event.state.raidWin / 100, roundWin: event.state.roundWin / 100,
      activatedTypes: [], totalSpins: event.sequence, lastWin: event.payout / 100,
      lastBonusWin: end ? event.state.raidWin / 100 : 0, courseTarget: end ? undefined : event.targetAfter },
  };
}

export function decodeCompassBook(value: unknown): MathBook {
  const book = value as CompassWireBook;
  if (!book || !Number.isSafeInteger(book.id) || book.id < 0 || !Number.isSafeInteger(book.payoutMultiplier)
    || book.payoutMultiplier < 0 || book.payoutMultiplier > 1_500_000 || book.payoutMultiplier % 10
    || !Array.isArray(book.events) || !book.events.length || book.events.length > 256) throw Error('Invalid Compass round');
  let state = createCourseState();
  const events = book.events.map((stored, index) => {
    if (!stored || stored.type !== 'captainsCourseSpin' || stored.index !== index) throw Error('Invalid Compass event sequence');
    const event = stepCaptainsCourse(state, stored.board);
    if (!equal(stored, { ...event, index })) throw Error('Compass event differs from published rules');
    state = event.state;
    return { index, type: 'alchemistSpin' as const, result: courseUnitResult(event) };
  });
  if (!state.finished || state.raidWin !== book.payoutMultiplier) throw Error('Incomplete or inconsistent Compass round');
  return { id: book.id, payoutMultiplier: book.payoutMultiplier, events };
}

/** Validate a materialized journal without resampling or re-crediting money. */
export function validateCompassPresentation(book: MathBook): void {
  let state = createCourseState();
  for (const stored of book.events) {
    const event = stepCaptainsCourse(state, stored.result.board as Board);
    if (!equal(stored.result, courseUnitResult(event))) throw Error('Saved Compass presentation differs from rules');
    state = event.state;
  }
  if (!state.finished || state.raidWin !== book.payoutMultiplier) throw Error('Invalid Compass presentation total');
}
