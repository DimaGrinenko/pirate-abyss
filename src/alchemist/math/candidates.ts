/** Constructive, deterministic books. Every payout is derived from a valid board. */
import {
  COLS, ROWS, SYMBOLS, WILD_ORDER, WILD_TYPES, MAX_WIN_MULTIPLIER,
  buyBonus, createState, generateBoard, spin,
  type Board, type Cell, type FeatureMode, type RNG, type SpinResult, type SymbolId, type WildType,
} from '../engine';
import { PAYOUT_SCALE } from './config';
import type { MathBook, MathMode, MathSpinEvent, UnitSpinResult } from './types';

export type CandidateCategory = 'random' | 'reaction' | 'zero' | 'common' | 'medium' | 'large' | 'tail' | 'cap';
type PayoutCategory = Exclude<CandidateCategory, 'random' | 'reaction'>;
export interface CandidateOptions {
  /** Desired payout in underlying base bets. Base boards choose the nearest reachable value; buys compose exact tenths. */
  targetPayout?: number;
}
interface Recipe { symbol: SymbolId; count: number; payout: number; wilds: { col: number; type: WildType; multiplier: number }[] }
const CAP = MAX_WIN_MULTIPLIER * PAYOUT_SCALE;
const NORMAL = SYMBOLS.map(symbol => symbol.id);
const pick = <T>(items: readonly T[], rng: RNG): T => items[Math.floor(rng() * items.length)];
const shuffle = <T>(items: readonly T[], rng: RNG): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
/** Each book has its own bounded uint32 stream, independent of generation order. */
export function candidateRng(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function wild(type: WildType, multiplier: number): Cell { return { id: 'wild', wildType: type, multiplier }; }
function randomWild(rng: RNG, col: number, offReel = false): Cell {
  const type = pick(WILD_ORDER.filter(t => !offReel || WILD_TYPES[t].linkedReel !== col), rng);
  return wild(type, pick(WILD_TYPES[type].multipliers, rng));
}
function bounds(mode: MathMode, category: PayoutCategory): [number, number] {
  const bonus = mode === 'devastation' || mode === 'reckoning';
  if (category === 'zero') return [0, 0];
  if (category === 'cap') return [CAP, CAP];
  if (category === 'common') return [10, bonus ? 1000 : 200];
  if (category === 'medium') return [bonus ? 1010 : 210, bonus ? 10000 : 2000];
  if (category === 'large') return [bonus ? 10010 : 2010, bonus ? 100000 : 50000];
  return [bonus ? 100010 : 50010, CAP - 10];
}
export function classifyCandidate(mode: MathMode, payoutMultiplier: number): PayoutCategory {
  if (payoutMultiplier === 0) return 'zero';
  if (payoutMultiplier >= CAP) return 'cap';
  for (const category of ['common', 'medium', 'large', 'tail'] as const) if (payoutMultiplier <= bounds(mode, category)[1]) return category;
  return 'tail';
}

/** First two reels use disjoint palettes: later Wild expansions cannot bridge that mismatch. */
function zeroBoard(rng: RNG, feature: FeatureMode = 'standard', decorate = true, scatterCount = 0): Board {
  const palette = shuffle(NORMAL, rng), first = palette.slice(0, 3), rest = palette.slice(3);
  const board: Board = Array.from({ length: COLS }, (_, col) => Array.from({ length: ROWS }, () => ({ id: pick(col === 0 ? first : rest, rng) })));
  if (feature === 'catalysts') {
    for (const col of [2, 3, 4]) board[col][Math.floor(rng() * ROWS)] = randomWild(rng, col);
  } else if (scatterCount) {
    for (const col of shuffle([1, 2, 3, 4], rng).slice(0, scatterCount)) board[col][Math.floor(rng() * ROWS)] = { id: 'scatter' };
  } else if (decorate) {
    // A blue activation may be silent; reel 3 remains a nonmatching normal barrier.
    if (rng() < .18) {
      board[1][Math.floor(rng() * ROWS)] = wild('blue', pick(WILD_TYPES.blue.multipliers, rng));
      for (const col of [3, 4]) if (rng() < .35) board[col][Math.floor(rng() * ROWS)] = randomWild(rng, col);
    } else for (const col of [2, 3, 4]) if (rng() < .4) board[col][Math.floor(rng() * ROWS)] = randomWild(rng, col);
  }
  return board;
}

/** Single-line recipes enumerate actual legal Wild sums. No payout is invented. */
const recipes = new Map<number, Recipe[]>();
for (let count = 3; count <= 6; count++) {
  let sums = new Map<number, Recipe['wilds']>([[0, []]]);
  for (let col = 1; col < Math.min(count, 5); col++) {
    const next = new Map(sums);
    for (const [sum, cells] of sums) for (const type of WILD_ORDER) {
      if (WILD_TYPES[type].linkedReel === col) continue;
      for (const multiplier of WILD_TYPES[type].multipliers) {
        const total = sum + multiplier;
        if (!next.has(total)) next.set(total, [...cells, { col, type, multiplier }]);
      }
    }
    sums = next;
  }
  for (const symbol of SYMBOLS) for (const [sum, wilds] of sums) {
    const payout = Math.round(symbol.payouts[count - 3] * (sum || 1) * PAYOUT_SCALE);
    if (payout > CAP) continue;
    const list = recipes.get(payout) ?? [];
    list.push({ symbol: symbol.id, count, payout, wilds }); recipes.set(payout, list);
  }
}
const reachable = [...recipes.keys()].sort((a, b) => a - b);
function floorIndex(value: number): number {
  let left = 0, right = reachable.length;
  while (left < right) { const middle = (left + right) >>> 1; if (reachable[middle] <= value) left = middle + 1; else right = middle; }
  return Math.max(0, left - 1);
}
function chooseRecipe(target: number, min: number, max: number, rng: RNG, below = false): Recipe {
  let index = floorIndex(Math.min(target, max));
  if (reachable[index] < min) index++;
  if (!below && index + 1 < reachable.length && reachable[index + 1] <= max && Math.abs(reachable[index + 1] - target) < Math.abs(reachable[index] - target)) index++;
  const value = reachable[index];
  if (value < min || value > max) throw new Error(`No reachable single-line payout in ${min}…${max}`);
  return pick(recipes.get(value)!, rng);
}
function recipeBoard(recipe: Recipe, rng: RNG, feature: FeatureMode): Board {
  const row = Math.floor(rng() * ROWS);
  const palette = shuffle(NORMAL.filter(id => id !== recipe.symbol), rng), first = palette.slice(0, 2), rest = palette.slice(2);
  const board: Board = Array.from({ length: COLS }, (_, col) => Array.from({ length: ROWS }, () => ({ id: pick(col === 0 ? first : rest, rng) })));
  for (let col = 0; col < recipe.count; col++) board[col][row] = { id: recipe.symbol };
  for (const cell of recipe.wilds) board[cell.col][row] = wild(cell.type, cell.multiplier);
  if (feature === 'catalysts') {
    let count = recipe.wilds.length;
    // Never add an early Wild if two late, nonparticipating Wilds suffice.
    for (const col of [4, 3, 2, 1]) {
      if (count >= 3) break;
      if (recipe.wilds.some(cell => cell.col === col)) continue;
      const otherRows = [0, 1, 2, 3, 4].filter(r => r !== row);
      board[col][pick(otherRows, rng)] = randomWild(rng, col, true); count++;
    }
  }
  return board;
}
function capBoard(rng: RNG): Board {
  const board: Board = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => ({ id: 'elixir' })));
  for (let col = 1; col <= 4; col++) { const type = WILD_ORDER[col - 1]; board[col][Math.floor(rng() * ROWS)] = wild(type, Math.max(...WILD_TYPES[type].multipliers)); }
  return board;
}
function curtainBoard(rng: RNG, feature: FeatureMode): Board {
  const board = generateBoard(rng, 'base', 'standard');
  for (let col = 1; col <= 4; col++) for (let row = 0; row < ROWS; row++) if (board[col][row].id === 'wild' || board[col][row].id === 'scatter') board[col][row] = { id: pick(NORMAL, rng) };
  const columns = shuffle([1, 2, 3, 4], rng).slice(0, feature === 'catalysts' ? 3 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3));
  const target = pick(SYMBOLS.slice(0, 5), rng).id;
  for (let row = 0; row < ROWS; row++) if (rng() < .4) { board[0][row] = { id: target }; board[5][row] = { id: target }; }
  for (const col of columns) { const type = WILD_ORDER[col - 1]; board[col][Math.floor(rng() * ROWS)] = wild(type, pick(WILD_TYPES[type].multipliers, rng)); }
  return board;
}
function unitResult(result: SpinResult): UnitSpinResult {
  const { balance: _balance, bet: _bet, ...state } = result.state;
  void _balance; void _bet;
  return { ...result, state };
}
function event(result: SpinResult, index: number): MathSpinEvent { return { index, type: 'alchemistSpin', result: unitResult(result) }; }
function book(id: number, events: MathSpinEvent[]): MathBook {
  const payoutMultiplier = Math.round(events.reduce((total, item) => total + item.result.payout, 0) * PAYOUT_SCALE);
  if (payoutMultiplier < 0 || payoutMultiplier > CAP) throw new Error('Book cap invariant failed');
  return { id: id >>> 0, payoutMultiplier, events };
}
function requestedTarget(mode: MathMode, category: PayoutCategory, rng: RNG, requested?: number): number {
  if (requested !== undefined) {
    if (!Number.isFinite(requested) || requested < 0 || requested > MAX_WIN_MULTIPLIER) throw new Error('Target payout must be finite and between 0 and 15000');
    return Math.round(requested * 10) * 10;
  }
  const [min, max] = bounds(mode, category);
  if (min === max) return min;
  return Math.round(Math.exp(Math.log(min) + rng() * (Math.log(max) - Math.log(min))) / 10) * 10;
}
function randomBook(mode: MathMode, seed: number, rng: RNG): MathBook {
  const bonus = mode === 'devastation' || mode === 'reckoning';
  const feature: FeatureMode = mode === 'bonushunt' || mode === 'catalysts' ? mode : 'standard';
  let state = bonus ? buyBonus(createState(1_000_000), mode) : createState(1_000_000);
  const events: MathSpinEvent[] = [];
  do {
    let board = generateBoard(rng, state.mode, feature);
    // Natural bonus books are assembled from the exact purchased FS library instead.
    if (!bonus) while (board.flat().filter(cell => cell.id === 'scatter').length >= 3) board = generateBoard(rng, state.mode, feature);
    const result = spin(state, { forcedBoard: board, feature }); events.push(event(result, events.length)); state = result.state;
    if (events.length > 256) throw new Error(`Unterminated random bonus, seed ${seed}`);
  } while (state.mode !== 'base');
  return book(seed, events);
}

/** A small winning curtain is useful even in an extremely volatile distribution. */
function smallReactionBoard(rng: RNG, feature: FeatureMode, type: WildType = 'blue', offLinked = false): Board {
  const board = recipeBoard({ symbol: 'lead', count: 3, payout: 10, wilds: [] }, rng, 'standard');
  const row = board[0].findIndex(cell => cell.id === 'lead');
  const col = offLinked && type === 'blue' ? 2 : 1;
  // The off-linked Wild starts outside the original winning line. Its eventual
  // participation therefore demonstrates a real persistent-type expansion.
  const otherRows = Array.from({ length: ROWS }, (_, r) => r).filter(r => r !== row);
  const multiplier = offLinked ? WILD_TYPES[type].multipliers[0] : pick(WILD_TYPES[type].multipliers, rng);
  board[col][pick(otherRows, rng)] = wild(type, multiplier);
  if (feature === 'catalysts') {
    // The two guaranteed late Wilds do not extend the cheap three-symbol win.
    const distantRows = otherRows.filter(r => Math.abs(r - row) >= 2);
    board[3][pick(distantRows, rng)] = randomWild(rng, 3, true);
    board[4][pick(otherRows, rng)] = randomWild(rng, 4, true);
  }
  return board;
}

/** Two to four linked curtains create genuine interacting, multiline results. */
function chainedReactionBoard(rng: RNG, feature: FeatureMode, high: boolean): Board {
  const starts: readonly SymbolId[] = high ? ['elixir', 'retort', 'crystal', 'flask', 'atom'] : ['lead', 'sulfur', 'copper', 'iron', 'mercury'];
  const stops: readonly SymbolId[] = high ? NORMAL : ['elixir', 'retort', 'crystal', 'flask', 'atom'];
  const board: Board = Array.from({ length: COLS }, (_, col) => Array.from({ length: ROWS }, () => ({ id: pick(col === 0 ? starts : stops, rng) })));
  const count = high ? 3 + Math.floor(rng() * 2) : 2 + (rng() < .35 ? 1 : 0);
  for (let col = 1; col <= count; col++) {
    const type = WILD_ORDER[col - 1], values = WILD_TYPES[type].multipliers;
    board[col][Math.floor(rng() * ROWS)] = wild(type, pick(high ? values : values.slice(0, 2), rng));
  }
  if (feature === 'catalysts' && count === 2) board[4][Math.floor(rng() * ROWS)] = randomWild(rng, 4, true);
  if (high && rng() < .6) for (let row = 0; row < ROWS; row++) if (rng() < .65) board[5][row] = { ...board[0][row] };
  return board;
}

/** Untargeted, varied choreography; the normal evaluator determines every win. */
function reactionBook(mode: MathMode, seed: number, rng: RNG): MathBook {
  const bonus = mode === 'devastation' || mode === 'reckoning';
  const feature: FeatureMode = mode === 'bonushunt' || mode === 'catalysts' ? mode : 'standard';
  const profile = (seed >>> 0) % 3; // inexpensive / intermediate / substantial chains
  let state = bonus ? buyBonus(createState(1_000_000), mode) : createState(1_000_000);
  if (!bonus) {
    const board = profile === 0 ? smallReactionBoard(rng, feature) : chainedReactionBoard(rng, feature, profile === 2);
    return book(seed, [event(spin(state, { forcedBoard: board, feature }), 0)]);
  }
  const events: MathSpinEvent[] = [];
  const activatedType = pick(WILD_ORDER, rng);
  const retriggerAt = rng() < .3 ? (mode === 'reckoning' ? 2 : 1) : -1;
  do {
    const index = events.length;
    let board: Board;
    if (mode === 'reckoning' && index === 0) {
      // Activation is caused by a linked landing, even when that spin loses.
      board = zeroBoard(rng, 'standard', false);
      board[WILD_TYPES[activatedType].linkedReel][Math.floor(rng() * ROWS)] = wild(activatedType, WILD_TYPES[activatedType].multipliers[0]);
    } else if (mode === 'reckoning' && index === 1) {
      board = smallReactionBoard(rng, 'standard', activatedType, true);
    } else if (index === retriggerAt) {
      board = zeroBoard(rng, 'standard', false, rng() < .5 ? 2 : 3);
    } else if (mode === 'devastation' && index === 2) {
      board = profile === 2 ? chainedReactionBoard(rng, 'standard', true) : smallReactionBoard(rng, 'standard');
    } else if (profile === 1 && index === (mode === 'reckoning' ? 4 : 6)) {
      board = chainedReactionBoard(rng, 'standard', false);
    } else if (profile === 2 && [3, 6, 9].includes(index)) {
      board = chainedReactionBoard(rng, 'standard', true);
    } else board = zeroBoard(rng);
    const result = spin(state, { forcedBoard: board });
    events.push(event(result, index)); state = result.state;
    if (events.length > 256) throw new Error(`Unterminated reaction bonus, seed ${seed}`);
  } while (state.mode !== 'base');
  return book(seed, events);
}

export function generateCandidate(mode: MathMode, seed: number, category: CandidateCategory = 'random', options: CandidateOptions = {}): MathBook {
  const rng = candidateRng(seed), bonus = mode === 'devastation' || mode === 'reckoning';
  const feature: FeatureMode = mode === 'bonushunt' || mode === 'catalysts' ? mode : 'standard';
  if (category === 'reaction') {
    if (options.targetPayout !== undefined) throw new Error('Reaction candidates do not accept targetPayout');
    return reactionBook(mode, seed, rng);
  }
  if (category === 'random' && options.targetPayout === undefined) return randomBook(mode, seed, rng);
  const target = requestedTarget(mode, category === 'random' ? 'tail' : category, rng, options.targetPayout);
  const resolved = classifyCandidate(mode, target);
  const interval = options.targetPayout !== undefined ? [10, CAP - 10] : bounds(mode, resolved);
  const events: MathSpinEvent[] = [];
  let state = bonus ? buyBonus(createState(1_000_000), mode) : createState(1_000_000);
  if (!bonus) {
    let board: Board;
    if (target === 0) board = zeroBoard(rng, feature);
    else if (target === CAP) board = capBoard(rng);
    else {
      board = recipeBoard(chooseRecipe(target, interval[0], interval[1], rng), rng, feature);
      // A bounded subset of higher buckets uses interacting real curtains.
      if (options.targetPayout === undefined && (resolved === 'large' || resolved === 'tail') && rng() < .45) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const alternate = curtainBoard(rng, feature), paid = spin(state, { forcedBoard: alternate, feature }).payout * PAYOUT_SCALE;
          if (paid >= interval[0] && paid <= interval[1]) { board = alternate; break; }
        }
      }
    }
    const result = spin(state, { forcedBoard: board, feature }); events.push(event(result, 0));
    const candidate = book(seed, events);
    if (options.targetPayout === undefined && category !== 'random' && classifyCandidate(mode, candidate.payoutMultiplier) !== category) throw new Error(`Candidate bucket mismatch ${mode}/${category}, seed ${seed}: ${candidate.payoutMultiplier}`);
    return candidate;
  }
  const burstAt = 2 + Math.floor(rng() * 5), retriggerAt = rng() < .18 ? 1 : -1;
  const planned: Recipe[] = [];
  if (target > 0 && target < CAP) {
    let remainder = target;
    for (let i = 0; remainder > 0 && i < 8; i++) { const recipe = chooseRecipe(remainder, 10, Math.min(remainder, CAP - 10), rng, true); planned.push(recipe); remainder -= recipe.payout; }
    if (remainder) throw new Error(`Unreachable bonus target ${target} (${remainder} remaining)`);
  }
  const firstBurst = Math.min(burstAt, Math.max(0, 10 - planned.length));
  let burst = 0;
  do {
    const index = events.length;
    let board: Board;
    if (index === firstBurst && target === CAP) board = capBoard(rng);
    else if (index >= firstBurst && burst < planned.length) board = recipeBoard(planned[burst++], rng, 'standard');
    else board = zeroBoard(rng, 'standard', target === 0 || index > firstBurst + planned.length, index === retriggerAt ? (rng() < .5 ? 2 : 3) : 0);
    const result = spin(state, { forcedBoard: board }); events.push(event(result, index)); state = result.state;
    if (events.length > 256) throw new Error(`Unterminated constructed bonus, seed ${seed}`);
  } while (state.mode !== 'base');
  const candidate = book(seed, events);
  if (candidate.payoutMultiplier !== target) throw new Error(`Constructed bonus target mismatch ${mode}, seed ${seed}: wanted ${target}, got ${candidate.payoutMultiplier}`);
  return candidate;
}

/** Reuse identical purchased FS boards; prepend a zero-paying natural trigger and recalculate all state. */
export function prependBonusTrigger(purchased: MathBook, feature: 'base' | 'bonushunt', seed: number): MathBook {
  const mode = purchased.events[0]?.result.playedMode;
  if (mode !== 'devastation' && mode !== 'reckoning') throw new Error('Expected a complete purchased bonus book');
  const rng = candidateRng(seed), spinFeature: FeatureMode = feature === 'bonushunt' ? 'bonushunt' : 'standard';
  const trigger = zeroBoard(rng, 'standard', false, mode === 'devastation' ? 3 : 4);
  let result = spin(createState(1_000_000), { forcedBoard: trigger, feature: spinFeature });
  if (result.payout !== 0 || result.bonusTriggered !== mode) throw new Error('Invalid natural bonus trigger');
  const events = [event(result, 0)];
  for (const original of purchased.events) {
    result = spin(result.state, { forcedBoard: original.result.board, feature: spinFeature });
    events.push(event(result, events.length));
  }
  const candidate = book(seed, events);
  if (result.state.mode !== 'base' || candidate.payoutMultiplier !== purchased.payoutMultiplier) throw new Error('Natural/purchased bonus equivalence failed');
  return candidate;
}
