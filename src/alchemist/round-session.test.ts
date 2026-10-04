import test from 'node:test';
import assert from 'node:assert/strict';
import { buyBonus, createState, demoBoard, spin } from './engine';
import type { SpinResult } from './engine';
import { RoundSession, ROUND_STORAGE_KEY, materialize, validateBook } from './round-session';
import { API_SCALE, RgsError } from './rgs';
import type { MathBook, MathMode, UnitSpinResult } from './math/types';
import { MATH_VERSION, MODE_COST } from './math/config';
const initial = () => ({ game: createState(10000, 1), board: demoBoard('quiet'), feature: 'standard' as const });
const unit = (result: SpinResult): UnitSpinResult => { const { balance: _balance, bet: _bet, ...state } = result.state; void _balance; void _bet; return { ...result, state }; };
function book(mode: MathMode = 'base', natural = false, cap = false): MathBook {
  const bonus = mode === 'devastation' || mode === 'reckoning';
  let state = bonus ? buyBonus(createState(10000, 1), mode) : createState(10000, 1);
  const events: MathBook['events'] = [];
  do {
    let board = demoBoard(events.length === 0 && natural ? 'devastation' : 'quiet');
    if (cap && (!natural || events.length > 0)) {
      board = Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => ({ id: 'elixir' as const })));
      board[1][0] = { id: 'wild', wildType: 'green', multiplier: 200 };
    }
    const result = spin(state, { forcedBoard: board, feature: mode === 'bonushunt' || mode === 'catalysts' ? mode : 'standard' });
    events.push({ index: events.length, type: 'alchemistSpin', result: unit(result) }); state = result.state;
  } while (state.mode !== 'base');
  return { id: 1, payoutMultiplier: Math.round(events.reduce((sum, e) => sum + e.result.payout, 0) * 100), events };
}
class MemoryStorage {
  values = new Map<string, string>(); writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function server(outcome = book()) {
  const config = { minBet: 1000, maxBet: 100_000_000, stepBet: 1000, defaultBetLevel: 1_000_000, betLevels: [1000, 10000, 1_000_000, 2_000_000, 100_000_000], jurisdiction: {} as Record<string, unknown> };
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let balance = 100 * API_SCALE;
  let round: null | { betID: number; amount: number; mode: MathMode; active: boolean; payout: number; payoutMultiplier: number; state: unknown; event?: string } = null;
  let losePlay = false, loseEnd = false, invalidPlay = false, rejectPlay = false, nextBetID = 77;
  const request: typeof fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(options?.body ?? '{}'));
    calls.push({ path, body });
    if (path === '/wallet/authenticate') return json({ balance: { amount: balance, currency: 'USD' }, config, round });
    if (path === '/wallet/play') {
      if (rejectPlay) return json({ code: 'ERR_IPB' }, 400);
      assert.equal(round?.active ?? false, false, 'one full active round');
      balance -= Number(body.amount) * MODE_COST[body.mode as MathMode];
      round = { betID: nextBetID++, amount: Number(body.amount), mode: body.mode as MathMode, active: true, payout: Math.round(outcome.payoutMultiplier / 100 * Number(body.amount)), payoutMultiplier: outcome.payoutMultiplier / 100, state: outcome.events };
      if (losePlay) { losePlay = false; throw new TypeError('lost response after debit'); }
      if (invalidPlay) return json({ balance: { amount: balance, currency: 'USD' }, round: { ...round, state: [] } });
      return json({ balance: { amount: balance, currency: 'USD' }, round });
    }
    if (path === '/bet/event') { assert.ok(round?.active); round.event = String(body.event); return json({ event: body.event }); }
    if (path === '/wallet/end-round') {
      assert.ok(round?.active); round.active = false; balance += round.payout;
      if (loseEnd) { loseEnd = false; throw new TypeError('lost settlement response'); }
      return json({ balance: { amount: balance, currency: 'USD' } });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  return { config, calls, request, get round() { return round; }, set round(value) { round = value; }, get balance() { return balance; }, set balance(value: number) { balance = value; }, set losePlay(v: boolean) { losePlay = v; }, set loseEnd(v: boolean) { loseEnd = v; }, set invalidPlay(v: boolean) { invalidPlay = v; }, set rejectPlay(v: boolean) { rejectPlay = v; } };
}
const liveUrl = 'https://game.test/?sessionID=test-session&rgs_url=https%3A%2F%2Frgs.test';

test('local complete book is debited once, saved before presentation, and resumed without sampling', async () => {
  const storage = new MemoryStorage(), outcome = book('base', true); let samples = 0;
  const options = { storage, sample: async () => { samples++; return outcome; }, preload: async () => {} };
  const session = new RoundSession(initial(), 'https://game.test', options); await session.initialize();
  await session.start('base', 1); assert.equal(session.view.game.balance, 9999);
  const trigger = session.consume(); assert.equal(trigger.bonusTriggered, 'devastation');
  const journal = JSON.parse(storage.getItem(ROUND_STORAGE_KEY)!); assert.equal(journal.pending.cursor, 1); assert.equal(journal.pending.book.events.length, 11);
  const resumed = new RoundSession(initial(), 'https://game.test', options); await resumed.initialize();
  assert.equal(resumed.view.game.freeSpins, 10); assert.equal(resumed.lastResult?.bonusTriggered, 'devastation');
  while (!resumed.complete) resumed.consume(); await resumed.finish();
  assert.equal(samples, 1); assert.equal(resumed.view.game.totalSpins, 11); assert.equal(resumed.view.game.balance, 9999 + outcome.payoutMultiplier / 100);
  assert.equal(JSON.parse(storage.getItem(ROUND_STORAGE_KEY)!).pending, null);
});
for (const version of ['alchemist-extreme-v1', 'alchemist-extreme-v2', 'alchemist-extreme-v3']) {
test(`${version} pending bonus migrates with its exact book, cursor and balance, without resampling`, async () => {
  const storage = new MemoryStorage(), outcome = book('base', true); let samples = 0;
  const options = { storage, sample: async () => { samples++; return outcome; }, preload: async () => {} };
  const original = new RoundSession(initial(), 'https://game.test', options); await original.initialize();
  await original.start('base', 2); original.consume(); original.consume(); original.consume();
  const previous = JSON.parse(storage.getItem(ROUND_STORAGE_KEY)!); previous.version = version;
  storage.setItem(ROUND_STORAGE_KEY, JSON.stringify(previous));
  const resumed = new RoundSession(initial(), 'https://game.test', options); await resumed.initialize();
  assert.deepEqual(resumed.view, previous.view); assert.equal(resumed.view.game.freeSpins, 8);
  const migrated = JSON.parse(storage.getItem(ROUND_STORAGE_KEY)!);
  assert.equal(migrated.version, MATH_VERSION); assert.deepEqual(migrated.pending, previous.pending);
  while (!resumed.complete) resumed.consume(); await resumed.finish();
  assert.equal(samples, 1); assert.equal(resumed.view.game.totalSpins, 11);
  assert.equal(resumed.view.game.balance, 9998 + outcome.payoutMultiplier / 100 * 2);
  await resumed.start('base', 2); assert.equal(samples, 2);
});
test(`${version} saved settled view migrates without resetting balance, bet or selected mode`, async () => {
  const storage = new MemoryStorage(), view = initial();
  view.game.balance = 3141.592653; view.game.bet = 2; view.game.totalSpins = 37;
  const previous = { version, view: { ...view, feature: 'bonushunt' }, pending: null, legacy: false };
  storage.setItem(ROUND_STORAGE_KEY, JSON.stringify(previous));
  const session = new RoundSession(initial(), 'https://game.test', { storage, preload: async () => {} }); await session.initialize();
  assert.deepEqual(session.view, previous.view); assert.equal(session.hasPending, false);
  assert.deepEqual(JSON.parse(storage.getItem(ROUND_STORAGE_KEY)!), { ...previous, version: MATH_VERSION });
});
}
test('migration rejects unknown journal versions and corrupt v1 outcomes without replacing saved data', async () => {
  for (const version of ['alchemist-extreme-v0', 'alchemist-extreme-future', 'alchemist-extreme-v1']) {
    const storage = new MemoryStorage(); let samples = 0;
    const options = { storage, sample: async () => { samples++; return book('base', true); }, preload: async () => {} };
    const original = new RoundSession(initial(), 'https://game.test', options); await original.initialize(); await original.start('base', 1); original.consume();
    const previous = JSON.parse(storage.getItem(ROUND_STORAGE_KEY)!); previous.version = version;
    if (version === 'alchemist-extreme-v1') previous.pending.book.payoutMultiplier += 10;
    const raw = JSON.stringify(previous); storage.setItem(ROUND_STORAGE_KEY, raw);
    const resumed = new RoundSession(initial(), 'https://game.test', options);
    await assert.rejects(resumed.initialize()); await assert.rejects(resumed.start('base', 1));
    assert.equal(samples, 1); assert.equal(storage.getItem(ROUND_STORAGE_KEY), raw);
  }
});
test('unfinished legacy free spins finish without purchasing or sampling a new round', async () => {
  const old = initial(); old.game = { ...buyBonus(old.game, 'devastation'), freeSpins: 1 };
  let samples = 0; const session = new RoundSession(old, 'https://game.test', { storage: new MemoryStorage(), preload: async () => {}, sample: async () => { samples++; return book(); } });
  await session.initialize(); const before = session.view.game.balance;
  const result = session.consume(); assert.equal(result.cost, 0); assert.equal(session.view.game.balance, before + result.payout); assert.equal(samples, 0);
});
test('RGS paid trigger and all free spins use one play, one final end-round and server-only balance', async () => {
  const storage = new MemoryStorage(), mock = server(book('base', true));
  const session = new RoundSession(initial(), liveUrl, { request: mock.request, storage, sample: async () => { throw new Error('must never sample live'); } });
  await session.initialize(); assert.equal(session.view.game.balance, 100);
  await session.start('base', .001); assert.equal(session.view.game.balance, 99.999);
  while (!session.complete) { const result = session.consume(); assert.equal(result.state.balance, 99.999); await session.acknowledge(); }
  assert.equal(mock.calls.filter(c => c.path === '/wallet/end-round').length, 0);
  await session.finish(); await session.finish();
  assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
  assert.equal(mock.calls.find(c => c.path === '/wallet/play')!.body.amount, 1000);
  assert.equal(mock.calls.filter(c => c.path === '/wallet/end-round').length, 1);
  assert.equal(session.view.game.balance, mock.balance / API_SCALE); assert.equal(storage.writes, 0);
});
test('purchased bonus initializes 10 spins, charges base amount with mode and finishes at cap', async () => {
  const mock = server(book('reckoning', false, true)), session = new RoundSession(initial(), liveUrl, { request: mock.request });
  await session.initialize(); await session.start('reckoning', .01);
  assert.equal(session.view.game.freeSpins, 10); assert.equal(session.view.game.mode, 'reckoning'); assert.equal(session.view.game.balance, 98);
  assert.deepEqual(mock.calls.at(-1)?.body, { sessionID: 'test-session', amount: 10000, mode: 'reckoning' });
  const result = session.consume(); assert.equal(result.capped, true); assert.equal(result.state.mode, 'base'); assert.equal(result.payout, 150);
  await session.acknowledge(); await session.finish(); assert.equal(session.view.game.balance, 248);
});
test('authenticate resumes authoritative event cursor and does not repeat displayed free spins', async () => {
  const mock = server(book('devastation')), first = new RoundSession(initial(), liveUrl, { request: mock.request });
  await first.initialize(); await first.start('devastation', .01); first.consume(); await first.acknowledge(); first.consume(); await first.acknowledge();
  const resumed = new RoundSession(initial(), liveUrl, { request: mock.request }); await resumed.initialize();
  assert.equal(resumed.view.game.freeSpins, 8); assert.equal(resumed.view.game.totalSpins, 2);
  while (!resumed.complete) { resumed.consume(); await resumed.acknowledge(); } await resumed.finish();
  assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
});
test('a completed historical auth round is not treated as unfinished', async () => {
  const mock = server(), session = new RoundSession(initial(), liveUrl, { request: mock.request });
  await session.initialize(); await session.start('base', 1); session.consume(); await session.acknowledge(); await session.finish();
  const resumed = new RoundSession(initial(), liveUrl, { request: mock.request }); await resumed.initialize(); assert.equal(resumed.hasPending, false); assert.equal(resumed.view.game.mode, 'base');
  assert.equal(mock.calls.filter(c => c.path === '/wallet/end-round').length, 1);
});
test('uncertain charged play blocks further requests and recovers the accepted outcome via auth only', async () => {
  const mock = server(book('base', true)); mock.losePlay = true;
  const session = new RoundSession(initial(), liveUrl, { request: mock.request }); await session.initialize();
  await assert.rejects(session.start('base', 1), (e: unknown) => e instanceof RgsError && e.uncertain);
  await assert.rejects(session.start('base', 1)); assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
  await session.recover(); assert.equal(session.view.game.balance, 99); assert.equal(session.consume().bonusTriggered, 'devastation');
  assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
});
test('uncertain end-round is reconciled, never blindly resubmitted after it already settled', async () => {
  const mock = server(); const session = new RoundSession(initial(), liveUrl, { request: mock.request }); await session.initialize(); await session.start('base', 1); session.consume(); await session.acknowledge(); mock.loseEnd = true;
  await assert.rejects(session.finish()); await assert.rejects(session.finish()); await session.recover();
  assert.equal(session.hasPending, false); assert.equal(mock.calls.filter(c => c.path === '/wallet/end-round').length, 1); assert.equal(session.view.game.balance, mock.balance / API_SCALE);
});
test('invalid accepted book blocks betting instead of rerolling', async () => {
  const mock = server(); mock.invalidPlay = true; const session = new RoundSession(initial(), liveUrl, { request: mock.request }); await session.initialize();
  await assert.rejects(session.start('base', 1), (e: unknown) => e instanceof RgsError && e.uncertain);
  await assert.rejects(session.start('base', 1)); assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
});
test('mode, bet level, jurisdiction and concurrent play guards run before financial requests', async () => {
  const mock = server(); mock.config.jurisdiction.disabledBuyFeature = true;
  const session = new RoundSession(initial(), liveUrl, { request: mock.request }); await session.initialize();
  await assert.rejects(session.start('base', .02)); await assert.rejects(session.start('reckoning', .01));
  await assert.rejects(session.start('__proto__' as MathMode, 1));
  assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 0);
  const accepted = session.start('base', 1); await assert.rejects(session.start('base', 1)); await accepted;
  assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
});

test('live affordability uses every actual mode cost in micro-units before play, and accepts the exact wallet boundary after refresh', async () => {
  for (const mode of Object.keys(MODE_COST) as MathMode[]) for (const bet of [.001, 1]) {
    const cost = Math.round(bet * API_SCALE) * MODE_COST[mode];
    const mock = server(book(mode)); mock.balance = cost - 1;
    const session = new RoundSession(initial(), liveUrl, { request: mock.request }); await session.initialize();
    await assert.rejects(session.start(mode, bet), /Недостаточно средств/, `${mode}/${bet}: one micro-unit short must be rejected`);
    assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 0);
    assert.equal(session.hasPending, false); assert.equal(session.fault, null, 'a local affordability refusal is not an uncertain financial request');
    assert.equal(mock.balance, cost - 1);
    // A fresh authoritative auth, rather than a guessed client-side credit,
    // unlocks the formerly unaffordable action at precisely the required amount.
    mock.balance = cost; await session.recover(); await session.start(mode, bet);
    const plays = mock.calls.filter(call => call.path === '/wallet/play');
    assert.equal(plays.length, 1); assert.equal(plays[0].body.amount, Math.round(bet * API_SCALE)); assert.equal(plays[0].body.mode, mode);
    assert.equal(session.view.game.balance, 0, 'the accepted server response immediately replaces the old wallet balance');
    while (!session.complete) { session.consume(); await session.acknowledge(); }
    await session.finish();
    assert.equal(session.view.game.balance, mock.balance / API_SCALE);
    await assert.rejects(session.start(mode, bet), /Недостаточно средств/, 'a depleted settled wallet cannot reuse the old pre-play amount');
    assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
  }
});
test('partial live parameters cannot silently start an offline game', async () => {
  let samples = 0; const session = new RoundSession(initial(), 'https://game.test/?sessionID=only-one', { sample: async () => { samples++; return book(); } });
  assert.equal(session.live, true); await assert.rejects(session.initialize()); assert.equal(samples, 0);
});
test('micro-unit materialization preserves fractional winnings and relative spin count', () => {
  const value = book().events[0].result; value.payout = .1; value.state.lastWin = .1;
  const result = materialize(value, 1000, 123456789, 27);
  assert.equal(result.payout, .0001); assert.equal(result.state.bet, .001); assert.equal(result.state.balance, 123.456789); assert.equal(result.state.totalSpins, 28);
});
test('invalid book totals are rejected before any local debit', async () => {
  const outcome = book(); outcome.payoutMultiplier += 10;
  assert.throws(() => validateBook(outcome)); const session = new RoundSession(initial(), 'https://game.test', { sample: async () => outcome, preload: async () => {} });
  await session.initialize(); await assert.rejects(session.start('base', 1)); assert.equal(session.view.game.balance, 10000); assert.equal(session.hasPending, false);
});
test('public replay interprets amount=1000000 as bet 1 and can replay without wallet calls', async () => {
  const outcome = book('reckoning', false, true), calls: string[] = [], storage = new MemoryStorage();
  const request: typeof fetch = async (url, options) => { calls.push(String(url)); assert.equal(options?.method, undefined); assert.equal(options?.body, undefined); return json({ payoutMultiplier: outcome.payoutMultiplier / 100, costMultiplier: 200, state: { events: outcome.events } }); };
  const session = new RoundSession(initial(), 'https://game.test/?replay=true&sessionID=ignored&rgs_url=rgs.test&game=game-id&version=1&mode=reckoning&event=41&amount=1000000&currency=EUR', { request, storage });
  await session.initialize(); assert.equal(session.live, false); assert.equal(session.replay, true); assert.equal(session.view.game.bet, 1); assert.equal(session.currency, 'EUR');
  const result = session.consume(); assert.equal(result.payout, 15000); await session.acknowledge(); await session.finish(); assert.equal(session.replayFinished, true);
  session.restartReplay(); assert.equal(session.consume().payout, 15000); await session.finish();
  assert.deepEqual(calls, ['https://rgs.test/bet/replay/game-id/1/reckoning/41']); assert.equal(storage.writes, 0); await assert.rejects(session.start('base', 1));
});

test('minimumRoundDuration is honoured in milliseconds before settlement unlocks the next round', async () => {
  const mock = server(); mock.config.jurisdiction.minimumRoundDuration = 80;
  const session = new RoundSession(initial(), liveUrl, { request: mock.request }); await session.initialize();
  const before = Date.now(); await session.start('base', 1); session.consume(); await session.acknowledge(); await session.finish();
  assert.ok(Date.now() - before >= 75); assert.equal(mock.calls.filter(c => c.path === '/wallet/end-round').length, 1);
});
test('book validation rejects inconsistent bonus totals, expanded cells and line symbols', () => {
  const original = book('reckoning');
  for (const corrupt of [
    (value: MathBook) => { value.events.at(-1)!.result.bonusTotalWin = 14999; },
    (value: MathBook) => { value.events.at(-1)!.result.state.bonusWin = 14999; },
    (value: MathBook) => { value.events.at(-1)!.result.state.lastBonusWin = 14999; },
    (value: MathBook) => { value.events[0].result.expandedBoard[0][0] = null as never; },
  ]) { const value = structuredClone(original); corrupt(value); assert.throws(() => validateBook(value)); }
});
test('failed RGS bookmark recovers last confirmed cursor without a new bet', async () => {
  const mock = server(book('devastation')); let fail = true;
  const request: typeof fetch = async (input, options) => {
    if (String(input).endsWith('/bet/event') && fail) { fail = false; throw new Error('bookmark not accepted'); }
    return mock.request(input, options);
  };
  const session = new RoundSession(initial(), liveUrl, { request }); await session.initialize(); await session.start('devastation', .01); session.consume();
  await assert.rejects(session.acknowledge()); await assert.rejects(session.start('base', 1)); await session.recover();
  assert.equal(session.view.game.freeSpins, 10); assert.equal(session.consume().state.freeSpins, 9); assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
});

test('RGS auto-completed play never sends end-round or calculates a wallet credit', async () => {
  const outcome = book(), paths: string[] = [];
  const request: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname; paths.push(path);
    if (path === '/wallet/authenticate') return json({ balance: { amount: 100000000, currency: 'USD' }, config: server().config, round: { active: false } });
    if (path === '/wallet/play') return json({ balance: { amount: 99543210, currency: 'USD' }, round: { betID: 7, amount: 1000000, payout: 0, payoutMultiplier: 0, mode: 'base', active: false, state: outcome.events } });
    throw new Error(`Unexpected financial request ${path}`);
  };
  const session = new RoundSession(initial(), liveUrl, { request }); await session.initialize(); await session.start('base', 1);
  assert.equal(session.consume().state.balance, 99.54321); await session.acknowledge(); await session.finish();
  assert.deepEqual(paths, ['/wallet/authenticate', '/wallet/play']); assert.equal(session.view.game.balance, 99.54321);
});
test('live validation executes no RNG while verifying all fixed outcome fields', async () => {
  const mock = server(book('base', true)), original = Math.random;
  const session = new RoundSession(initial(), liveUrl, { request: mock.request, sample: async () => { throw new Error('client selection forbidden'); } });
  Math.random = () => { throw new Error('client RNG forbidden'); };
  try { await session.initialize(); await session.start('base', 1); while (!session.complete) { session.consume(); await session.acknowledge(); } await session.finish(); }
  finally { Math.random = original; }
});

test('a loading local round locks bet, mode and balance reset before its outcome arrives', async () => {
  let resolveBook!: (value: MathBook) => void;
  const pendingBook = new Promise<MathBook>(resolve => { resolveBook = resolve; });
  const session = new RoundSession(initial(), 'https://game.test', { preload: async () => {}, sample: () => pendingBook });
  await session.initialize();
  const accepted = session.start('base', 1);
  assert.throws(() => session.setBet(2), /Ставка сейчас недоступна/);
  assert.throws(() => session.setFeature('bonushunt'), /Режим сейчас недоступен/);
  assert.throws(() => session.resetLocal(demoBoard('quiet')), /Нельзя сбросить/);
  assert.throws(() => session.consume(), /Дождитесь/);
  resolveBook(book()); await accepted;
  assert.equal(session.view.game.bet, 1);
  assert.equal(session.view.feature, 'standard');
  assert.equal(session.view.game.balance, 9999);
  session.consume(); await session.finish();
  session.setBet(2); session.setFeature('bonushunt');
  assert.equal(session.view.game.bet, 2); assert.equal(session.view.feature, 'bonushunt');
});

test('server recovery cannot race with consuming another free-spin event', async () => {
  const mock = server(book('devastation'));
  let pendingAuth: (() => void) | undefined;
  let holdAuth = false;
  const request: typeof fetch = async (input, options) => {
    if (holdAuth && String(input).endsWith('/wallet/authenticate')) await new Promise<void>(resolve => { pendingAuth = resolve; });
    return mock.request(input, options);
  };
  const session = new RoundSession(initial(), liveUrl, { request });
  await session.initialize(); await session.start('devastation', .01);
  session.consume(); await session.acknowledge();
  holdAuth = true;
  const recovering = session.recover();
  assert.throws(() => session.consume(), /Дождитесь/);
  pendingAuth!(); await recovering;
  assert.equal(session.view.game.freeSpins, 9);
  assert.equal(session.consume().state.freeSpins, 8);
  assert.equal(mock.calls.filter(c => c.path === '/wallet/play').length, 1);
});

test('session display clock starts only after successful auth and survives recovery', async () => {
  const mock = server(); let fail = true;
  const request: typeof fetch = async (...args) => { if (fail) throw new TypeError('offline'); return mock.request(...args); };
  const session = new RoundSession(initial(), liveUrl, { request });
  assert.equal(session.sessionStartedAt, null); assert.equal(session.netPositionMicro, null);
  await assert.rejects(session.initialize()); assert.equal(session.sessionStartedAt, null);
  const now = Date.now; Date.now = () => 123456000;
  try {
    fail = false; await session.recover(); assert.equal(session.sessionStartedAt, 123456000); assert.equal(session.netPositionMicro, 0);
    Date.now = () => 123999000; await session.recover(); assert.equal(session.sessionStartedAt, 123456000);
  } finally { Date.now = now; }
});

test('net position accounts each confirmed mode cost and settled payout once, independent of wallet transfers', async () => {
  for (const mode of Object.keys(MODE_COST) as MathMode[]) {
    const outcome = book(mode, false, true), mock = server(outcome), session = new RoundSession(initial(), liveUrl, { request: mock.request });
    await session.initialize(); const cost = 1000 * MODE_COST[mode], payout = outcome.payoutMultiplier / 100 * 1000;
    for (let round = 0; round < 2; round++) {
      const previous = round * (payout - cost);
      await session.start(mode, .001); assert.equal(session.netPositionMicro, previous - cost);
      await session.recover(); await session.recover(); assert.equal(session.netPositionMicro, previous - cost, 'active auth must not double-debit');
      while (!session.complete) { session.consume(); await session.acknowledge(); assert.equal(session.netPositionMicro, previous - cost, 'animation cannot credit the wallet'); }
      await session.finish(); await session.finish(); assert.equal(session.netPositionMicro, previous + payout - cost);
      mock.balance += 7000000; await session.recover(); assert.equal(session.netPositionMicro, previous + payout - cost, 'outside balance movements are not gameplay profit');
    }
    assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 2);
    assert.equal(mock.calls.filter(call => call.path === '/wallet/end-round').length, 2);
  }
});

test('initial recovered paid bonus includes its original debit once before settlement', async () => {
  const outcome = book('reckoning', false, true), mock = server(outcome), first = new RoundSession(initial(), liveUrl, { request: mock.request });
  await first.initialize(); await first.start('reckoning', .001);
  const resumed = new RoundSession(initial(), liveUrl, { request: mock.request }); await resumed.initialize();
  assert.equal(resumed.netPositionMicro, -200000); await resumed.recover(); assert.equal(resumed.netPositionMicro, -200000);
  while (!resumed.complete) { resumed.consume(); await resumed.acknowledge(); } await resumed.finish(); await resumed.recover();
  assert.equal(resumed.netPositionMicro, 15000000 - 200000); assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
});

test('inactive accepted play is already settled and is never credited twice by presentation', async () => {
  const outcome = book('base', false, true), mock = server(outcome);
  const request: typeof fetch = async (...args) => {
    const response = await mock.request(...args);
    if (!String(args[0]).endsWith('/wallet/play')) return response;
    mock.round!.active = false; mock.balance += mock.round!.payout;
    return json({ balance: { amount: mock.balance, currency: 'USD' }, round: mock.round });
  };
  const session = new RoundSession(initial(), liveUrl, { request }); await session.initialize(); await session.start('base', .001);
  assert.equal(session.netPositionMicro, 15000000 - 1000);
  session.consume(); await session.acknowledge(); await session.finish(); await session.finish(); await session.recover();
  assert.equal(session.netPositionMicro, 15000000 - 1000); assert.equal(mock.calls.filter(call => call.path === '/wallet/end-round').length, 0);
});

test('uncertain play and settlement hide net position until an authoritative recovery, without duplicate credit', async () => {
  const mock = server(book('base', false, true)), session = new RoundSession(initial(), liveUrl, { request: mock.request });
  await session.initialize(); mock.losePlay = true; await assert.rejects(session.start('base', .001)); assert.equal(session.netPositionMicro, null);
  await session.recover(); assert.equal(session.netPositionMicro, -1000); session.consume(); await session.acknowledge();
  mock.loseEnd = true; await assert.rejects(session.finish()); assert.equal(session.netPositionMicro, null);
  await session.recover(); assert.equal(session.netPositionMicro, 15000000 - 1000);
  await session.recover(); await session.finish(); assert.equal(session.netPositionMicro, 15000000 - 1000);
  assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1); assert.equal(mock.calls.filter(call => call.path === '/wallet/end-round').length, 1);
});

test('an unknown auto-settled lost play never fabricates a net position from the wallet', async () => {
  const mock = server();
  const request: typeof fetch = async (...args) => {
    const response = await mock.request(...args);
    if (String(args[0]).endsWith('/wallet/play')) { mock.round!.active = false; throw new TypeError('lost zero-win auto-settlement'); }
    return response;
  };
  const session = new RoundSession(initial(), liveUrl, { request }); await session.initialize(); await assert.rejects(session.start('base', 1));
  mock.balance += 8000000; await session.recover(); assert.equal(session.netPositionMicro, null);
  await session.recover(); assert.equal(session.netPositionMicro, null); assert.equal(session.hasPending, false);
});

test('another failed auth cannot erase unresolved play or settlement telemetry', async () => {
  const mock = server(book('base', false, true)); let failAuth = false;
  const request: typeof fetch = async (...args) => {
    if (failAuth && String(args[0]).endsWith('/wallet/authenticate')) { failAuth = false; throw new TypeError('temporary recovery failure'); }
    return mock.request(...args);
  };
  const session = new RoundSession(initial(), liveUrl, { request }); await session.initialize();
  mock.losePlay = true; await assert.rejects(session.start('base', .001));
  failAuth = true; await assert.rejects(session.recover()); assert.equal(session.netPositionMicro, null);
  await session.recover(); assert.equal(session.netPositionMicro, -1000);
  session.consume(); await session.acknowledge(); mock.loseEnd = true; await assert.rejects(session.finish());
  failAuth = true; await assert.rejects(session.recover()); assert.equal(session.netPositionMicro, null);
  await session.recover(); assert.equal(session.netPositionMicro, 15000000 - 1000);
  await session.recover(); assert.equal(session.netPositionMicro, 15000000 - 1000);
});

test('failed end-round that never settled stays debited after active auth until actual settlement', async () => {
  const mock = server(book('base', false, true)); let loseBeforeSettlement = true;
  const request: typeof fetch = async (...args) => {
    if (loseBeforeSettlement && String(args[0]).endsWith('/wallet/end-round')) { loseBeforeSettlement = false; throw new TypeError('not delivered'); }
    return mock.request(...args);
  };
  const session = new RoundSession(initial(), liveUrl, { request }); await session.initialize(); await session.start('base', .001);
  session.consume(); await session.acknowledge(); await assert.rejects(session.finish()); assert.equal(session.netPositionMicro, null);
  await session.recover(); assert.equal(session.netPositionMicro, -1000); assert.equal(session.complete, true);
  await session.finish(); assert.equal(session.netPositionMicro, 15000000 - 1000);
});

test('local and replay sessions never expose fabricated live session telemetry', async () => {
  const local = new RoundSession(initial(), 'https://game.test', { sample: async () => book(), preload: async () => {} });
  await local.initialize(); await local.start('base', 1); local.consume(); await local.finish();
  assert.equal(local.sessionStartedAt, null); assert.equal(local.netPositionMicro, null);
  const outcome = book();
  const replay = new RoundSession(initial(), 'https://game.test/?replay=true&rgs_url=rgs.test&game=id&version=1&mode=base&event=1&amount=1000000', { request: async () => json({ payoutMultiplier: outcome.payoutMultiplier / 100, costMultiplier: 1, state: outcome.events }) });
  await replay.initialize(); replay.consume(); await replay.finish(); replay.restartReplay();
  assert.equal(replay.sessionStartedAt, null); assert.equal(replay.netPositionMicro, null);
});
