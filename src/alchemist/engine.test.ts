import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, PAYLINES, MAX_WIN_MULTIPLIER, SYMBOLS, WILD_TYPES, createState, changeBet, evaluateBoard, spin, buyBonus, generateBoard, validateBoard, seededRng, demoBoard } from './engine.ts';
import type { Board, Cell, GameState, WildType } from './engine.ts';

const blank = (): Board => Array.from({ length: COLS }, (_, col) => Array.from({ length: ROWS }, () => ({ id: SYMBOLS[col].id })));
const wild = (wildType: WildType, multiplier = WILD_TYPES[wildType].multipliers[0]): Cell => ({ id: 'wild', wildType, multiplier });
const lineBoard = (length = 6): Board => {
  const board = blank();
  for (let col = 0; col < length; col++) board[col][0] = { id: 'lead' };
  return board;
};
const bonusState = (mode: 'reckoning' | 'devastation' = 'reckoning'): GameState => buyBonus(createState(10000), mode);

// Golden data checks, sourced from the official public winline diagrams.
test('6×5 field with the exact 19 distinct official paylines', () => {
  assert.equal(COLS, 6); assert.equal(ROWS, 5); assert.equal(PAYLINES.length, 19);
  assert.equal(new Set(PAYLINES.map(line => line.join(','))).size, 19);
  assert.deepEqual(PAYLINES[5], [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(PAYLINES[13], [0, 1, 2, 2, 1, 0]);
  assert.deepEqual(PAYLINES[18], [2, 1, 0, 0, 1, 2]);
});
test('pays only the longest left-to-right combination on a line', () => {
  const result = evaluateBoard(lineBoard(), 2);
  const win = result.wins.find(item => item.line === 0)!;
  assert.equal(win.count, 6); assert.equal(win.multiplier, 1); assert.equal(win.payout, 6);
  assert.equal(result.wins.filter(item => item.line === 0).length, 1);
  assert.equal(evaluateBoard(lineBoard(3), 2).wins.find(item => item.line === 0)?.payout, .2);
});
test('does not pay right-to-left or across a gap', () => {
  const board = blank();
  for (let col = 2; col < 6; col++) board[col][0] = { id: 'lead' };
  assert.equal(evaluateBoard(board).payout, 0);
  board[0][0] = { id: 'lead' };
  assert.equal(evaluateBoard(board).payout, 0);
});
test('off-reel wild substitutes and multiplies without expanding', () => {
  const board = lineBoard(); board[1][0] = wild('red', 7);
  const result = evaluateBoard(board);
  assert.deepEqual(result.expandedReels, []);
  assert.equal(result.wins.find(win => win.line === 0)?.payout, 21);
});
test('participating wild values add, never multiply together', () => {
  const board = lineBoard(); board[1][0] = wild('red', 7); board[2][0] = wild('blue', 3);
  const result = evaluateBoard(board);
  const win = result.wins.find(item => item.line === 0)!;
  assert.equal(win.multiplier, 10); assert.equal(win.payout, 30);
  assert.deepEqual(result.expandedReels, []);
});
test('linked wild expands when expansion creates a win', () => {
  const board = lineBoard(3); board[1][0] = { id: 'retort' }; board[1][4] = wild('blue', 4);
  const result = evaluateBoard(board);
  assert.deepEqual(result.expandedReels, [1]);
  assert.ok(result.expandedBoard[1].every(cell => cell.id === 'wild' && cell.multiplier === 4));
  assert.equal(result.wins.find(win => win.line === 0)?.payout, .4);
});
test('expansion resolves cooperating wild reels simultaneously', () => {
  const board = blank(); board[0][0] = { id: 'lead' };
  board[1][4] = wild('blue'); board[2][3] = wild('red');
  const result = evaluateBoard(board);
  assert.deepEqual(result.expandedReels, [1, 2]);
  assert.equal(result.wins.find(win => win.line === 0)?.multiplier, 7);
});
test('linked wild does not expand when it would not participate in any win', () => {
  const board = lineBoard(3); board[4][4] = wild('green');
  const result = evaluateBoard(board);
  assert.ok(result.payout > 0); assert.deepEqual(result.expandedReels, []);
});
test('Reckoning activates a type from its linked landing even without a win', () => {
  const board = blank(); board[4][4] = wild('green');
  const result = evaluateBoard(board, 1, { mode: 'reckoning' });
  assert.equal(result.payout, 0); assert.deepEqual(result.expandedReels, []);
  assert.deepEqual(result.activatedTypes, ['green']); assert.deepEqual(result.newlyActivatedTypes, ['green']);
});
test('activated type follows wilds to other central reels', () => {
  const board = lineBoard(3); board[1][0] = { id: 'retort' }; board[1][4] = wild('green', 30);
  assert.deepEqual(evaluateBoard(board, 1, { mode: 'reckoning' }).expandedReels, []);
  const result = evaluateBoard(board, 1, { mode: 'reckoning', activatedTypes: ['green'] });
  assert.deepEqual(result.expandedReels, [1]); assert.deepEqual(result.newlyActivatedTypes, []);
  assert.equal(result.wins.find(win => win.line === 0)?.payout, 3);
  assert.deepEqual(evaluateBoard(board, 1, { mode: 'devastation', activatedTypes: ['green'] }).expandedReels, []);
});
test('newly activated type also applies to its other wild in the same spin', () => {
  const board = lineBoard(3); board[1][0] = { id: 'retort' }; board[1][4] = wild('green', 30); board[4][4] = wild('green', 50);
  const result = evaluateBoard(board, 1, { mode: 'reckoning' });
  assert.deepEqual(result.newlyActivatedTypes, ['green']); assert.ok(result.expandedReels.includes(1));
});
test('exactly 3 scatters start 10 Devastation spins and 4 start 10 Reckoning spins', () => {
  for (const mode of ['devastation', 'reckoning'] as const) {
    const result = spin(createState(), { forcedBoard: demoBoard(mode) });
    assert.equal(result.bonusTriggered, mode); assert.equal(result.state.mode, mode); assert.equal(result.state.freeSpins, 10);
    assert.equal(result.cost, 1); assert.equal(result.state.balance, 999); assert.deepEqual(result.state.activatedTypes, []);
  }
});
test('scatter count uses natural board and scatters cannot substitute', () => {
  const board = lineBoard(); board[1][0] = { id: 'scatter' };
  const result = evaluateBoard(board); assert.equal(result.scatters, 1);
  assert.equal(result.wins.find(win => win.line === 0), undefined);
});
test('two scatter retrigger adds 2 after consuming the current free spin', () => {
  const state = bonusState(); state.freeSpins = 1;
  const result = spin(state, { forcedBoard: demoBoard('retrigger') });
  assert.equal(result.extraSpins, 2); assert.equal(result.state.freeSpins, 2); assert.equal(result.bonusEnded, false);
  assert.equal(result.cost, 0); assert.equal(result.state.balance, state.balance);
});
test('three scatter retrigger adds 4 without upgrading the bonus', () => {
  const result = spin(bonusState('devastation'), { forcedBoard: demoBoard('devastation') });
  assert.equal(result.extraSpins, 4); assert.equal(result.state.freeSpins, 13);
  assert.equal(result.state.mode, 'devastation'); assert.equal(result.bonusTriggered, null);
});
test('activated types persist through free spins and reset at feature end', () => {
  const state = bonusState(); state.activatedTypes = ['green']; state.freeSpins = 2;
  const first = spin(state, { forcedBoard: blank() });
  assert.deepEqual(first.state.activatedTypes, ['green']); assert.equal(first.state.freeSpins, 1);
  const last = spin(first.state, { forcedBoard: blank() });
  assert.equal(last.bonusEnded, true); assert.equal(last.state.mode, 'base'); assert.deepEqual(last.state.activatedTypes, []);
});
test('free spin awards are credited once and bonus total survives feature completion', () => {
  const state = bonusState(); state.freeSpins = 1;
  const result = spin(state, { forcedBoard: lineBoard() });
  assert.equal(result.state.balance, state.balance + result.payout);
  assert.equal(result.bonusTotalWin, result.payout); assert.equal(result.state.lastBonusWin, result.payout);
  const next = spin(result.state, { forcedBoard: blank() });
  assert.equal(next.state.balance, result.state.balance - 1); assert.equal(next.state.lastBonusWin, result.payout);
});
test('cap includes all previous wins in the triggering round and discards free spins', () => {
  const state = bonusState(); state.roundWin = MAX_WIN_MULTIPLIER - .25; state.bonusWin = 12000;
  const result = spin(state, { forcedBoard: lineBoard() });
  assert.equal(result.payout, .25); assert.equal(result.state.roundWin, MAX_WIN_MULTIPLIER);
  assert.equal(result.capped, true); assert.equal(result.bonusEnded, true); assert.equal(result.state.freeSpins, 0);
  assert.equal(result.state.mode, 'base'); assert.deepEqual(result.state.activatedTypes, []);
  assert.equal(result.state.balance, state.balance + .25);
});
test('base game cap clips a maximal board to 15000× the underlying bet', () => {
  const board = Array.from({ length: 6 }, () => Array.from({ length: 5 }, (): Cell => ({ id: 'elixir' })));
  for (let col = 1; col <= 4; col++) board[col][0] = wild('green', 200);
  const result = spin(createState(100000), { forcedBoard: board });
  assert.equal(result.payout, 15000); assert.equal(result.capped, true); assert.ok(result.uncappedPayout > result.payout);
});
test('purchases subtract the correct demo cost and start without consuming a free spin', () => {
  assert.equal(buyBonus(createState(1000, 2), 'devastation').balance, 800);
  const result = buyBonus(createState(1000, 2), 'reckoning');
  assert.equal(result.balance, 600); assert.equal(result.freeSpins, 10); assert.equal(result.totalSpins, 0);
  assert.throws(() => buyBonus(result, 'reckoning'));
});
test('rejects unaffordable actions and locks bet during bonus play', () => {
  assert.throws(() => spin(createState(0), { forcedBoard: blank() }), /Недостаточно/);
  assert.throws(() => buyBonus(createState(20), 'reckoning'), /Недостаточно/);
  assert.throws(() => changeBet(bonusState(), 2), /locked/);
  assert.equal(changeBet(createState(), .2).bet, .2);
});
test('validates forbidden placements, duplicate wilds, incompatible special symbols and multiplier values', () => {
  const cases = [
    () => { const b = blank(); b[0][0] = wild('blue'); return b; },
    () => { const b = blank(); b[5][0] = { id: 'scatter' }; return b; },
    () => { const b = blank(); b[1][0] = wild('blue'); b[1][1] = wild('red'); return b; },
    () => { const b = blank(); b[1][0] = wild('blue'); b[1][1] = { id: 'scatter' }; return b; },
    () => { const b = blank(); b[1][0] = wild('blue', 200); return b; },
  ];
  for (const fixture of cases) assert.throws(() => validateBoard(fixture()));
});
test('all operations leave the provided board and state immutable', () => {
  const state = bonusState(); const board = demoBoard('reaction');
  const original = JSON.stringify({ state, board });
  spin(state, { forcedBoard: board });
  assert.equal(JSON.stringify({ state, board }), original);
});
test('seeded random sequences are reproducible and every sampled board obeys placement rules', () => {
  const left = seededRng(731); const right = seededRng(731);
  for (let i = 0; i < 500; i++) {
    const board = generateBoard(left, i % 2 ? 'reckoning' : 'base');
    assert.deepEqual(board, generateBoard(right, i % 2 ? 'reckoning' : 'base'));
    assert.doesNotThrow(() => validateBoard(board));
  }
});
test('catalyst feature spins guarantee at least three wilds and prohibit scatters', () => {
  const rng = seededRng(431);
  for (let i = 0; i < 500; i++) {
    const board = generateBoard(rng, 'base', 'catalysts');
    validateBoard(board); assert.ok(board.flat().filter(cell => cell.id === 'wild').length >= 3);
    assert.equal(board.flat().filter(cell => cell.id === 'scatter').length, 0);
  }
  const result = spin(createState(1000, 2), { rng: seededRng(431), feature: 'catalysts' });
  assert.equal(result.cost, 120);
});
test('free spins never charge a feature spin premium', () => {
  const result = spin(bonusState(), { forcedBoard: blank(), feature: 'catalysts' });
  assert.equal(result.cost, 0);
});
test('rejects non-finite money and invalid RNG values', () => {
  assert.throws(() => createState(Number.NaN)); assert.throws(() => createState(100, 0));
  assert.throws(() => generateBoard(() => 1)); assert.throws(() => generateBoard(() => -1));
});

test('seeded RNG retains uint32 precision beyond five million draws', () => {
  const rng = seededRng(0);
  const checkpoints = new Set([4_917_758, 4_917_759, 5_000_001]);
  for (let draw = 1; draw <= 5_000_001; draw++) {
    const actual = rng();
    if (!checkpoints.has(draw)) continue;
    // Independent exact integer state; wrapping must happen before JS loses low bits.
    const word = Number((BigInt(draw) * 0x6D2B79F5n) & 0xffff_ffffn);
    let n = Math.imul(word ^ word >>> 15, word | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    const expected = ((n ^ n >>> 14) >>> 0) / 4294967296;
    assert.equal(actual, expected, `draw ${draw}`);
  }
});

test('feature and bonus enums reject inherited object properties before charging', () => {
  for (const inherited of ['toString', 'constructor', '__proto__']) {
    assert.throws(() => spin(createState(), { feature: inherited as never, forcedBoard: blank() }), /Unknown feature/);
    assert.throws(() => buyBonus(createState(), inherited as never), /Unknown bonus/);
  }
});
test('rejects non-finite or negative round totals instead of producing a NaN settlement', () => {
  for (const key of ['roundWin', 'bonusWin', 'lastWin', 'lastBonusWin'] as const) {
    for (const invalid of [NaN, Infinity, -.1]) {
      assert.throws(() => spin({ ...bonusState(), [key]: invalid }, { forcedBoard: blank() }), /amount/);
      assert.throws(() => buyBonus({ ...createState(), [key]: invalid }, 'devastation'), /amount/);
    }
  }
});
test('validates state counts, activation ownership and current bonus cap accounting', () => {
  for (const totalSpins of [-1, .5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => spin({ ...createState(), totalSpins }, { forcedBoard: blank() }), /spin count/);
  assert.throws(() => spin({ ...createState(), totalSpins: Number.MAX_SAFE_INTEGER }, { forcedBoard: blank() }), /overflow/);
  assert.throws(() => spin({ ...createState(), freeSpins: 1 }, { forcedBoard: blank() }), /Base mode/);
  assert.throws(() => spin({ ...bonusState(), freeSpins: .5 }, { forcedBoard: blank() }), /free spin count/);
  assert.throws(() => spin({ ...bonusState(), activatedTypes: ['constructor' as never] }, { forcedBoard: blank() }), /activated/);
  assert.throws(() => spin({ ...bonusState(), activatedTypes: ['blue', 'blue'] }, { forcedBoard: blank() }), /activated/);
  assert.throws(() => spin({ ...bonusState('devastation'), activatedTypes: ['blue'] }, { forcedBoard: blank() }), /Reckoning/);
  assert.throws(() => spin({ ...bonusState(), roundWin: 15000.01 }, { forcedBoard: blank() }), /round totals/);
  assert.throws(() => spin({ ...bonusState(), bonusWin: 1, roundWin: 0 }, { forcedBoard: blank() }), /round totals/);
  // Previous-round display totals may exceed a newly lowered base-game bet's cap.
  const past = changeBet({ ...createState(), roundWin: 15000, bonusWin: 15000, lastBonusWin: 15000 }, .1);
  assert.doesNotThrow(() => spin(past, { forcedBoard: blank() }));
});
