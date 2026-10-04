import type { AuthenticateConfig, JurisdictionFlags } from 'stake-engine';
import { MATH_MODES, PLAYABLE_MATH_MODES } from './math/types';
import type { PlayableMathMode as MathMode } from './math/types';
import { SESSION_MODE_COST as MODE_COST } from './math/config';

export const API_SCALE = 1_000_000;
export type RgsOperation = 'authenticate' | 'play' | 'end-round' | 'event';
export class RgsError extends Error {
  readonly operation: RgsOperation; readonly uncertain: boolean; readonly code: string;
  constructor(message: string, operation: RgsOperation, uncertain = false, code = 'NETWORK') { super(message); this.name = 'RgsError'; this.operation = operation; this.uncertain = uncertain; this.code = code; }
}
export interface RgsBalance { amount: number; currency: string }
export interface RgsRound { betID: string; amount: number; payout: number; payoutMultiplier: number; active: boolean; mode: MathMode; event?: string; state: unknown }
export interface RgsConfiguration extends AuthenticateConfig { jurisdiction: Partial<JurisdictionFlags>; modes: MathMode[] }
export interface RgsAuthentication { balance: RgsBalance; config: RgsConfiguration; round: RgsRound | null }
export interface RgsPlay { balance: RgsBalance; round: RgsRound }
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function apiAmount(value: unknown, label: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error(`Некорректная сумма ${label}`);
  return value;
}
export function toApiAmount(value: number): number {
  const result = Math.round(value * API_SCALE);
  if (!Number.isFinite(value) || Math.abs(value * API_SCALE - result) > .0001) throw new Error('Сумма содержит больше шести знаков после запятой');
  return apiAmount(result, 'ставки', true);
}
export function mathMode(value: unknown): MathMode {
  if (!PLAYABLE_MATH_MODES.includes(value as MathMode)) throw new Error('Сервер вернул неизвестный режим игры');
  return value as MathMode;
}
function balance(value: unknown): RgsBalance {
  const v = record(value);
  if (typeof v.currency !== 'string' || !/^[A-Z0-9]{2,10}$/.test(v.currency)) throw new Error('Сервер не сообщил валюту');
  return { amount: apiAmount(v.amount, 'баланса'), currency: v.currency };
}
function round(value: unknown): RgsRound {
  const v = record(value), id = v.betID;
  if (!(typeof id === 'string' && id.length > 0 || typeof id === 'number' && Number.isSafeInteger(id)) || typeof v.active !== 'boolean') throw new Error('Сервер вернул некорректный раунд');
  if (typeof v.payoutMultiplier !== 'number' || !Number.isFinite(v.payoutMultiplier) || v.payoutMultiplier < 0) throw new Error('Некорректный множитель раунда');
  return { betID: String(id), amount: apiAmount(v.amount, 'раунда', true), payout: apiAmount(v.payout, 'выигрыша'), payoutMultiplier: v.payoutMultiplier, active: v.active, mode: mathMode(v.mode), ...(typeof v.event === 'string' ? { event: v.event } : {}), state: v.state };
}
export function parseConfiguration(value: unknown): RgsConfiguration {
  const v = record(value), minBet = apiAmount(v.minBet, 'минимальной ставки', true), maxBet = apiAmount(v.maxBet, 'максимальной ставки', true), stepBet = apiAmount(v.stepBet, 'шага ставки', true);
  if (maxBet < minBet || !Array.isArray(v.betLevels) || !v.betLevels.length) throw new Error('Сервер не сообщил допустимые ставки');
  const betLevels = [...new Set(v.betLevels.map(x => apiAmount(x, 'уровня ставки', true)))].sort((a, b) => a - b);
  if (betLevels.some(x => x < minBet || x > maxBet || x % stepBet !== 0)) throw new Error('Некорректные уровни ставок');
  const defaultBetLevel = apiAmount(v.defaultBetLevel, 'ставки по умолчанию', true);
  if (!betLevels.includes(defaultBetLevel)) throw new Error('Ставка по умолчанию не разрешена сервером');
  let modes: MathMode[] = [...MATH_MODES];
  if (v.betModes !== undefined) {
    const configured = record(v.betModes);
    modes = PLAYABLE_MATH_MODES.filter(mode => Object.hasOwn(configured, mode));
    if (!modes.length) throw new Error('Нет совместимых режимов ставок');
    for (const mode of modes) {
      const cost = record(configured[mode]).costMultiplier ?? record(configured[mode]).cost;
      if ((mode === 'captains_course' || cost !== undefined) && cost !== MODE_COST[mode]) throw new Error(`Цена режима ${mode} не совпадает с математикой`);
    }
  }
  const jurisdiction = record(v.jurisdiction) as Partial<JurisdictionFlags>;
  for (const key of ['socialCasino', 'disabledFullscreen', 'disabledTurbo', 'disabledSuperTurbo', 'disabledAutoplay', 'disabledSlamstop', 'disabledSpacebar', 'disabledBuyFeature', 'displayNetPosition', 'displayRTP', 'displaySessionTimer'] as const) {
    if (jurisdiction[key] !== undefined && typeof jurisdiction[key] !== 'boolean') throw new Error('Некорректные ограничения сессии');
  }
  if (jurisdiction.minimumRoundDuration !== undefined) apiAmount(jurisdiction.minimumRoundDuration, 'минимальной длительности');
  return { minBet, maxBet, stepBet, defaultBetLevel, betLevels, modes, jurisdiction };
}
/** The SDK's protocol, types and units are retained; explicit fetch has no background poller or retry. */
export class AlchemistRgs {
  readonly baseUrl: string;
  private readonly sessionID: string;
  private readonly language: string;
  config: RgsConfiguration | null = null;
  private readonly request: typeof fetch;
  constructor(launchUrl: string, request: typeof fetch = fetch) {
    this.request = (...args) => request(...args);
    const launch = new URL(launchUrl), token = launch.searchParams.get('sessionID')?.trim(), host = launch.searchParams.get('rgs_url')?.trim();
    if (!token || !host) throw new Error('Для серверной игры необходимы sessionID и rgs_url');
    const endpoint = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Некорректный адрес RGS');
    if (endpoint.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('RGS должен использовать HTTPS');
    this.baseUrl = endpoint.href.replace(/\/$/, ''); this.sessionID = token; this.language = launch.searchParams.get('lang') || 'en';
  }
  private async post(operation: RgsOperation, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const financial = operation === 'play' || operation === 'end-round', controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await this.request(`${this.baseUrl}/${operation === 'event' ? 'bet/event' : `wallet/${operation}`}`, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionID: this.sessionID, ...payload }), signal: controller.signal });
      const data = record(await response.json());
      if (!response.ok) {
        const code = String(data.code ?? record(data.error).code ?? data.error ?? 'RGS_ERROR');
        const definite = response.status === 400 && ['ERR_VAL', 'ERR_IPB', 'ERR_IS', 'ERR_ATE', 'ERR_GLE', 'ERR_LOC'].includes(code);
        const messages: Record<string, string> = { ERR_IPB: 'Недостаточно средств', ERR_IS: 'Сессия истекла. Откройте игру заново', ERR_ATE: 'Сессия не авторизована', ERR_GLE: 'Достигнут игровой лимит', ERR_LOC: 'Игра недоступна для текущего местоположения', ERR_VAL: 'Сервер отклонил параметры ставки' };
        throw new RgsError(messages[code] ?? 'Не удалось получить подтверждение сервера', operation, financial && !definite, code);
      }
      return data;
    } catch (error) {
      if (error instanceof RgsError) throw error;
      throw new RgsError(financial ? 'Ответ сервера не получен. Ставка не будет отправлена повторно' : 'Не удалось связаться с сервером', operation, financial);
    } finally { clearTimeout(timeout); }
  }
  async authenticate(): Promise<RgsAuthentication> {
    const data = await this.post('authenticate', { language: this.language });
    this.config = parseConfiguration({ ...record(data.config), jurisdiction: record(data.config).jurisdiction ?? data.jurisdictionFlags });
    const activeRound = data.round == null || record(data.round).active === false ? null : round(data.round);
    if (activeRound?.mode === 'captains_course' && !this.config.modes.includes('captains_course')) throw new Error('Сервер не объявил поддержку Compass');
    return { balance: balance(data.balance), config: this.config, round: activeRound };
  }
  validateBet(amount: number, mode: MathMode) {
    const c = this.config;
    if (!c) throw new Error('Сессия ещё не авторизована');
    apiAmount(amount, 'ставки', true);
    if (amount < c.minBet || amount > c.maxBet || amount % c.stepBet || !c.betLevels.includes(amount)) throw new Error('Эта ставка не разрешена сервером');
    if (!c.modes.includes(mode)) throw new Error('Этот режим не разрешён сервером');
    if (c.jurisdiction.disabledBuyFeature && (mode === 'devastation' || mode === 'reckoning' || mode === 'captains_course')) throw new Error('Покупка бонуса отключена для этой сессии');
  }
  async play(amount: number, mode: MathMode): Promise<RgsPlay> {
    this.validateBet(amount, mode);
    const data = await this.post('play', { amount, mode });
    try { return { balance: balance(data.balance), round: round(data.round) }; }
    catch { throw new RgsError('Сервер принял запрос, но результат не удалось прочитать', 'play', true, 'INVALID_RESULT'); }
  }
  async endRound(): Promise<RgsBalance> {
    const data = await this.post('end-round');
    try { return balance(data.balance); }
    catch { throw new RgsError('Завершение раунда требует проверки баланса', 'end-round', true, 'INVALID_BALANCE'); }
  }
  async event(value: string): Promise<void> {
    const data = await this.post('event', { event: value });
    if (data.event !== value) throw new RgsError('Сервер не подтвердил позицию раунда', 'event');
  }
}
