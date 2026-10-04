/**
 * An original, local-credit implementation of the publicly described Life and
 * Death rules. Exact public paylines; locally chosen symbol/RNG distribution.
 * No server, proprietary reel strips, certified RTP, or real-money settlement.
 * See docs/MECHANICS.md for source provenance and deliberate assumptions.
 */
export const COLS = 6;
export const ROWS = 5;
export const MAX_WIN_MULTIPLIER = 15_000;
export const INITIAL_FREE_SPINS = 10;
export const SYMBOLS = [
  { id: 'elixir', label: 'Проклятый сундук', short: 'Ω', color: '#d6fa91', payouts: [2, 5, 15, 50], weight: 5 },
  { id: 'retort', label: 'Золотой компас', short: 'R', color: '#b885e7', payouts: [1, 2.5, 7.5, 25], weight: 7 },
  { id: 'crystal', label: 'Корона глубин', short: '◇', color: '#fcad83', payouts: [1, 2.5, 7.5, 25], weight: 7 },
  { id: 'flask', label: 'Призрачный фонарь', short: 'F', color: '#75d8be', payouts: [.5, 1.5, 5, 15], weight: 9 },
  { id: 'atom', label: 'Жемчужина', short: '⚛', color: '#b5dff1', payouts: [.5, 1.5, 5, 15], weight: 9 },
  { id: 'mercury', label: 'Ракушка', short: 'Hg', color: '#b9beca', payouts: [.3, 1, 3, 10], weight: 11 },
  { id: 'sulfur', label: 'Верёвочный узел', short: 'S', color: '#ded599', payouts: [.2, .5, 1.5, 5], weight: 12 },
  { id: 'copper', label: 'Медная монета', short: 'Cu', color: '#c99a7d', payouts: [.2, .5, 1.5, 5], weight: 12 },
  { id: 'iron', label: 'Ржавый якорь', short: 'Fe', color: '#aeb7bd', payouts: [.2, .5, 1.5, 5], weight: 12 },
  { id: 'lead', label: 'Деревянная кружка', short: 'Pb', color: '#98a2a8', payouts: [.1, .3, 1, 3], weight: 16 },
] as const;
export type SymbolId = typeof SYMBOLS[number]['id'];
export type WildType = 'blue' | 'red' | 'gold' | 'green';
export const WILD_TYPES: Record<WildType, { label: string; name: string; linkedReel: number; color: string; multipliers: readonly number[] }> = {
  blue: { label: 'Шторм', name: 'Шторм', linkedReel: 1, color: '#7ac7f8', multipliers: [2, 3, 4] },
  red: { label: 'Корсар', name: 'Корсар', linkedReel: 2, color: '#f0806d', multipliers: [5, 6, 7, 8, 9] },
  gold: { label: 'Капитан', name: 'Капитан', linkedReel: 3, color: '#e8ca79', multipliers: [10, 15, 20, 25] },
  green: { label: 'Кракен', name: 'Кракен', linkedReel: 4, color: '#bced85', multipliers: [30, 40, 50, 75, 100, 200] },
};
export const WILD_ORDER: WildType[] = ['blue', 'red', 'gold', 'green'];
export interface Cell { id: SymbolId | 'wild' | 'scatter'; wildType?: WildType; multiplier?: number }
/** Column-major, board[column][row], row zero is the top. */
export type Board = Cell[][];
export type GameMode = 'base' | 'devastation' | 'reckoning' | 'captains_course';
export type BonusMode = Exclude<GameMode, 'base'>;
export type FeatureMode = 'standard' | 'bonushunt' | 'catalysts';
export type RNG = () => number;
export const BONUS_COST: Record<BonusMode, number> = { devastation: 100, reckoning: 200, captains_course: 100 };
export const FEATURE_COST: Record<FeatureMode, number> = { standard: 1, bonushunt: 3, catalysts: 60 };

/** Exact row coordinates transcribed from the official 1.17.1 rules markup. */
export const PAYLINES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3, 3], [4, 4, 4, 4, 4, 4],
  [0, 1, 0, 1, 0, 1], [1, 2, 1, 2, 1, 2], [2, 3, 2, 3, 2, 3], [3, 4, 3, 4, 3, 4],
  [1, 0, 1, 0, 1, 0], [2, 1, 2, 1, 2, 1], [3, 2, 3, 2, 3, 2], [4, 3, 4, 3, 4, 3],
  [0, 1, 2, 2, 1, 0], [1, 2, 3, 3, 2, 1], [2, 3, 4, 4, 3, 2],
  [4, 3, 2, 2, 3, 4], [3, 2, 1, 1, 2, 3], [2, 1, 0, 0, 1, 2],
];
export interface Win {
  line: number; // zero-based PAYLINES index
  symbol: SymbolId;
  count: number;
  positions: { col: number; row: number }[];
  basePayout: number;
  multiplier: number; // sum of participating Wild values, or 1 without Wilds
  payout: number;
}
export interface GameState {
  balance: number;
  bet: number;
  mode: GameMode;
  freeSpins: number;
  bonusWin: number;
  /** Includes the triggering spin, so the cap applies to the entire round. */
  roundWin: number;
  activatedTypes: WildType[];
  totalSpins: number;
  lastWin: number;
  lastBonusWin: number;
  /** New, separately versioned Compass books only; absent from old modes. */
  courseTarget?: 1 | 2 | 3 | 4;
}
export interface Evaluation {
  board: Board;
  expandedBoard: Board;
  wins: Win[];
  payout: number;
  expandedReels: number[];
  activatedTypes: WildType[];
  newlyActivatedTypes: WildType[];
  scatters: number;
}
export interface SpinResult extends Evaluation {
  state: GameState;
  cost: number;
  bonusTriggered: BonusMode | null;
  extraSpins: number;
  bonusEnded: boolean;
  bonusTotalWin: number;
  capped: boolean;
  uncappedPayout: number;
  playedMode: GameMode;
  course?: { targetBefore: 1 | 2 | 3 | 4; targetAfter: 1 | 2 | 3 | 4; advanced: boolean };
}
export interface SpinOptions { rng?: RNG; forcedBoard?: Board; feature?: FeatureMode }

const symbolById = new Map<SymbolId, typeof SYMBOLS[number]>(SYMBOLS.map(symbol => [symbol.id, symbol]));
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const isNormal = (id: Cell['id']): id is SymbolId => symbolById.has(id as SymbolId);
const cloneBoard = (board: Board): Board => board.map(reel => reel.map(cell => ({ ...cell })));
function assertMoney(value: number, name: string, positive = false): void {
  if (!Number.isFinite(value) || value < 0 || (positive && value <= 0) || Math.abs(value - money(value)) > 1e-7) {
    throw new Error(`${name} must be a finite ${positive ? 'positive' : 'non-negative'} amount with at most two decimals`);
  }
}
function assertState(state: GameState): void {
  assertMoney(state.balance, 'Balance');
  assertMoney(state.bet, 'Bet', true);
  if (!['base', 'devastation', 'reckoning'].includes(state.mode)) throw new Error('Unknown game mode');
  for (const key of ['bonusWin', 'roundWin', 'lastWin', 'lastBonusWin'] as const) assertMoney(state[key], key);
  if (!Number.isSafeInteger(state.totalSpins) || state.totalSpins < 0) throw new Error('Invalid total spin count');
  if (!Number.isSafeInteger(state.freeSpins) || state.freeSpins < 0) throw new Error('Invalid free spin count');
  if (state.mode === 'base' && state.freeSpins !== 0) throw new Error('Base mode cannot have free spins');
  if (state.mode !== 'base' && state.freeSpins < 1) throw new Error('No free spins remain');
  if (!Array.isArray(state.activatedTypes) || state.activatedTypes.some(type => !Object.hasOwn(WILD_TYPES, type))
    || new Set(state.activatedTypes).size !== state.activatedTypes.length) throw new Error('Invalid activated types');
  if (state.mode !== 'reckoning' && state.activatedTypes.length) throw new Error('Only Reckoning may retain activated types');
  if (state.mode !== 'base' && (state.roundWin > money(state.bet * MAX_WIN_MULTIPLIER) || state.bonusWin > state.roundWin)) {
    throw new Error('Invalid bonus round totals');
  }
}
export function createState(balance = 1000, bet = 1): GameState {
  assertMoney(balance, 'Balance');
  assertMoney(bet, 'Bet', true);
  return { balance, bet, mode: 'base', freeSpins: 0, bonusWin: 0, roundWin: 0, activatedTypes: [], totalSpins: 0, lastWin: 0, lastBonusWin: 0 };
}
export function setBet(state: GameState, bet: number): GameState {
  assertMoney(bet, 'Bet', true);
  if (state.mode !== 'base') throw new Error('The bet is locked during free spins');
  return { ...state, bet };
}
export const changeBet = setBet;
/** Only natural, pre-expansion boards should be passed into this validator. */
export function validateBoard(board: Board): void {
  if (!Array.isArray(board) || board.length !== COLS) throw new Error('The board must have 6 columns');
  board.forEach((reel, col) => {
    if (!Array.isArray(reel) || reel.length !== ROWS) throw new Error('Every column must have 5 rows');
    let wilds = 0;
    let scatters = 0;
    reel.forEach(cell => {
      if (!cell || (!isNormal(cell.id) && cell.id !== 'wild' && cell.id !== 'scatter')) throw new Error('Unknown symbol');
      if (cell.id === 'wild') {
        wilds++;
        if (!cell.wildType || !Object.hasOwn(WILD_TYPES, cell.wildType) || !WILD_TYPES[cell.wildType].multipliers.includes(cell.multiplier ?? 0)) throw new Error('Invalid wild multiplier');
      } else {
        if (cell.wildType !== undefined || cell.multiplier !== undefined) throw new Error('Only wilds may carry multipliers');
        if (cell.id === 'scatter') scatters++;
      }
    });
    if ((col === 0 || col === COLS - 1) && (wilds || scatters)) throw new Error('Special symbols may only land on reels 2–5');
    if (wilds > 1 || scatters > 1) throw new Error('At most one special symbol may land per reel');
    if (wilds && scatters) throw new Error('Wild and scatter cannot share a reel');
  });
}
function lineWins(board: Board, bet: number): Win[] {
  const wins: Win[] = [];
  PAYLINES.forEach((line, index) => {
    const symbol = board[0][line[0]].id;
    if (!isNormal(symbol)) return;
    let count = 1;
    let wildSum = 0;
    for (let col = 1; col < COLS; col++) {
      const cell = board[col][line[col]];
      if (cell.id === 'wild') { wildSum += cell.multiplier!; count++; }
      else if (cell.id === symbol) count++;
      else break;
    }
    if (count < 3) return;
    const factor = symbolById.get(symbol)!.payouts[count - 3];
    const multiplier = wildSum || 1;
    const basePayout = money(bet * factor);
    wins.push({ line: index, symbol, count, positions: line.slice(0, count).map((row, col) => ({ col, row })), basePayout, multiplier, payout: money(bet * factor * multiplier) });
  });
  return wins;
}
export function evaluateBoard(board: Board, bet = 1, options: { mode?: GameMode; activatedTypes?: WildType[] } = {}): Evaluation {
  validateBoard(board);
  assertMoney(bet, 'Bet', true);
  const natural = cloneBoard(board);
  const activated = new Set<WildType>(options.mode === 'reckoning' ? options.activatedTypes ?? [] : []);
  const newlyActivatedTypes: WildType[] = [];
  const wilds: { col: number; cell: Cell }[] = [];
  natural.forEach((reel, col) => {
    const cell = reel.find(item => item.id === 'wild');
    if (!cell) return;
    wilds.push({ col, cell });
    const type = cell.wildType!;
    if (options.mode === 'reckoning' && WILD_TYPES[type].linkedReel === col && !activated.has(type)) {
      activated.add(type);
      newlyActivatedTypes.push(type);
    }
  });
  const eligible = wilds.filter(({ col, cell }) => WILD_TYPES[cell.wildType!].linkedReel === col || activated.has(cell.wildType!));
  // Evaluate all candidates simultaneously: two expansions may jointly create
  // a winning line even though neither could create it in isolation.
  const hypothetical = cloneBoard(natural);
  eligible.forEach(({ col, cell }) => { hypothetical[col] = Array.from({ length: ROWS }, () => ({ ...cell })); });
  const potentialWins = lineWins(hypothetical, bet);
  const expandedReels = eligible.filter(({ col }) => potentialWins.some(win => win.positions.some(position => position.col === col))).map(({ col }) => col);
  const expandedBoard = cloneBoard(natural);
  eligible.forEach(({ col, cell }) => {
    if (expandedReels.includes(col)) expandedBoard[col] = Array.from({ length: ROWS }, () => ({ ...cell }));
  });
  const wins = lineWins(expandedBoard, bet);
  return { board: natural, expandedBoard, wins, payout: money(wins.reduce((sum, win) => sum + win.payout, 0)), expandedReels, activatedTypes: WILD_ORDER.filter(type => activated.has(type)), newlyActivatedTypes, scatters: natural.flat().filter(cell => cell.id === 'scatter').length };
}
function draw(rng: RNG): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('RNG must return values in [0, 1)');
  return value;
}
function pick<T>(items: readonly T[], rng: RNG): T { return items[Math.floor(draw(rng) * items.length)]; }
function weighted<T>(items: readonly T[], weights: readonly number[], rng: RNG): T {
  let value = draw(rng) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < items.length; index++) { value -= weights[index]; if (value < 0) return items[index]; }
  return items[items.length - 1];
}
/** Deterministic PRNG for reproducible preview/test sequences. */
export function seededRng(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function randomWild(rng: RNG): Cell {
  const wildType = weighted(WILD_ORDER, [49, 29, 17, 5], rng);
  const values = WILD_TYPES[wildType].multipliers;
  const multiplier = weighted(values, values.map((_, index) => 1 / (index + 1) ** 2), rng);
  return { id: 'wild', wildType, multiplier };
}
/** Local preview distribution: weights are explicit and are not Hacksaw's math. */
export function generateBoard(rng: RNG = Math.random, mode: GameMode = 'base', feature: FeatureMode = 'standard'): Board {
  const board: Board = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => ({ id: weighted(SYMBOLS, SYMBOLS.map(symbol => symbol.weight), rng).id })));
  const bonus = mode !== 'base';
  // P(>=3 scatters) at .085 is .002299. Bonushunt samples the scatter
  // event directly with 5× that probability, preserving the advertised ratio.
  const baseScatterChance = .085;
  let scatterColumns: number[] = [];
  if (feature !== 'catalysts' || bonus) {
    scatterColumns = [1, 2, 3, 4].filter(() => draw(rng) < baseScatterChance);
    if (!bonus && feature === 'bonushunt') {
      const baseBonusProbability = 4 * baseScatterChance ** 3 * (1 - baseScatterChance) + baseScatterChance ** 4;
      const shouldTrigger = draw(rng) < 5 * baseBonusProbability;
      if (shouldTrigger) {
        const fourScatterConditionalChance = baseScatterChance ** 4 / baseBonusProbability;
        const excluded = draw(rng) < fourScatterConditionalChance ? -1 : pick([1, 2, 3, 4], rng);
        scatterColumns = [1, 2, 3, 4].filter(col => col !== excluded);
      }
      if (!shouldTrigger && scatterColumns.length >= 3) scatterColumns = scatterColumns.slice(0, 2);
    }
  }
  if (bonus && scatterColumns.length === 4) scatterColumns.pop(); // only 2/3-scatter retriggers are specified
  const excludedWildColumn = !bonus && feature === 'catalysts' ? pick([1, 2, 3, 4], rng) : -1;
  const guaranteedWildColumns = !bonus && feature === 'catalysts' ? [1, 2, 3, 4].filter(col => col !== excludedWildColumn) : [];
  for (let col = 1; col <= 4; col++) {
    const row = Math.floor(draw(rng) * ROWS);
    if (scatterColumns.includes(col)) board[col][row] = { id: 'scatter' };
    else if (guaranteedWildColumns.includes(col) || draw(rng) < (bonus ? .23 : .08)) board[col][row] = randomWild(rng);
  }
  return board;
}
/** Bonus purchase uses local demo credits only. No feature is played here. */
export function buyBonus(state: GameState, mode: BonusMode): GameState {
  if (mode === 'captains_course') throw new Error('Compass requires its separately validated published books');
  assertState(state);
  if (state.mode !== 'base') throw new Error('Finish the current bonus first');
  if (!Object.hasOwn(BONUS_COST, mode)) throw new Error('Unknown bonus');
  assertMoney(state.balance, 'Balance');
  assertMoney(state.bet, 'Bet', true);
  const cost = money(state.bet * BONUS_COST[mode]);
  if (state.balance < cost) throw new Error('Недостаточно средств');
  return { ...state, balance: money(state.balance - cost), mode, freeSpins: INITIAL_FREE_SPINS, activatedTypes: [], bonusWin: 0, roundWin: 0, lastWin: 0, lastBonusWin: 0 };
}
export function spin(state: GameState, options: SpinOptions = {}): SpinResult {
  if (state.mode === 'captains_course') throw new Error('Compass requires its separately validated published books');
  assertState(state);
  if (state.totalSpins === Number.MAX_SAFE_INTEGER) throw new Error('Total spin count overflow');
  const inBonus = state.mode !== 'base';
  if (inBonus && (!Number.isInteger(state.freeSpins) || state.freeSpins < 1)) throw new Error('No free spins remain');
  const feature = options.feature ?? 'standard';
  if (!Object.hasOwn(FEATURE_COST, feature)) throw new Error('Unknown feature spin');
  const cost = inBonus ? 0 : money(state.bet * FEATURE_COST[feature]);
  if (state.balance < cost) throw new Error('Недостаточно средств');
  const board = options.forcedBoard ?? generateBoard(options.rng, state.mode, feature);
  const evaluated = evaluateBoard(board, state.bet, { mode: state.mode, activatedTypes: state.activatedTypes });
  const previousRoundWin = inBonus ? state.roundWin : 0;
  const remainingCap = Math.max(0, money(state.bet * MAX_WIN_MULTIPLIER - previousRoundWin));
  const payout = Math.min(evaluated.payout, remainingCap);
  const capped = money(previousRoundWin + payout) >= money(state.bet * MAX_WIN_MULTIPLIER);
  const extraSpins = inBonus && !capped ? evaluated.scatters === 2 ? 2 : evaluated.scatters >= 3 ? 4 : 0 : 0;
  const bonusTriggered = !inBonus && !capped ? evaluated.scatters === 3 ? 'devastation' : evaluated.scatters === 4 ? 'reckoning' : null : null;
  const freeSpins = capped ? 0 : inBonus ? state.freeSpins - 1 + extraSpins : bonusTriggered ? INITIAL_FREE_SPINS : 0;
  const bonusEnded = inBonus && freeSpins === 0;
  const bonusTotalWin = money((inBonus ? state.bonusWin : 0) + (inBonus ? payout : 0));
  const mode: GameMode = bonusTriggered ?? (inBonus && !bonusEnded ? state.mode : 'base');
  const next: GameState = {
    ...state, balance: money(state.balance - cost + payout), mode, freeSpins,
    bonusWin: inBonus ? bonusTotalWin : 0,
    roundWin: money(previousRoundWin + payout),
    activatedTypes: mode === 'reckoning' ? evaluated.activatedTypes : [],
    totalSpins: state.totalSpins + 1, lastWin: payout,
    lastBonusWin: bonusEnded ? bonusTotalWin : bonusTriggered ? 0 : state.lastBonusWin,
  };
  return { ...evaluated, state: next, payout, uncappedPayout: evaluated.payout, cost, bonusTriggered, extraSpins, bonusEnded, bonusTotalWin, capped, playedMode: state.mode };
}
export type DemoScenario = 'reaction' | 'bigwin' | 'devastation' | 'reckoning' | 'retrigger' | 'quiet';
/** Explicit preview fixtures; random spins never call these helpers. */
export function demoBoard(scenario: DemoScenario = 'reaction'): Board {
  const board: Board = Array.from({ length: COLS }, (_, col) => Array.from({ length: ROWS }, (_, row) => ({ id: SYMBOLS[(col * 3 + row * 2) % SYMBOLS.length].id })));
  if (scenario === 'devastation' || scenario === 'reckoning' || scenario === 'retrigger') {
    const count = scenario === 'devastation' ? 3 : scenario === 'reckoning' ? 4 : 2;
    for (let col = 1; col <= count; col++) board[col][(col + 1) % ROWS] = { id: 'scatter' };
  } else if (scenario === 'reaction' || scenario === 'bigwin') {
    board[0][2] = { id: scenario === 'bigwin' ? 'elixir' : 'flask' };
    board[5][2] = { ...board[0][2] };
    for (let col = 1; col <= 4; col++) board[col][2] = { ...board[0][2] };
    board[1][0] = { id: 'wild', wildType: 'blue', multiplier: 3 };
    board[2][4] = { id: 'wild', wildType: 'red', multiplier: 7 };
    if (scenario === 'bigwin') {
      board[3][1] = { id: 'wild', wildType: 'gold', multiplier: 10 };
      board[4][3] = { id: 'wild', wildType: 'green', multiplier: 30 };
    }
  }
  return board;
}
