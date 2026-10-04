import { buyBonus, createState, spin, validateBoard, WILD_ORDER, MAX_WIN_MULTIPLIER, SYMBOLS } from './engine';
import type { Board, FeatureMode, GameState, SpinResult } from './engine';
import { AlchemistRgs, API_SCALE, apiAmount, mathMode, RgsError, toApiAmount } from './rgs';
import type { RgsRound, RgsConfiguration } from './rgs';
import { loadReplay } from './rgs-replay';
import { MATH_MODES } from './math/types';
import type { MathBook, MathMode as ReleasedMathMode, PlayableMathMode as MathMode, UnitSpinResult } from './math/types';
import { SESSION_MODE_COST as MODE_COST, MATH_VERSION } from './math/config';
import { samplePublishedBook, loadMathCatalog } from './math/local';
import { COMPASS_MATH_VERSION, decodeCompassBook, localCompassEnabled, validateCompassPresentation, type CompassWireBook } from './compass-contract';
import { sampleCompassBook } from './compass-local';

export const ROUND_STORAGE_KEY = 'pirate-abyss.round-session.v2';
export const LOCAL_BETS = [.1, .2, .5, 1, 2, 5, 10, 20, 50, 100];
const BOOKMARK = 'pirate-abyss:v1:';
export interface SessionView { game: GameState; board: Board; feature: FeatureMode }
interface PendingRound { book: MathBook; mode: MathMode; betMicro: number; cursor: number; startTotalSpins: number; active: boolean; startedAt?: number; betID?: string }
interface Journal { version: string; courseVersion?: string; view: SessionView; pending: PendingRound | null; legacy: boolean }
interface Options { storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; request?: typeof fetch; sample?: (mode: ReleasedMathMode) => Promise<MathBook>; sampleCompass?: () => Promise<CompassWireBook>; preload?: () => Promise<unknown> }
const finite = (x: unknown, label: string) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new Error(`Повреждён исход: ${label}`); return x; };
const integer = (x: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER) => { const n = finite(x, label); if (!Number.isSafeInteger(n) || n > maximum) throw new Error(`Повреждён исход: ${label}`); return n; };
const gameMode = (x: unknown) => { if (!['base', 'devastation', 'reckoning', 'captains_course'].includes(x as string)) throw new Error('Повреждён режим исхода'); };
const wilds = (x: unknown) => { if (!Array.isArray(x) || x.some(v => !WILD_ORDER.includes(v))) throw new Error('Повреждены реагенты исхода'); };
function validateUnit(result: UnitSpinResult, index: number) {
  if (!result || !result.state) throw new Error('Отсутствует результат вращения');
  validateBoard(result.board);
  if (!Array.isArray(result.expandedBoard) || result.expandedBoard.length !== 6 || result.expandedBoard.some(col => !Array.isArray(col) || col.length !== 5)) throw new Error('Повреждена расширенная доска');
  for (const key of ['payout', 'cost', 'bonusTotalWin', 'uncappedPayout'] as const) finite(result[key], key);
  for (const key of ['bonusWin', 'roundWin', 'lastWin', 'lastBonusWin'] as const) finite(result.state[key], key);
  integer(result.extraSpins, 'extraSpins', 100); integer(result.scatters, 'scatters', 4);
  integer(result.state.freeSpins, 'freeSpins', 10000);
  if (result.state.totalSpins !== index + 1) throw new Error('Неверный порядок вращений');
  gameMode(result.state.mode); gameMode(result.playedMode);
  if (result.bonusTriggered !== null && !['devastation', 'reckoning'].includes(result.bonusTriggered)) throw new Error('Повреждён запуск бонуса');
  if (typeof result.bonusEnded !== 'boolean' || typeof result.capped !== 'boolean') throw new Error('Повреждён статус бонуса');
  wilds(result.activatedTypes); wilds(result.newlyActivatedTypes); wilds(result.state.activatedTypes);
  if (!Array.isArray(result.expandedReels) || new Set(result.expandedReels).size !== result.expandedReels.length || result.expandedReels.some(col => !Number.isInteger(col) || col < 1 || col > 4 || !result.board[col].some(cell => cell.id === 'wild'))) throw new Error('Повреждены раскрытия барабанов');
  const expectedExpanded = result.board.map((column, col) => result.expandedReels.includes(col) ? Array.from({ length: 5 }, () => column.find(cell => cell.id === 'wild')!) : column);
  if (result.expandedBoard.some((column, col) => column.some((cell, row) => !cell || cell.id !== expectedExpanded[col][row].id || cell.wildType !== expectedExpanded[col][row].wildType || cell.multiplier !== expectedExpanded[col][row].multiplier))) throw new Error('Раскрытая доска не совпадает с исходом');
  if (result.scatters !== result.board.flat().filter(cell => cell.id === 'scatter').length) throw new Error('Неверное число Scatter');
  if (!Array.isArray(result.wins)) throw new Error('Повреждены выигрышные линии');
  for (const win of result.wins) {
    if (!SYMBOLS.some(symbol => symbol.id === win.symbol)) throw new Error('Неизвестный символ выигрышной линии');
    integer(win.line, 'line', 18); integer(win.count, 'count', 6);
    finite(win.basePayout, 'basePayout'); finite(win.payout, 'linePayout'); finite(win.multiplier, 'multiplier');
    if (win.count < 3 || !Array.isArray(win.positions) || win.positions.length !== win.count || win.positions.some(p => !Number.isInteger(p.col) || p.col < 0 || p.col > 5 || !Number.isInteger(p.row) || p.row < 0 || p.row > 4)) throw new Error('Повреждены позиции линии');
  }
}
/** Validate the published result, never generate or reevaluate it on the client. */
export function validateBook(value: unknown): MathBook {
  const wire = value as { events?: { type?: string }[] } | null;
  if (Array.isArray(wire?.events) && wire.events[0]?.type === 'captainsCourseSpin') return validateBook(decodeCompassBook(value));
  const book = value as MathBook;
  if (!book || !Number.isSafeInteger(book.id) || book.id < 0 || !Number.isSafeInteger(book.payoutMultiplier) || book.payoutMultiplier < 0 || book.payoutMultiplier > MAX_WIN_MULTIPLIER * 100 || !Array.isArray(book.events) || !book.events.length || book.events.length > 10000) throw new Error('Повреждён полный раунд');
  let sum = 0, bonusSum = 0;
  book.events.forEach((event, index) => {
    if (event.index !== index || event.type !== 'alchemistSpin') throw new Error('Неизвестное событие раунда');
    validateUnit(event.result, index); sum += event.result.payout;
    const result = event.result;
    if (result.playedMode !== 'base') bonusSum += result.payout;
    if (Math.abs(result.bonusTotalWin - bonusSum) > .00001 || Math.abs(result.state.bonusWin - bonusSum) > .00001 || Math.abs(result.state.lastBonusWin - (result.bonusEnded ? bonusSum : 0)) > .00001) throw new Error('Итог бонуса не совпадает с событиями');
    const lineSum = result.wins.reduce((total, win) => total + win.payout, 0);
    if (Math.abs(lineSum - result.uncappedPayout) > .00001 || Math.abs(result.payout - Math.min(lineSum, MAX_WIN_MULTIPLIER - (sum - result.payout))) > .00001) throw new Error('Выигрыш не совпадает с линиями и лимитом');
    if (Math.abs(result.state.roundWin - sum) > .00001 || result.state.lastWin !== result.payout || result.capped !== (Math.round(sum * 100) >= MAX_WIN_MULTIPLIER * 100)) throw new Error('Состояние выплат не совпадает с событиями');
    if (result.bonusEnded !== (result.playedMode !== 'base' && result.state.mode === 'base') || result.state.mode === 'base' && result.state.freeSpins !== 0 || result.state.mode !== 'base' && result.state.freeSpins < 1) throw new Error('Некорректное завершение бонуса');
    if (index && event.result.playedMode !== book.events[index - 1].result.state.mode) throw new Error('Разорвана последовательность бонуса');
    if (index < book.events.length - 1 && event.result.state.mode === 'base') throw new Error('Раунд продолжается после завершения');
  });
  const last = book.events.at(-1)!.result;
  if (last.state.mode !== 'base' || last.state.freeSpins !== 0 || Math.abs(sum * 100 - book.payoutMultiplier) > .00001) throw new Error('Итог раунда не совпадает с событиями');
  return structuredClone(book);
}
function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(key => left[key] !== undefined), other = Object.keys(right).filter(key => right[key] !== undefined);
  return keys.length === other.length && keys.every(key => Object.hasOwn(right, key) && structurallyEqual(left[key], right[key]));
}
function validateBookMode(book: MathBook, mode: MathMode) {
  if (mode === 'captains_course') { validateCompassPresentation(book); return; }
  const purchased = mode === 'devastation' || mode === 'reckoning';
  let state = purchased ? buyBonus(createState(1_000_000, 1), mode) : createState(1_000_000, 1);
  const feature = roundFeature(mode);
  for (const event of book.events) {
    // A forced board bypasses every RNG branch: validate published data, never choose an outcome.
    const checked = spin(state, { forcedBoard: event.result.board, feature });
    state = checked.state;
    const { balance: _balance, bet: _bet, ...unitState } = checked.state;
    void _balance; void _bet;
    if (!structurallyEqual({ ...checked, state: unitState }, event.result)) throw new Error('Событие не соответствует правилам опубликованной математики');
  }
}
export function bookFromState(state: unknown, payoutMultiplier: number): MathBook {
  const object = state as { events?: unknown; id?: number } | null;
  const hundredths = Math.round(payoutMultiplier * 100);
  if (Math.abs(payoutMultiplier * 100 - hundredths) > .00001) throw new Error('Неизвестная точность множителя');
  return validateBook({ id: object && !Array.isArray(object) && Number.isSafeInteger(object.id) ? object.id : 0, payoutMultiplier: hundredths, events: Array.isArray(state) ? state : object?.events });
}
export function scaledMicro(units: number, betMicro: number): number { return apiAmount(Math.round(units * betMicro), 'выигрыша'); }
export function materialize(result: UnitSpinResult, betMicro: number, balanceMicro: number, totalOffset: number): SpinResult {
  const scale = (n: number) => scaledMicro(n, betMicro) / API_SCALE;
  return { ...structuredClone(result), payout: scale(result.payout), cost: scale(result.cost), bonusTotalWin: scale(result.bonusTotalWin), uncappedPayout: scale(result.uncappedPayout), wins: result.wins.map(win => ({ ...structuredClone(win), basePayout: scale(win.basePayout), payout: scale(win.payout) })), state: { ...structuredClone(result.state), bet: betMicro / API_SCALE, balance: balanceMicro / API_SCALE, bonusWin: scale(result.state.bonusWin), roundWin: scale(result.state.roundWin), lastWin: scale(result.state.lastWin), lastBonusWin: scale(result.state.lastBonusWin), totalSpins: totalOffset + result.state.totalSpins } };
}
export const featureMode = (feature: FeatureMode): MathMode => feature === 'standard' ? 'base' : feature;
const roundFeature = (mode: MathMode): FeatureMode => mode === 'bonushunt' || mode === 'catalysts' ? mode : 'standard';

/** One accepted paid round owns every subsequent free-spin event. Financial requests never retry. */
export class RoundSession {
  readonly live: boolean;
  readonly replay: boolean;
  readonly courseDev: boolean;
  currency = 'CR';
  config: RgsConfiguration | null = null;
  view: SessionView;
  lastResult: SpinResult | null = null;
  fault: Error | null = null;
  private pending: PendingRound | null = null;
  private replayOriginal: PendingRound | null = null;
  private legacy = false;
  private rgs: AlchemistRgs | null = null;
  private initializing: Promise<void> | null = null;
  private operating = false;
  // Read-only session display accounting. Never use this ledger for wallet
  // balances, outcomes, requests or affordability checks.
  private telemetryStartedAt: number | null = null;
  private telemetryCurrency: string | null = null;
  private telemetryUnavailable = false;
  private telemetryUnknownPlay = false;
  private telemetryUnknownSettlement: string | undefined;
  private telemetryNet = 0n;
  private readonly telemetryRounds = new Map<string, { cost: bigint; payout: bigint; settled: boolean }>();
  private readonly launchUrl: string;
  private readonly options: Options;
  constructor(initial: { game: GameState; board: Board; feature?: FeatureMode }, launchUrl: string, options: Options = {}) {
    this.launchUrl = launchUrl; this.options = options;
    const params = new URL(launchUrl).searchParams;
    this.replay = params.get('replay') === 'true';
    this.live = !this.replay && (params.has('sessionID') || params.has('rgs_url'));
    this.courseDev = localCompassEnabled(launchUrl);
    this.view = structuredClone({ ...initial, feature: initial.feature ?? 'standard' });
    if (this.live || this.replay) this.view.game = createState(0, 1);
    else {
      let raw: string | null | undefined;
      try { raw = options.storage?.getItem(ROUND_STORAGE_KEY); } catch { this.fault = new Error('Браузер запретил доступ к сохранённой игре'); }
      if (raw) {
        try {
          const data = JSON.parse(raw) as Journal;
          // v2–v4 only reweight unchanged complete books. An accepted round
          // owns its outcome: validate and finish it without another draw.
          const compatibleWeights = MATH_VERSION === 'alchemist-extreme-v4'
            && ['alchemist-extreme-v1', 'alchemist-extreme-v2', 'alchemist-extreme-v3'].includes(data.version);
          if (data.version !== MATH_VERSION && !compatibleWeights) throw new Error('Сохранённый раунд использует другую версию математики');
          if (!data.view || !['standard', 'bonushunt', 'catalysts'].includes(data.view.feature)) throw new Error('Повреждена сохранённая сессия');
          gameMode(data.view.game.mode); wilds(data.view.game.activatedTypes); integer(data.view.game.freeSpins, 'freeSpins', 10000);
          for (const key of ['bonusWin', 'roundWin', 'lastWin', 'lastBonusWin', 'totalSpins'] as const) finite(data.view.game[key], key);
          validateBoard(data.view.board); toApiAmount(data.view.game.bet); apiAmount(Math.round(data.view.game.balance * API_SCALE), 'сохранённого баланса');
          if (data.pending) { if (data.pending.mode === 'captains_course' && data.courseVersion !== COMPASS_MATH_VERSION) throw new Error('Сохранённый Compass использует другую версию математики'); data.pending.book = validateBook(data.pending.book); integer(data.pending.cursor, 'cursor', data.pending.book.events.length); mathMode(data.pending.mode); validateBookMode(data.pending.book, data.pending.mode); apiAmount(data.pending.betMicro, 'ставки', true); integer(data.pending.startTotalSpins, 'offset'); }
          this.view = data.view; this.pending = data.pending; this.legacy = data.legacy === true;
          if (this.pending?.cursor) { this.lastResult = this.resultAt(this.pending.cursor - 1); this.view = { ...this.view, game: this.lastResult.state, board: this.lastResult.board }; }
          else if (this.pending) this.resetRoundView(this.pending);
        } catch (error) { this.fault = error instanceof Error ? error : new Error('Не удалось восстановить раунд'); }
      } else this.legacy = initial.game.mode !== 'base';
    }
  }
  get betLevels() { return this.config ? this.config.betLevels.map(x => x / API_SCALE) : LOCAL_BETS; }
  get modes(): MathMode[] { return this.config?.modes ?? [...MATH_MODES, ...(this.courseDev ? ['captains_course' as const] : [])]; }
  get hasPending() { return Boolean(this.pending) || this.legacy; }
  get complete() { return Boolean(this.pending && this.pending.cursor === this.pending.book.events.length); }
  get replayFinished() { return this.replay && !this.pending && Boolean(this.replayOriginal); }
  get pendingMode() { return this.pending?.mode ?? this.replayOriginal?.mode; }
  get showCompassRules() { return this.modes.includes('captains_course') || this.pendingMode === 'captains_course'; }
  get sessionStartedAt() { return this.live ? this.telemetryStartedAt : null; }
  get netPositionMicro(): number | null {
    if (!this.live || this.telemetryStartedAt === null || this.telemetryUnavailable || this.telemetryUnknownPlay || this.telemetryUnknownSettlement || this.fault instanceof RgsError && this.fault.uncertain) return null;
    const maximum = BigInt(Number.MAX_SAFE_INTEGER);
    return this.telemetryNet > maximum || this.telemetryNet < -maximum ? null : Number(this.telemetryNet);
  }
  private observeTelemetryRound(round: RgsRound) {
    const cost = BigInt(round.amount) * BigInt(MODE_COST[round.mode]), payout = BigInt(round.payout);
    const existing = this.telemetryRounds.get(round.betID);
    if (existing) {
      if (existing.cost !== cost || existing.payout !== payout) this.telemetryUnavailable = true;
    } else {
      this.telemetryRounds.set(round.betID, { cost, payout, settled: false });
      this.telemetryNet -= cost;
    }
    if (!round.active) this.settleTelemetryRound(round.betID);
  }
  private settleTelemetryRound(betID: string | undefined) {
    const accepted = betID ? this.telemetryRounds.get(betID) : undefined;
    if (accepted && !accepted.settled) { this.telemetryNet += accepted.payout; accepted.settled = true; }
  }
  private save() {
    if (this.live || this.replay || !this.options.storage) return;
    // If durability fails, keep the accepted outcome in memory and stop; never silently resample.
    try { this.options.storage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: MATH_VERSION, ...(this.pending?.mode === 'captains_course' ? { courseVersion: COMPASS_MATH_VERSION } : {}), view: this.view, pending: this.pending, legacy: this.legacy } satisfies Journal)); }
    catch { const error = new Error('Браузер не сохранил раунд. Освободите место и перезагрузите игру'); this.fault = error; throw error; }
  }
  initialize(): Promise<void> {
    return this.initializing ??= (async () => {
      if (this.fault) throw this.fault;
      if (this.replay) {
        const replay = await loadReplay(this.launchUrl, this.options.request);
        this.currency = replay.currency;
        const pending: PendingRound = { book: bookFromState(replay.state, replay.payoutMultiplier), mode: replay.mode, betMicro: replay.betMicro, cursor: 0, startTotalSpins: 0, active: false };
        validateBookMode(pending.book, pending.mode);
        this.replayOriginal = structuredClone(pending); this.pending = pending; this.resetRoundView(pending);
      } else if (this.live) { this.rgs = new AlchemistRgs(this.launchUrl, this.options.request); await this.authenticate(); if (this.complete) await this.finish(); }
      else { await (this.options.preload ?? (() => loadMathCatalog('base')))(); if (this.complete) await this.finish(); this.save(); }
    })();
  }
  private resetRoundView(pending: PendingRound) {
    const mode = pending.mode === 'devastation' || pending.mode === 'reckoning' || pending.mode === 'captains_course' ? pending.mode : 'base';
    this.view = { ...this.view, feature: mode === 'base' ? roundFeature(pending.mode) : this.view.feature, game: { ...this.view.game, bet: pending.betMicro / API_SCALE, mode, freeSpins: mode === 'base' ? 0 : 10, bonusWin: 0, roundWin: 0, lastWin: 0, activatedTypes: [], courseTarget: mode === 'captains_course' ? 1 : undefined } };
    this.lastResult = null;
  }
  private resultAt(index: number) {
    const p = this.pending!;
    return materialize(p.book.events[index].result, p.betMicro, Math.round(this.view.game.balance * API_SCALE), p.startTotalSpins);
  }
  private installRound(round: RgsRound, balanceMicro: number) {
    const book = bookFromState(round.state, round.payoutMultiplier);
    validateBookMode(book, round.mode);
    if (scaledMicro(book.payoutMultiplier / 100, round.amount) !== round.payout) throw new Error('Серверный выигрыш не совпадает с полным раундом');
    let cursor = 0;
    if (round.event?.startsWith(BOOKMARK)) { const text = round.event.slice(BOOKMARK.length); if (!/^\d+$/.test(text)) throw new Error('Повреждена закладка раунда'); cursor = integer(Number(text), 'cursor', book.events.length); }
    this.pending = { book, mode: round.mode, betMicro: round.amount, cursor, startTotalSpins: 0, active: round.active, startedAt: Date.now(), betID: round.betID };
    this.view.game.balance = balanceMicro / API_SCALE; this.resetRoundView(this.pending);
    if (cursor) { this.lastResult = this.resultAt(cursor - 1); this.view = { ...this.view, game: this.lastResult.state, board: this.lastResult.board }; }
    this.observeTelemetryRound(round);
  }
  private async authenticate() {
    const previous = this.pending;
    const auth = await this.rgs!.authenticate();
    this.config = auth.config; this.currency = auth.balance.currency;
    this.pending = null; this.lastResult = null;
    this.view = { ...this.view, feature: 'standard', game: { ...createState(0, 1), balance: auth.balance.amount / API_SCALE, bet: auth.config.defaultBetLevel / API_SCALE } };
    if (!this.modes.includes('base')) this.view.feature = roundFeature(this.modes.find(mode => ['bonushunt', 'catalysts'].includes(mode)) ?? 'base');
    if (auth.round?.active) this.installRound(auth.round, auth.balance.amount);
    if (this.telemetryCurrency !== null && this.telemetryCurrency !== auth.balance.currency) this.telemetryUnavailable = true;
    this.telemetryCurrency ??= auth.balance.currency;
    if (previous?.active && previous.betID !== auth.round?.betID) {
      if (!auth.round && previous.cursor === previous.book.events.length && this.telemetryUnknownSettlement === previous.betID) {
        // The lost settlement reply did not authorize a retry. A subsequent
        // authoritative auth with no active round confirms it has closed.
        this.settleTelemetryRound(previous.betID);
      } else this.telemetryUnavailable = true;
    }
    // A lost play may have auto-settled with no replayable round returned by
    // auth. No betID/outcome means no trustworthy net total: do not infer it
    // from a wallet delta that can include outside transfers.
    if (this.telemetryUnknownPlay && !auth.round) this.telemetryUnavailable = true;
    this.telemetryUnknownPlay = false; this.telemetryUnknownSettlement = undefined;
    this.telemetryStartedAt ??= Date.now();
    this.fault = null;
  }
  async recover() {
    if (!this.live || !this.rgs || this.operating) throw new Error('Восстановление сейчас недоступно');
    this.operating = true;
    try { await this.authenticate(); } catch (error) { this.fault = error as Error; throw error; } finally { this.operating = false; }
  }
  async start(mode: MathMode, bet: number) {
    if (this.operating || this.hasPending || this.fault || this.replay) throw new Error('Сначала завершите текущий раунд');
    this.operating = true;
    try {
      const betMicro = toApiAmount(bet);
      if (!this.modes.includes(mode)) throw new Error('Режим недоступен');
      if (this.live) {
        // The last authenticated/settled wallet amount is authoritative. Reject
        // an unaffordable action locally, using the same integer units as RGS.
        const balanceMicro = apiAmount(Math.round(this.view.game.balance * API_SCALE), 'баланса');
        const cost = apiAmount(betMicro * MODE_COST[mode], 'цены ставки', true);
        if (balanceMicro < cost) throw new Error('Недостаточно средств');
        const startedAt = Date.now();
        const response = await this.rgs!.play(betMicro, mode);
        try {
          if (response.round.mode !== mode || response.round.amount !== betMicro) throw new Error('Сервер вернул другой режим или ставку');
          this.installRound(response.round, response.balance.amount); this.pending!.startedAt = startedAt; this.currency = response.balance.currency;
          if (this.telemetryCurrency !== response.balance.currency) this.telemetryUnavailable = true;
        } catch { throw new RgsError('Принятый раунд требует восстановления с сервера', 'play', true, 'INVALID_BOOK'); }
      } else {
        if (!LOCAL_BETS.includes(bet)) throw new Error('Недопустимая ставка');
        const balanceMicro = Math.round(this.view.game.balance * API_SCALE), cost = apiAmount(betMicro * MODE_COST[mode], 'цены ставки', true);
        if (balanceMicro < cost) throw new Error('Недостаточно средств');
        const book = validateBook(await (mode === 'captains_course' ? (this.options.sampleCompass ?? sampleCompassBook)() : (this.options.sample ?? samplePublishedBook)(mode)));
        validateBookMode(book, mode);
        this.pending = { book, mode, betMicro, cursor: 0, startTotalSpins: this.view.game.totalSpins, active: false };
        this.view.game.balance = (balanceMicro - cost) / API_SCALE; this.resetRoundView(this.pending); this.save();
      }
    } catch (error) { if (error instanceof RgsError && error.uncertain) { this.fault = error; this.telemetryUnknownPlay = true; } throw error; }
    finally { this.operating = false; }
  }
  /** Commit the fixed local outcome before its animation. Live credit is never calculated here. */
  consume(): SpinResult {
    if (this.operating) throw new Error('Дождитесь завершения операции раунда');
    if (this.fault) throw this.fault;
    if (this.legacy && !this.live && !this.replay) {
      const result = spin(this.view.game); this.view = { ...this.view, game: result.state, board: result.board }; this.legacy = result.state.mode !== 'base'; this.lastResult = result; this.save(); return result;
    }
    const p = this.pending;
    if (!p || p.cursor >= p.book.events.length) throw new Error('Нет следующего события раунда');
    const unit = p.book.events[p.cursor].result;
    const balanceMicro = Math.round(this.view.game.balance * API_SCALE) + (this.live || this.replay ? 0 : scaledMicro(unit.payout, p.betMicro));
    const result = materialize(unit, p.betMicro, balanceMicro, p.startTotalSpins);
    p.cursor++; this.lastResult = result; this.view = { ...this.view, game: result.state, board: result.board }; this.save(); return result;
  }
  /** RGS bookmarks are arbitrary strings. A failed bookmark pauses; recovery may replay visuals only. */
  async acknowledge() {
    if (!this.live || !this.pending?.active) return;
    try { await this.rgs!.event(`${BOOKMARK}${this.pending.cursor}`); }
    catch (error) { this.fault = error as Error; throw error; }
  }
  async finish() {
    if (!this.complete || this.operating) return;
    if (this.fault) throw this.fault;
    this.operating = true;
    try {
      if (this.live) {
        // Stake's jurisdiction.minimumRoundDuration is in milliseconds (official API example).
        const remaining = (this.config?.jurisdiction.minimumRoundDuration ?? 0) - (Date.now() - (this.pending!.startedAt ?? Date.now()));
        if (remaining > 0) await new Promise<void>(resolve => setTimeout(resolve, remaining));
      }
      if (this.live && this.pending!.active) { const balance = await this.rgs!.endRound(); this.view.game.balance = balance.amount / API_SCALE; this.currency = balance.currency; }
      if (this.live) { this.settleTelemetryRound(this.pending!.betID); if (this.telemetryCurrency !== this.currency) this.telemetryUnavailable = true; }
      this.pending = null; this.save();
    } catch (error) {
      if (error instanceof RgsError && error.operation === 'end-round' && error.uncertain) this.telemetryUnknownSettlement = this.pending?.betID;
      this.fault = error as Error; throw error;
    }
    finally { this.operating = false; }
  }
  setBet(bet: number) {
    if (this.operating || this.hasPending || this.replay || this.fault || !this.betLevels.includes(bet)) throw new Error('Ставка сейчас недоступна');
    if (this.live) this.rgs!.validateBet(toApiAmount(bet), featureMode(this.view.feature));
    this.view.game = { ...this.view.game, bet, lastWin: 0 }; this.save();
  }
  setFeature(feature: FeatureMode) {
    if (this.operating || this.hasPending || this.replay || this.fault || !this.modes.includes(featureMode(feature))) throw new Error('Режим сейчас недоступен');
    this.view.feature = feature; this.save();
  }
  resetLocal(board: Board) {
    if (this.operating || this.live || this.replay || this.hasPending) throw new Error('Нельзя сбросить текущую сессию');
    this.view = { game: createState(10000, 1), board, feature: 'standard' }; this.fault = null; this.lastResult = null; this.save();
  }
  restartReplay() {
    if (this.operating || !this.replay || !this.replayOriginal || this.pending) throw new Error('Повтор ещё не завершён');
    this.pending = structuredClone(this.replayOriginal); this.resetRoundView(this.pending); this.view.game.totalSpins = 0;
  }
}
